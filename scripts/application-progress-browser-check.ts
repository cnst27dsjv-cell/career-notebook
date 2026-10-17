import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const applications = [
  ["小红书示例", "测评", "等待结果", ""],
  ["银行示例", "已投递", "等待结果", ""],
  ["面试示例", "面试", "待完成", ""],
  ["终止示例", "笔试", "待安排", "未通过"],
  ["新机会示例", "待投递", "待安排", ""],
  ["录用示例", "Offer", "等待结果", "录用已接受"],
].map(([company, stage, stageStatus, outcome], i) => ({
  id: String(i),
  company,
  stage,
  stageStatus,
  outcome,
  role: "2027 Graduate Programme — 产品与策略培训生",
  city: "上海，北京",
  batch: "2027 届秋招",
  appliedAt: stage === "待投递" ? null : "2026-10-17T18:00:00Z",
  history: [],
  updatedAt: "2026-10-18T01:00:00Z",
  version: 1,
  resumeId: null,
  url: "",
  jd: "",
  notes: "",
}));
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Applications from '/components/applications.tsx';import{Context}from'/components/context.tsx';import'/app/globals.css';function App(){const[applications,setApplications]=useState(${JSON.stringify(applications)});window.completeAssessment=()=>setApplications(items=>items.map(a=>a.id==='2'?{...a,stage:'测评',stageStatus:'等待结果'}:a));return <Context.Provider value={{data:{applications,events:[],resumes:[],preparations:[],interviews:[],materials:[],materialRoles:[],files:[],services:{}},refresh:async()=>{},notify:()=>{},mutate:async()=>{},mutateOptimistic:async()=>{}}}><Applications/></Context.Provider>}createRoot(document.getElementById('root')).render(<App/>);`;
const server = await createServer({
  configFile: false,
  cacheDir: "06_临时文件/application-progress-vite-cache",
  resolve: { alias: { "@": process.cwd() } },
  plugins: [
    react(),
    {
      name: "application-progress-check",
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await s.transformIndexHtml(
              "/",
              '<meta name="viewport" content="width=device-width,initial-scale=1"><main style="padding:24px;max-width:1400px;margin:auto"><div id="root"></div></main><script type="module" src="/progress-check.jsx"></script>',
            ),
          );
        });
      },
      resolveId(id) {
        if (
          id === "/progress-check.jsx" ||
          id === resolve("progress-check.jsx")
        )
          return resolve("progress-check.jsx");
      },
      load(id) {
        if (id === resolve("progress-check.jsx")) return entry;
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${(server.httpServer!.address() as { port: number }).port}`,
  );
  await expect(page.locator(".application-progress")).toHaveCount(6);
  const completed = page.getByRole("list", { name: "小红书示例投递进度" });
  await expect(completed.locator('[aria-current="step"]')).toHaveClass(
    /is-done/,
  );
  await expect(completed.locator(".progress-note").nth(1)).toHaveText("10/18");
  const interview = page.getByRole("list", { name: "面试示例投递进度" });
  await expect(interview.locator(".is-unrecorded")).toHaveCount(2);
  await page.screenshot({
    path: "06_临时文件/application-progress-desktop.png",
    fullPage: true,
  });
  const row = page.locator(".table-row").filter({ hasText: "小红书示例" });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".modal")).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.evaluate(() => (window as any).completeAssessment());
  await expect(interview.locator('[aria-current="step"]')).toContainText(
    "测评",
  );
  await expect(interview.locator('[aria-current="step"]')).toHaveClass(
    /is-done/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  for (const progress of await page.locator(".application-progress").all()) {
    assert(await progress.evaluate((e) => e.scrollWidth <= e.clientWidth));
    await expect(progress.locator("li")).toHaveCount(6);
  }
  await page.screenshot({
    path: "06_临时文件/application-progress-mobile.png",
    fullPage: false,
  });
  await page.getByRole("textbox", { name: "搜索公司或岗位" }).fill("小红书");
  await expect(page.locator(".application-progress")).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/mobile: stage completion, unknown steps, date, live update, keyboard edit, filtering, no overflow",
  );
} finally {
  await browser?.close();
  await server.close();
}
