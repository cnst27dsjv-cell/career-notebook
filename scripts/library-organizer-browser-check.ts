import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { db } from "../lib/db";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { POST } = await import("../app/api/library-organizer/route");
const signup = await auth.api.signUpEmail({
  body: {
    email: `organizer-${randomUUID()}@career.local`,
    password: randomBytes(20).toString("hex"),
    name: "整理验收",
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
const originalFetch = globalThis.fetch;
let generatedItemCount = 3;
process.env.TEXT_MODEL_BASE_URL = "https://organizer-check.invalid";
process.env.TEXT_MODEL_API_KEY = "test-only";
process.env.TEXT_MODEL_NAME = "test-only";
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://organizer-check.invalid")) {
    const result = {
      items: [
        {
          type: "question",
          title: "如何核验数据？",
          answer: "我核对底层数据。",
          context: "在项目中",
          feedback: "建议补充核验依据",
          quote: "我核对底层数据。",
          category: "通用问题",
          roleScope: "",
        },
        {
          type: "experience",
          title: "数据核验经历",
          answer: "行动：核对底层数据。结果：待补充。",
          context: "实习",
          feedback: "",
          quote: "我核对底层数据。",
          category: "通用问题",
          roleScope: "",
        },
        {
          type: "knowledge",
          title: "交叉核验方法",
          answer: "交叉核验需要来源。",
          context: "",
          feedback: "",
          quote: "交叉核验需要来源。",
          category: "通用问题",
          roleScope: "",
        },
      ],
    };
    while (result.items.length < generatedItemCount) {
      result.items.push({
        ...result.items[0],
        title: `追加练习问题 ${result.items.length + 1}`,
      });
    }
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(result) } },
      ],
    });
  }
  return originalFetch(url, init);
};
let server: Awaited<ReturnType<typeof createServer>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const entry = `import React,{useState,useEffect} from 'react';import{createRoot}from'react-dom/client';import Preparations from '/components/preparations.tsx';import{Context}from'/components/context.tsx';import'/app/globals.css';function App(){const[data,setData]=useState(null);async function refresh(){setData(await(await fetch('/api/data')).json())}useEffect(()=>{refresh()},[]);return data?<Context.Provider value={{data,refresh,notify:alert,mutate:async()=>{},mutateOptimistic:async()=>{}}}><Preparations/></Context.Provider>:null}createRoot(document.getElementById('root')).render(<App/>);`;
  server = await createServer({
    configFile: false,
    cacheDir: "06_临时文件/organizer-vite-cache",
    resolve: { alias: { "@": process.cwd() } },
    plugins: [
      react(),
      {
        name: "organizer-check",
        configureServer(s) {
          s.middlewares.use(async (req, res, next) => {
            if (req.url === "/") {
              res.setHeader("Content-Type", "text/html");
              res.end(
                await s.transformIndexHtml(
                  "/",
                  '<meta name="viewport" content="width=device-width,initial-scale=1"><main style="padding:24px"><div id="root"></div></main><script type="module" src="/organizer-check-entry.jsx"></script>',
                ),
              );
              return;
            }
            if (req.url === "/api/data") {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  applications: [],
                  events: [],
                  resumes: [],
                  preparations: [],
                  interviews: [],
                  materialRoles: [],
                  files: [],
                  services: {},
                  materials: await db.material.findMany({
                    where: { userId: uid, archived: false },
                  }),
                }),
              );
              return;
            }
            if (req.url !== "/api/library-organizer") return next();
            try {
              const chunks: Buffer[] = [];
              for await (const c of req) chunks.push(c);
              const r = await POST(
                new Request("http://127.0.0.1:3040/api/library-organizer", {
                  method: "POST",
                  headers: { cookie, "content-type": "application/json" },
                  body: Buffer.concat(chunks).toString(),
                }),
              );
              res.statusCode = r.status;
              res.setHeader("Content-Type", "application/json");
              res.end(await r.text());
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(e) }));
            }
          });
        },
        resolveId(id) {
          if (
            id === "/organizer-check-entry.jsx" ||
            id === resolve("organizer-check-entry.jsx")
          )
            return resolve("organizer-check-entry.jsx");
        },
        load(id) {
          if (id === resolve("organizer-check-entry.jsx")) return entry;
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("button", { name: /原始文档/ }).click();
  await page
    .getByRole("button", { name: "导入 Word / 文字", exact: true })
    .click();
  await page.getByLabel("文档名称").fill("综合面试记录");
  await page.getByLabel("粘贴文字 / 核对完整原文").focus();
  await page.keyboard.insertText("长原文".repeat(33336) + "末尾保留标记");
  assert.equal(
    (await page.getByLabel("粘贴文字 / 核对完整原文").inputValue()).endsWith(
      "末尾保留标记",
    ),
    true,
    "Long pasted source must retain its ending",
  );
  await expect(
    page.getByRole("button", { name: "保存原文并开始整理" }),
  ).toBeDisabled();
  await page
    .getByLabel("粘贴文字 / 核对完整原文")
    .fill(
      "问题：如何核验数据？\n我核对底层数据。\n建议补充核验依据\n交叉核验需要来源。",
    );
  await page.getByRole("button", { name: "保存原文并开始整理" }).click();
  await page
    .getByRole("button", { name: "AI 拆分本次原文", exact: true })
    .click();
  await expect(page.locator(".organizer-item")).toHaveCount(3);
  await page
    .getByLabel("我的原回答（可留空）")
    .fill("我逐项核对底层数据，并记录差异。");
  await page.getByRole("checkbox", { name: "条目 3" }).uncheck();
  await page.getByRole("button", { name: "确认选中条目入库" }).click();
  await expect(page.getByRole("status")).toContainText("选中条目已入库");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "查看原文 / 继续整理" }).click();
  await expect(
    page.getByRole("checkbox", { name: "条目 3" }),
  ).not.toBeChecked();
  await page.getByRole("checkbox", { name: "条目 3" }).check();
  await page.getByRole("button", { name: "确认选中条目入库" }).click();
  await expect(page.getByRole("status")).toContainText("选中条目已入库");
  await page.getByRole("button", { name: "标记整理完成" }).click();
  await expect(page.getByRole("status")).toContainText("已标记整理完成");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(page.getByText("已整理", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "练习库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "如何核验数据？" }),
  ).toBeVisible();
  await expect(
    page.getByText("我逐项核对底层数据，并记录差异。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "＋ 追加回答版本" }).click();
  await page
    .getByLabel("我的回答", { exact: true })
    .fill("第二次练习：我对照来源逐项核验。");
  await page.getByRole("button", { name: "保存新回答，保留旧版本" }).click();
  await expect(
    page.getByText("第二次练习：我对照来源逐项核验。", { exact: true }),
  ).toBeVisible();
  await page.getByText(/回答版本 1 ·/).click();
  await expect(
    page.getByText("我逐项核对底层数据，并记录差异。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /查看来源原文/ }).click();
  await expect(page.locator(".organizer-source")).toContainText(
    "我核对底层数据。",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  assert.equal(
    await page
      .locator(".modal")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    true,
  );
  await page.screenshot({ path: "06_临时文件/library-organizer-mobile.png" });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "练习库", exact: true }).click();
  await expect(
    page.getByText("第二次练习：我对照来源逐项核验。", { exact: true }),
  ).toBeVisible();
  const materials = await db.material.findMany({ where: { userId: uid } });
  assert.equal(materials.length, 4);
  assert.equal(
    (materials.find((m) => m.format === "question")!.structure as any).answers
      .length,
    2,
  );
  assert(
    !materials
      .find((m) => m.format === "document")!
      .content.includes("第二次练习"),
  );
  assert.deepEqual(errors, []);
  const { POST: saveData } = await import("../app/api/data/route");
  const original = materials.find((m) => m.format === "document")!;
  const values = {
    title: "重命名原文",
    content: original.content,
    category: "待确认",
    kind: "边界或分类待确认",
    source: original.source,
  };
  const metadataResponse = await saveData(
    new Request("http://127.0.0.1:3040/api/data", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "material.save",
        id: original.id,
        version: original.version,
        values,
      }),
    }),
  );
  assert.equal(metadataResponse.status, 200);
  const renamed = await db.material.findUniqueOrThrow({
    where: { id: original.id },
  });
  assert.equal(
    (renamed.structure as any).complete,
    true,
    "Renaming a document must keep organizing progress",
  );
  const contentResponse = await saveData(
    new Request("http://127.0.0.1:3040/api/data", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "material.save",
        id: original.id,
        version: renamed.version,
        values: { ...values, content: "修改后的原文" },
      }),
    }),
  );
  assert.equal(contentResponse.status, 200);
  assert.deepEqual(
    (await db.material.findUniqueOrThrow({ where: { id: original.id } }))
      .structure,
    {},
  );
  assert.equal(
    await db.material.count({ where: { userId: uid, format: "question" } }),
    1,
  );
  const longText =
    "我核对底层数据。\n交叉核验需要来源。\n\n" +
    "长文第一部分。".repeat(2200) +
    "\n\n" +
    "剩余原文。".repeat(3000);
  const filename = "UBS瑞银_" + "interview".repeat(20) + ".md";
  const displaySource = `Obsidian:interview preparation/${filename}`;
  const longResponse = await POST(
    new Request("http://127.0.0.1:3040/api/library-organizer", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        title: "长文分段回归",
        content: longText,
        source: `Obsidian:${encodeURIComponent("interview preparation")}/${encodeURIComponent(filename)}`,
      }),
    }),
  );
  assert.equal(longResponse.status, 200);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /原始文档/ }).click();
  const longCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: "长文分段回归" }) });
  await expect(longCard.locator(".organizer-source-label")).toHaveText(
    displaySource,
  );
  await longCard.getByRole("button", { name: "查看原文 / 继续整理" }).click();
  await expect(
    page.locator(".organizer-original .organizer-source-label"),
  ).toHaveText(displaySource + " · v1");
  const splitButton = page.getByRole("button", {
    name: "AI 拆分本次原文",
    exact: true,
  });
  await expect(splitButton).toBeEnabled();
  await expect(page.getByLabel("选择整理段落")).toHaveValue("0");
  await page
    .getByText("分段整理 / 查看本次发送给 AI 的内容", { exact: true })
    .click();
  const segmentField = page.getByLabel("本次整理片段");
  const firstSegment = await segmentField.inputValue();
  assert(firstSegment.length <= 24000 && firstSegment.length > 0);
  await page.getByLabel("选择整理段落").selectOption("1");
  assert.equal(firstSegment + (await segmentField.inputValue()), longText);
  await segmentField.fill("不在原文内的内容");
  await expect(splitButton).toBeDisabled();
  await expect(page.locator("#organizer-split-reason")).toContainText(
    "连续内容",
  );
  await segmentField.fill(longText);
  await expect(splitButton).toBeDisabled();
  await expect(page.locator("#organizer-split-reason")).toContainText(
    "超过 24000 字",
  );
  await page.getByLabel("选择整理段落").selectOption("0");
  await expect(splitButton).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page
        .locator(".organizer-original")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
    );
    assert.equal(
      await page
        .locator(".modal")
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
    );
  }
  generatedItemCount = 21;
  await splitButton.click();
  await expect(page.locator(".organizer-item")).toHaveCount(21);
  await expect(page.locator("#organizer-split-reason")).toContainText(
    "核对并入库当前候选",
  );
  await expect(page.locator(".organizer-source")).toHaveText(longText);
  await page.screenshot({
    path: "06_临时文件/library-organizer-long-mobile.png",
  });
  await page.getByRole("button", { name: "确认选中条目入库" }).click();
  await expect(page.getByRole("status")).toContainText("选中条目已入库");
  const longDocument = await db.material.findFirstOrThrow({
    where: { userId: uid, title: "长文分段回归", format: "document" },
  });
  assert.equal(longDocument.content, longText);
  assert.equal((longDocument.structure as any).items.length, 21);
  assert.equal(
    await db.material.count({
      where: { userId: uid, parentId: longDocument.id },
    }),
    21,
  );
  await expect(splitButton).toBeEnabled();
  console.log(
    "PASS 21 AI candidates: displayed in full, confirmed into library, original retained",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS long document: readable source, no overflow, automatic segments, enabled AI split, actionable disabled reasons, intact original",
  );
  console.log(
    "PASS Chrome: import original → AI preview → field editing → partial confirmation → resume → complete → answer versions → source → reload → 390px layout",
  );
} finally {
  globalThis.fetch = originalFetch;
  await browser?.close();
  await server?.close();
  await db.material.deleteMany({ where: { userId: uid } });
  await db.user.delete({ where: { id: uid } });
  await db.$disconnect();
}
