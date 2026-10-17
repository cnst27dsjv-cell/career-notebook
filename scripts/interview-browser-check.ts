import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { db } from "../lib/db";
import { handleInterview } from "../lib/interview-service";
import { importMaterialNote } from "../lib/material-notes";

const uid = `browser-interview-${randomUUID()}`;
const originalFetch = globalThis.fetch;
process.env.TEXT_MODEL_BASE_URL = "https://browser-interview.invalid";
process.env.TEXT_MODEL_API_KEY = "test-only";
process.env.TEXT_MODEL_NAME = "test-only";
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith("https://browser-interview.invalid")) {
    const prompt = JSON.parse(String(init?.body)).messages[0].content;
    const result = prompt.includes("复盘本次")
      ? { review: "证据仍需补充，下一次练习核验方法" }
      : prompt.includes("提出一道")
        ? { question: "如何确认数据来源？", basis: "根据回答追问" }
        : prompt.includes("具体反馈和建议稿")
          ? {
              content: "我负责核对材料并记录差异。",
              feedback: "应明确核验依据",
            }
          : {
              questions: [
                {
                  question: "介绍你的工作职责",
                  sourceIds: [],
                  basis: "推测练习题",
                },
                {
                  question: "如何处理异常",
                  sourceIds: [],
                  basis: "推测练习题",
                },
              ],
            };
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(result) } },
      ],
    });
  }
  return originalFetch(input, init);
};
await db.preparation.create({
  data: {
    id: uid,
    userId: uid,
    company: "验收公司",
    role: "运营",
    round: "二面",
    jd: "需要细致核验",
  },
});
async function data() {
  return {
    preparations: await db.preparation.findMany({ where: { userId: uid } }),
    interviews: await db.interview.findMany({ where: { userId: uid } }),
    materials: await db.material.findMany({ where: { userId: uid } }),
    materialRoles: [],
    applications: [],
    events: [],
    resumes: [],
    files: [],
    services: { search: true, model: true },
    settings: {},
    user: { name: "测试" },
  };
}
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Preparations from '/components/preparations.tsx';import{Context}from'/components/context.tsx';import'/app/globals.css';function App(){const[data,setData]=React.useState(null);const[show,setShow]=React.useState(true);const acceptInterview=s=>setData(d=>({...d,interviews:[s,...d.interviews.filter(i=>i.id!==s.id)]}));const refresh=async()=>setData(await(await fetch('/api/data')).json());React.useEffect(()=>{refresh()},[]);return data&&<Context.Provider value={{data,refresh,acceptInterview,notify:()=>{},mutate:async()=>{}}}><button onClick={()=>setShow(!show)}>切换测试页面</button>{show&&<Preparations/>}</Context.Provider>}createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({
  configFile: false,
  resolve: { alias: { "@": process.cwd() } },
  plugins: [
    react(),
    {
      name: "interview-fixture",
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await s.transformIndexHtml(
              "/",
              '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main style="padding:24px"><div id="root"></div></main><script type="module" src="/interview-check-entry.jsx"></script></body></html>',
            ),
          );
        });
      },
      resolveId(id) {
        if (
          id === "/interview-check-entry.jsx" ||
          id === resolve("interview-check-entry.jsx")
        )
          return resolve("interview-check-entry.jsx");
      },
      load(id) {
        if (id === resolve("interview-check-entry.jsx")) return entry;
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", async (route) => {
    try {
      const path = new URL(route.request().url()).pathname;
      const payload =
        route.request().method() === "POST"
          ? route.request().postDataJSON()
          : {};
      const result =
        path === "/api/data"
          ? await data()
          : path === "/api/interviews"
            ? await handleInterview(uid, payload)
            : await importMaterialNote(uid, payload);
      await route.fulfill({ json: result });
    } catch (e) {
      await route.fulfill({
        status: 400,
        json: { error: (e as Error).message },
      });
    }
  });
  const address = server.httpServer!.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}`);
  await page
    .getByRole("button", { name: "连接 Obsidian / 导入 Markdown" })
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "以前的面试.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "# 旧智能体面试\n用户：我负责整理台账。\n助理：请解释核验流程。",
      ),
    });
  await page.getByLabel("以前的面试.md", { exact: true }).check();
  await page.getByRole("button", { name: "预览选中的笔记" }).click();
  await page.getByRole("button", { name: /确认导入 \/ 更新 1/ }).click();
  await expect(page.getByRole("status")).toContainText("已处理 1 篇");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: /二面 验收公司/ }).click();
  await page
    .getByRole("button", { name: "调研并模拟面试", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /以前的面试/ }).check();
  await page.getByRole("button", { name: "仅根据 JD 和所选资料出题" }).click();
  await page.getByRole("button", { name: "确认题目，开始练习" }).click();
  const answer = page.getByRole("textbox", { name: /你的回答/ });
  await answer.fill("我核对台账并标记差异");
  await expect(page.getByRole("status")).toHaveText("回答已保存");
  await page.getByRole("button", { name: "反馈并生成建议稿" }).click();
  await expect(page.getByText("应明确核验依据", { exact: true })).toBeVisible();
  await page.getByLabel("保存方式").selectOption("");
  await page
    .getByRole("button", { name: "确认保存到练习库", exact: true })
    .click();
  await expect(page.getByText("已保存到资料库", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "围绕我的回答追问" }).click();
  await expect(
    page.getByRole("heading", { name: "如何确认数据来源？" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: /你的回答/ })
    .fill("与原始文件交叉验证");
  await expect(page.getByRole("status")).toHaveText("回答已保存");
  await page.getByRole("button", { name: "结束并生成整场复盘" }).click();
  await expect(
    page.getByRole("heading", { name: "整场复盘", exact: true }),
  ).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown / Obsidian" }).click();
  assert((await downloading).suggestedFilename().endsWith(".md"));
  await page.getByRole("button", { name: "返回面试准备" }).click();
  await page.getByRole("button", { name: /继续第 1 次练习/ }).click();
  await expect(page.getByRole("textbox", { name: /你的回答/ })).toHaveValue(
    "与原始文件交叉验证",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "06_临时文件/interview-library-mobile.png",
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "mobile horizontal overflow",
  );
  // Switching away inside the debounce must flush the draft and update shared session state.
  await page
    .getByRole("textbox", { name: /你的回答/ })
    .fill("切换页面前的新回答");
  await page.getByRole("button", { name: "切换测试页面" }).click();
  await expect
    .poll(async () => {
      const row = await db.interview.findFirst({ where: { userId: uid } });
      return (row?.turns as any[])?.[1]?.answer;
    })
    .toBe("切换页面前的新回答");
  await page.getByRole("button", { name: "切换测试页面" }).click();
  await page.getByRole("button", { name: /二面 验收公司/ }).click();
  await page.getByRole("button", { name: /继续第 1 次练习/ }).click();
  await expect(page.getByRole("textbox", { name: /你的回答/ })).toHaveValue(
    "切换页面前的新回答",
  );
  const materials = await db.material.findMany({ where: { userId: uid } });
  assert.equal(materials.length, 2);
  assert(materials.find((m) => m.format === "document")!.content.includes("旧智能体面试"));
  assert(materials.find((m) => m.format === "question")!.content.includes("我负责核对材料"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Chrome real components + local database: Markdown import, selected context, editable questions, autosave, feedback, save structured question, preserve original, followup, whole review, export, resume progress, mobile width",
  );
} finally {
  await browser.close();
  await server.close();
  globalThis.fetch = originalFetch;
  await db.interview.deleteMany({ where: { userId: uid } });
  await db.material.deleteMany({ where: { userId: uid } });
  await db.preparation.deleteMany({ where: { userId: uid } });
  await db.$disconnect();
}
