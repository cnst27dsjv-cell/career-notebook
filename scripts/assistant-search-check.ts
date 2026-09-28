import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { request, chromium } from "@playwright/test";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const email = `search-qa-${Date.now()}@career.local`;
const password = randomBytes(20).toString("hex");
const { user } = await auth.api.signUpEmail({
  body: { email, password, name: "联网验收" },
});
const ctx = await request.newContext({ baseURL: "http://127.0.0.1:3040" });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const login = await ctx.post("/api/auth/sign-in/email", {
    data: { email, password },
  });
  assert.equal(login.status(), 200);
  const page = await browser.newPage({
    storageState: await ctx.storageState(),
  });
  await page.goto("http://127.0.0.1:3040/?view=assistant");
  const toggle = page.getByRole("checkbox", { name: "联网搜索" });
  await toggle.waitFor();
  assert.equal(await toggle.isChecked(), false);
  await toggle.check();
  await page
    .locator(".letter-composer textarea")
    .fill(
      "中国建设银行总行2027届校园招聘 管理培训生 官网公告，现在是否能报名？请区分总行与分行，来源不足就说明。",
    );
  await page
    .locator(".letter-composer")
    .evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await page
    .getByText("联网来源 · 搜索摘要", { exact: false })
    .waitFor({ timeout: 110000 });
  const state = await (await ctx.get("/api/assistant")).json();
  const plan = state.drafts[0].result;
  assert.ok(plan.webSearch.sources.length > 0);
  assert.ok(
    state.messages.find(
      (m: { role: string; webSearch: boolean }) => m.role === "user",
    ).webSearch,
  );
  const message = state.messages.find(
    (m: { role: string }) => m.role === "user",
  );
  const retry = await ctx.post("/api/assistant", {
    data: {
      action: "send",
      conversationId: state.conversation.id,
      clientId: message.clientId,
      input: message.content,
      webSearch: true,
    },
  });
  assert.equal(retry.status(), 200);
  const changedMode = await ctx.post("/api/assistant", {
    data: {
      action: "send",
      conversationId: state.conversation.id,
      clientId: message.clientId,
      input: message.content,
      webSearch: false,
    },
  });
  assert.notEqual(changedMode.status(), 200);
  await page.reload();
  await page.getByText("联网来源 · 搜索摘要", { exact: false }).waitFor();
  await mkdir("06_临时文件/assistant-search", { recursive: true });
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `06_临时文件/assistant-search/search-${width}.png`,
      fullPage: true,
    });
  }
  console.log(
    "PASS: live Tavily → assistant reply → persisted source links; replay idempotency and search-mode guard; desktop/mobile layout.",
  );
  console.log(
    "Reply:",
    state.messages.find((m: { role: string }) => m.role === "assistant")
      .content,
  );
  console.log("Source count:", plan.webSearch.sources.length);
} finally {
  await browser?.close();
  await ctx.dispose();
  for (const table of [
    "assistantMessage",
    "assistantConversation",
    "assistantUsage",
    "draft",
  ] as const)
    await (
      db[table] as unknown as { deleteMany: (x: unknown) => Promise<unknown> }
    ).deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
  await db.$disconnect();
}
