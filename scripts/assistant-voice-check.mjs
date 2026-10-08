import assert from "node:assert/strict";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";

// Render the real composer in isolation: no database, API keys, or AI calls.
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import Assistant from '/components/assistant.tsx';
import {Context} from '/components/context.tsx';
import '/app/globals.css';
const root=createRoot(document.getElementById('root'));
window.unmountAssistant=()=>root.unmount();
root.render(<React.StrictMode><Context.Provider value={{refresh:async()=>{}}}><Assistant/></Context.Provider></React.StrictMode>);`;
const server = await createServer({
  configFile: false,
  resolve: { alias: { "@": process.cwd() } },
  plugins: [
    react(),
    {
      name: "voice-check-fixture",
      configureServer(s) {
        s.middlewares.use(async (req, res, next) => {
          if (req.url !== "/") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            await s.transformIndexHtml(
              "/",
              '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main style="padding:24px"><div id="root"></div></main><script type="module" src="/voice-check-entry.jsx"></script></body></html>',
            ),
          );
        });
      },
      resolveId(id) {
        if (id === "/voice-check-entry.jsx")
          return resolve("voice-check-entry.jsx");
      },
      load(id) {
        if (id === resolve("voice-check-entry.jsx")) return entry;
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await chromium.launch({ channel: "chrome", headless: true });
const url = `http://127.0.0.1:${server.httpServer.address().port}`;
try {
  const page = await browser.newPage();
  const posts = [];
  await page.route("**/api/assistant*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") posts.push(request.postDataJSON());
    await route.fulfill({
      json:
        request.method() === "POST"
          ? { id: "test-chat" }
          : { conversations: [], conversation: null, messages: [], drafts: [] },
    });
  });
  await page.addInitScript(() => {
    window.recognizers = [];
    window.webkitSpeechRecognition = class {
      constructor() {
        window.recognizers.push(this);
      }
      start() {
        this.started = true;
        this.onstart?.();
      }
      stop() {
        this.stopped = true;
      }
      abort() {
        this.aborted = true;
        this.onend?.();
      }
      result(texts) {
        this.onresult?.({
          results: texts.map((text) => ({
            isFinal: true,
            0: { transcript: text },
          })),
        });
      }
      end() {
        this.onend?.();
      }
      fail(error) {
        this.onerror?.({ error });
        this.onend?.();
      }
    };
    window.SpeechRecognition = undefined;
  });
  await page.goto(url);
  const input = page.getByRole("textbox", { name: "给求职助理的消息" });
  const start = page.getByRole("button", { name: "开始语音输入", exact: true });
  await start.waitFor({ timeout: 15000 });
  await input.fill("已有内容");
  await start.click();
  assert.equal(
    await page.getByRole("button", { name: "发送消息" }).isDisabled(),
    true,
  );
  await page.evaluate(() => {
    const r = window.recognizers.at(-1);
    if (
      r.lang !== "zh-CN" ||
      r.continuous !== false ||
      r.interimResults !== false
    )
      throw Error("recognition configuration");
    r.result(["中文 ABS"]);
    r.result(["中文 ABS", "第二段"]);
  });
  await expect(input).toHaveValue("已有内容 中文 ABS 第二段");
  await page.getByRole("button", { name: "停止语音输入" }).click();
  await page.evaluate(() => {
    const r = window.recognizers.at(-1);
    r.result(["中文 ABS", "第二段", "结束补充"]);
    r.end();
  });
  await start.waitFor();
  await expect(input).toHaveValue("已有内容 中文 ABS 第二段 结束补充");
  assert.equal(posts.length, 0, "speech must not auto-send");
  await input.fill("修改后的文字");
  await page.getByRole("button", { name: "发送消息" }).click();
  await page.waitForFunction(
    () => document.querySelector("textarea").value === "",
  );
  assert.equal(posts.find((p) => p.action === "send").input, "修改后的文字");
  await start.waitFor();
  await input.fill("保留的草稿");
  await start.click();
  await page.evaluate(() => window.recognizers.at(-1).fail("not-allowed"));
  await page
    .getByText("请允许浏览器使用麦克风后重试", { exact: true })
    .waitFor();
  assert.equal(await input.inputValue(), "保留的草稿");
  await start.click();
  await page.evaluate(() => window.recognizers.at(-1).end());
  await page.getByText("没有识别到语音，请再说一次", { exact: true }).waitFor();
  await start.click();
  await page.getByRole("button", { name: "新对话", exact: false }).click();
  await page.evaluate(() =>
    window.recognizers.at(-1).result(["不应进入新会话"]),
  );
  await page.waitForFunction(
    () => document.querySelector("textarea").value === "",
  );
  assert.equal(await input.inputValue(), "");
  await page.setViewportSize({ width: 375, height: 812 });
  await start.click();
  await page.screenshot({
    path: "06_临时文件/voice-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "no mobile overflow",
  );
  await page.evaluate(() => window.unmountAssistant());
  assert.equal(
    await page.evaluate(() => window.recognizers.at(-1).aborted),
    true,
  );
  const unsupported = await browser.newPage();
  await unsupported.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
  await unsupported.route("**/api/assistant*", (route) =>
    route.fulfill({
      json: { conversations: [], conversation: null, messages: [], drafts: [] },
    }),
  );
  await unsupported.goto(url);
  await unsupported
    .getByText("当前浏览器不支持语音输入，可使用系统键盘的麦克风。", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await unsupported.getByRole("button", { name: "开始语音输入" }).count(),
    0,
  );
  await unsupported
    .getByRole("textbox", { name: "给求职助理的消息" })
    .fill("仍可打字");
  assert.equal(
    await unsupported.getByRole("button", { name: "发送消息" }).isEnabled(),
    true,
  );
  console.log(
    "PASS: transcript append/deduplication, stop tail, manual edit/send, permissions, silence, conversation cancellation, unmount, mobile layout, unsupported fallback",
  );
} finally {
  await browser.close();
  await server.close();
}
