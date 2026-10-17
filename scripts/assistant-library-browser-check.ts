import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "@playwright/test";
import { db } from "../lib/db";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { GET, POST } = await import("../app/api/assistant/route");
const email = `library-${randomUUID()}@career.local`;
const signup = await auth.api.signUpEmail({
  body: {
    email,
    password: randomBytes(20).toString("hex"),
    name: "资料检索验收",
  },
  asResponse: true,
});
assert.equal(signup.status, 200);
const { user } = await signup.json();
const uid = user.id;
const cookie = signup.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
assert.ok(cookie);
let payload: any;
const originalFetch = globalThis.fetch;
process.env.TEXT_MODEL_BASE_URL = "https://library-check.invalid";
process.env.TEXT_MODEL_API_KEY = "test-only";
process.env.TEXT_MODEL_NAME = "test-only";
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://library-check.invalid")) {
    payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content);
    const material = payload.context.materials[0];
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: JSON.stringify({
              reply: material
                ? `根据《${material.title}》记载：${material.content}。这是原笔记中的待确认经历。`
                : "本轮未检索到相关笔记，请提供更具体的关键词。",
              actions: [],
              sourceIds: material ? [material.id] : [],
            }),
          },
        },
      ],
    });
  }
  return originalFetch(url, init);
};
let server: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const note = await db.material.create({
    data: {
      userId: uid,
      title: "华泰资管复盘",
      content: "我在ABS核验中记录三项待补材料。",
      source: "Obsidian:面试库/华泰.md",
    },
  });
  const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Assistant from '/components/assistant.tsx';import{Context}from'/components/context.tsx';import'/app/globals.css';createRoot(document.getElementById('root')).render(<Context.Provider value={{data:{},refresh:async()=>{},notify:()=>{},mutate:async()=>{}}}><Assistant/></Context.Provider>);`;
  server = await createServer({
    configFile: false,
    cacheDir: "06_临时文件/library-vite-cache",
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      react(),
      {
        name: "library-check",
        configureServer(s) {
          s.middlewares.use(async (req, res, next) => {
            if (req.url === "/") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await s.transformIndexHtml(
                  "/",
                  '<meta name="viewport" content="width=device-width,initial-scale=1"><main style="padding:24px"><div id="root"></div></main><script type="module" src="/library-check-entry.jsx"></script>',
                ),
              );
              return;
            }
            if (!req.url?.startsWith("/api/assistant")) return next();
            try {
              const chunks: Buffer[] = [];
              for await (const c of req) chunks.push(c);
              const request = new Request(`http://127.0.0.1:3040${req.url}`, {
                method: req.method,
                headers: { cookie, "content-type": "application/json" },
                ...(req.method === "POST"
                  ? { body: Buffer.concat(chunks).toString() }
                  : {}),
              });
              const response = await (req.method === "POST"
                ? POST(request)
                : GET(request));
              res.statusCode = response.status;
              res.setHeader("content-type", "application/json");
              res.end(await response.text());
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        },
        resolveId(id) {
          if (
            id === "/library-check-entry.jsx" ||
            id === resolve("library-check-entry.jsx")
          )
            return resolve("library-check-entry.jsx");
        },
        load(id) {
          if (id === resolve("library-check-entry.jsx")) return entry;
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}`, {
    waitUntil: "domcontentloaded",
  });
  const textarea = page.locator("textarea").first();
  await textarea.fill("帮我梳理华泰资管的ABS项目经历");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByText("本次自动查阅的笔记（1 篇）").click();
  await page
    .locator("summary")
    .filter({ hasText: "华泰资管复盘 · v1" })
    .click();
  assert.ok(
    await page
      .getByText("Obsidian:面试库/华泰.md", { exact: false })
      .isVisible(),
  );
  assert.match(payload.context.materials[0].content, /三项/);
  const first = await db.draft.findFirstOrThrow({ where: { userId: uid } });
  const evidence = (first.result as any).materialEvidence[0];
  assert.equal(evidence.content, payload.context.materials[0].content);
  await db.material.update({
    where: { id: note.id },
    data: {
      content: "我在ABS核验中记录四项待补材料。",
      version: { increment: 1 },
    },
  });
  await textarea.fill("这段怎么讲");
  await page.getByRole("button", { name: "发送消息", exact: true }).click();
  await page.getByText("本次自动查阅的笔记（1 篇）").nth(1).waitFor();
  assert.equal(payload.context.materials[0].version, 2);
  assert.match(payload.context.materials[0].content, /四项/);
  assert.match(evidence.content, /三项/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("本次自动查阅的笔记（1 篇）").nth(1).waitFor();
  assert.equal(await page.getByText("本次自动查阅的笔记（1 篇）").count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByText("本次自动查阅的笔记（1 篇）").last().click();
  await page
    .locator("summary")
    .filter({ hasText: "华泰资管复盘 · v2" })
    .click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real authenticated assistant route + Chrome: automatic note context, evidence display, latest update, follow-up retrieval, persisted old evidence, mobile layout",
  );
} finally {
  await browser?.close();
  await server?.close();
  globalThis.fetch = originalFetch;
  await db.draft.deleteMany({ where: { userId: uid } });
  await db.assistantMessage.deleteMany({ where: { userId: uid } });
  await db.assistantConversation.deleteMany({ where: { userId: uid } });
  await db.assistantUsage.deleteMany({ where: { userId: uid } });
  await db.material.deleteMany({ where: { userId: uid } });
  await db.user.delete({ where: { id: uid } });
  await db.$disconnect();
}
