import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium } from "@playwright/test";
import { db } from "../lib/db";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const email = `setup-${Date.now()}@example.test`;
let userId = "";
const passed: string[] = [];
const check = (s: string) => {
  passed.push(s);
  console.log("PASS", s);
};
try {
  await page.goto("http://127.0.0.1:3040/login");
  await page
    .getByRole("button", { name: "第一次使用？创建我的空白手账" })
    .click();
  await page.getByLabel("怎么称呼你").fill("验收手账");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page
    .getByLabel("密码", { exact: true })
    .fill(randomBytes(20).toString("hex"));
  await page
    .getByRole("button", { name: "创建我的空白手账", exact: true })
    .click();
  await page.getByRole("heading", { name: "每一步，都离理想更近。" }).waitFor();
  userId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
  check("首次创建个人空白手账并自动登录");
  async function post(data: unknown) {
    const r = await context.request.post("http://127.0.0.1:3040/api/data", {
      data,
    });
    assert.equal(r.status(), 200, await r.text());
    return r.json();
  }
  for (const [company, city, role, stage] of [
    ["甲公司", "上海", "产品经理", "面试"],
    ["乙公司", "杭州", "产品经理", "面试"],
    ["丙公司", "杭州", "设计师", "已投递"],
  ])
    await post({
      action: "application.save",
      values: {
        company,
        city,
        role,
        stage,
        stageStatus: "等待结果",
        appliedAt: new Date().toISOString(),
      },
    });
  await page.goto("http://127.0.0.1:3040/?view=applications");
  await page.locator(".table-row").first().waitFor();
  const city = page
    .locator("details.filter")
    .filter({ has: page.locator("summary", { hasText: "城市" }) });
  await city.locator("summary").click();
  await city.getByLabel("上海", { exact: true }).check();
  await city.getByLabel("杭州", { exact: true }).check();
  await city.locator("summary").click();
  const role = page
    .locator("details.filter")
    .filter({ has: page.locator("summary", { hasText: "岗位" }) });
  await role.locator("summary").click();
  await role.getByLabel("产品经理", { exact: true }).check();
  await role.locator("summary").click();
  assert.equal(await page.locator(".table-row").count(), 2);
  await page.getByLabel("搜索公司或岗位").fill("甲");
  assert.equal(await page.locator(".table-row").count(), 1);
  await page.getByRole("button", { name: "清空筛选" }).click();
  assert.equal(await page.locator(".table-row").count(), 3);
  check("浏览器多城市 OR、岗位 AND、关键词和清空筛选");
  await page.goto("http://127.0.0.1:3040/?view=calendar");
  await page.getByRole("button", { name: "新增日程" }).click();
  await page.getByLabel("日程名称").fill("自定义提醒面试");
  const start = new Date(Date.now() + 3 * 86400000);
  const local = new Date(start.getTime() + 8 * 3600000)
    .toISOString()
    .slice(0, 16);
  const reminder = new Date(Date.now() + 2 * 86400000 + 8 * 3600000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel("执行开始（北京时间）").fill(local);
  await page.getByLabel("或指定提醒时间（北京时间）").fill(reminder);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const event = await db.event.findFirstOrThrow({
    where: { userId, title: "自定义提醒面试" },
  });
  assert.equal(event.absoluteReminders.length, 1);
  check("界面自定义提醒时间持久化");
  await page
    .locator(".fc-event-title")
    .filter({ hasText: "自定义提醒面试" })
    .click();
  await page.getByRole("button", { name: "标记已完成" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page
    .locator(".fc-event-title")
    .filter({ hasText: "✓ 自定义提醒面试" })
    .waitFor();
  check("日历完成按钮立即关闭弹窗并更新日历，无需手动刷新");
  await page.goto("http://127.0.0.1:3040/?view=preparations&event=" + event.id);
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("公司", { exact: true }).fill("甲公司");
  await page.getByLabel("岗位", { exact: true }).fill("产品经理");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const prep = await db.preparation.findFirstOrThrow({
    where: { userId, eventId: event.id },
  });
  check("面试日程关联新准备");
  const session = await post({
    action: "interview.create",
    preparationId: prep.id,
    questions: ["请介绍你的项目", "你做了哪些工作？"],
  });
  await page.goto("http://127.0.0.1:3040/?view=preparations&event="+event.id);
  await page.getByRole("button", { name: "继续第 1 次练习" }).click();
  await page
    .getByLabel("你的回答（停止输入 1 秒后自动保存草稿）")
    .fill("这是刚刚输入、立刻切题的回答。");
  await page.getByRole("button", { name: "下一题 / 跳过" }).click();
  await page.getByRole("heading", { name: "你做了哪些工作？" }).waitFor();
  const saved = await db.interview.findUniqueOrThrow({
    where: { id: session.id },
  });
  assert.equal(
    (saved.turns as { answer: string }[])[0].answer,
    "这是刚刚输入、立刻切题的回答。",
  );
  await page
    .getByLabel("你的回答（停止输入 1 秒后自动保存草稿）")
    .fill("我负责整理用户需求。");
  await page.waitForTimeout(1800);
  assert.equal(
    (
      (await db.interview.findUniqueOrThrow({ where: { id: session.id } }))
        .turns as { answer: string }[]
    )[1].answer,
    "我负责整理用户需求。",
  );
  check("回答防丢失：立即切题前保存与自动保存");
  const ai = await context.request.post("http://127.0.0.1:3040/api/ai", {
    data: { action: "polish", input: "我的真实回答" },
  });
  assert.equal(ai.status(), 400);
  assert((await ai.json()).error.includes("尚未配置"));
  check("未配置模型时明确返回状态，不伪造生成结果");
  await writeFile(
    "06_临时文件/flows-results.json",
    JSON.stringify({ at: new Date(), passed }, null, 2),
  );
} finally {
  if (!userId)
    userId = (await db.user.findUnique({ where: { email } }))?.id || "";
  if (userId) {
    for (const table of [
      "notificationJob",
      "event",
      "application",
      "resume",
      "fileAsset",
      "material",
      "interview",
      "preparation",
      "draft",
      "settings",
    ] as const)
      await (
        db[table] as unknown as { deleteMany: (v: unknown) => Promise<unknown> }
      ).deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await browser.close();
  await db.$disconnect();
}
