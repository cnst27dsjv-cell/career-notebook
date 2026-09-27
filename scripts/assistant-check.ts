import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { request, chromium } from "@playwright/test";
import { assistantReplySchema } from "../lib/assistant-schema";
import { assistantContext } from "../lib/assistant-context";
import { compilePlan, hashPlan } from "../lib/assistant-plan";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const email = `assistant-qa-${Date.now()}@career.local`,
  password = randomBytes(20).toString("hex");
const { user } = await auth.api.signUpEmail({
  body: { email, password, name: "助理验收" },
});
const userId = user.id;
const w = { userId };
const ctx = await request.newContext({ baseURL: "http://127.0.0.1:3040" });
const report = (label: string) => console.log("PASS", label);
async function api(data: unknown, status = 200) {
  const r = await ctx.post("/api/assistant", { data, timeout: 90000 });
  const body = await r.json();
  assert.equal(r.status(), status, JSON.stringify(body));
  return body;
}
async function seedDraft(conversationId: string, actions: unknown[]) {
  const context = await assistantContext(userId, "验收产品经理");
  const plan = compilePlan(
    assistantReplySchema.parse({ reply: "请确认以下安排", actions }),
    context,
  );
  const message = await db.assistantMessage.create({
    data: {
      ...w,
      conversationId,
      clientId: randomUUID(),
      role: "assistant",
      content: "我已整理好面试和准备安排，请核对后确认。",
    },
  });
  return db.draft.create({
    data: {
      ...w,
      kind: "assistant",
      conversationId,
      messageId: message.id,
      input: "集成验收",
      result: JSON.parse(JSON.stringify(plan)),
      planHash: hashPlan(plan),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}
try {
  assert.equal((await ctx.get("/api/assistant")).status(), 401);
  assert.equal(
    (
      await ctx.post("/api/auth/sign-in/email", { data: { email, password } })
    ).status(),
    200,
  );
  const conversationId = (await api({ action: "new" })).id;
  const actions = [
    {
      key: "app",
      action: "application.save",
      values: {
        company: "验收公司",
        role: "产品经理",
        batch: "测试",
        stage: "已投递",
        appliedAt: "2029-12-20T10:00:00+08:00",
      },
      reason: "用户明确已投递",
    },
    {
      key: "interview",
      action: "event.save",
      values: {
        title: "验收公司产品经理二面",
        kind: "面试",
        round: "二面",
        applicationId: "$app",
        start: "2030-01-10T15:00:00+08:00",
        end: "2030-01-10T16:00:00+08:00",
      },
      reason: "用户提供固定时间",
    },
    {
      key: "practice",
      action: "event.save",
      values: {
        title: "二面准备一小时",
        kind: "准备",
        start: "2030-01-09T19:00:00+08:00",
        end: "2030-01-09T20:00:00+08:00",
        applicationId: "$app",
      },
      reason: "用户选择的准备时间",
    },
    {
      key: "prep",
      action: "preparation.save",
      values: {
        company: "验收公司",
        role: "产品经理",
        round: "二面",
        applicationId: "$app",
        eventId: "$interview",
        jd: "需求分析与项目推进",
      },
      reason: "与本次面试关联",
    },
  ];
  const draft = await seedDraft(conversationId, actions);
  assert.equal(await db.event.count({ where: w }), 0);
  report("生成草稿不写正式记录");
  const payload = {
    action: "confirm",
    id: draft.id,
    revision: draft.revision,
    planHash: draft.planHash,
  };
  const results = await Promise.all([api(payload), api(payload)]);
  assert.equal(await db.application.count({ where: w }), 1);
  assert.equal(await db.event.count({ where: w }), 2);
  assert.equal(await db.preparation.count({ where: w }), 1);
  assert.deepEqual(results[0].receipt, results[1].receipt);
  report("并发确认只创建一组投递、日程和准备，回执一致");
  const event = await db.event.findFirstOrThrow({
    where: { ...w, kind: "面试" },
  });
  const application = await db.application.findFirstOrThrow({ where: w });
  assert.equal(application.stage, "面试");
  assert.equal(event.applicationId, application.id);
  assert.equal(await db.notificationJob.count({ where: w }), 2);
  report("投递阶段、日程关联与提醒队列保持一致");
  const stale = await seedDraft(conversationId, [
    {
      key: "edit",
      action: "event.save",
      id: event.id,
      values: {
        start: "2030-01-11T15:00:00+08:00",
        end: "2030-01-11T16:00:00+08:00",
      },
      reason: "改期",
    },
  ]);
  await db.event.update({
    where: { id: event.id },
    data: { version: { increment: 1 } },
  });
  await api(
    { action: "confirm", id: stale.id, revision: 1, planHash: stale.planHash },
    400,
  );
  report("其他设备修改后旧草稿不能覆盖");
  const invalid = await seedDraft(conversationId, [
    {
      key: "a",
      action: "application.save",
      values: { company: "必须回滚", role: "测试" },
      reason: "测试",
    },
    {
      key: "b",
      action: "event.save",
      values: {
        title: "冲突",
        kind: "面试",
        start: "2030-02-01T15:00:00+08:00",
        end: "2030-02-01T16:00:00+08:00",
      },
      reason: "测试",
    },
    {
      key: "c",
      action: "event.save",
      values: {
        title: "重叠",
        kind: "准备",
        start: "2030-02-01T15:00:00+08:00",
        end: "2030-02-01T16:00:00+08:00",
      },
      reason: "测试",
    },
  ]);
  await api(
    {
      action: "confirm",
      id: invalid.id,
      revision: 1,
      planHash: invalid.planHash,
    },
    400,
  );
  assert.equal(
    await db.application.count({ where: { ...w, company: "必须回滚" } }),
    0,
  );
  assert.equal(await db.event.count({ where: w }), 2);
  report("跨模块执行中途失败全部回滚");
  const complete = await seedDraft(conversationId, [
    {
      key: "done",
      action: "event.status",
      id: event.id,
      status: "已完成",
      values: {},
      reason: "用户确认面试完成",
    },
  ]);
  await api({
    action: "confirm",
    id: complete.id,
    revision: 1,
    planHash: complete.planHash,
  });
  assert.equal(
    (await db.application.findFirstOrThrow({ where: w })).stageStatus,
    "等待结果",
  );
  assert.equal(
    await db.notificationJob.count({
      where: { ...w, eventId: event.id, state: "pending" },
    }),
    0,
  );
  report("完成面试后进入等待结果并取消旧提醒");
  await api({ action: "reject", id: invalid.id });
  await api(
    {
      action: "confirm",
      id: invalid.id,
      revision: 1,
      planHash: invalid.planHash,
    },
    400,
  );
  report("放弃草稿不能再执行");
  const foreign = await db.assistantConversation.create({
    data: { userId: `other-${userId}` },
  });
  try {
    assert.equal(
      (await ctx.get(`/api/assistant?id=${foreign.id}`)).status(),
      400,
    );
  } finally {
    await db.assistantConversation.delete({ where: { id: foreign.id } });
  }
  report("拒绝其他账号对话");
  const expired = await seedDraft(conversationId, []);
  await db.draft.update({
    where: { id: expired.id },
    data: { expiresAt: new Date(0) },
  });
  await api(
    {
      action: "confirm",
      id: expired.id,
      revision: 1,
      planHash: expired.planHash,
    },
    400,
  );
  report("过期草稿不能执行");
  // Optional actual model roundtrip uses only the synthetic account above.
  if (process.argv.includes("--model")) {
    const modelConversation = (await api({ action: "new" })).id;
    const clientId = randomUUID();
    const input = "请查询验收公司产品经理的投递进展和面试安排，不要修改数据。";
    await api({
      action: "send",
      conversationId: modelConversation,
      clientId,
      input,
    });
    await api({
      action: "send",
      conversationId: modelConversation,
      clientId,
      input,
    });
    assert.equal(
      await db.assistantMessage.count({ where: { ...w, clientId } }),
      1,
    );
    await api({
      action: "send",
      conversationId: modelConversation,
      clientId: randomUUID(),
      input: "把刚才那场二面改到2030年1月12日下午三点到四点，先给我草稿。",
    });
    const modelDraft = await db.draft.findFirstOrThrow({
      where: {
        ...w,
        conversationId: modelConversation,
        kind: "assistant",
        status: "ready",
      },
      orderBy: { createdAt: "desc" },
    });
    const plan = modelDraft.result as unknown as { actions: { id?: string }[] };
    assert(plan.actions.some((a) => a.id === event.id));
    report("真实模型查询、连续指代改期、消息重试不重复");
  }
  // Browser verification uses persisted server data, not mocked responses.
  const visualConversation = (await api({ action: "new" })).id;
  await db.assistantConversation.update({
    where: { id: visualConversation },
    data: { title: "二面安排与准备" },
  });
  await db.assistantMessage.create({
    data: {
      ...w,
      conversationId: visualConversation,
      clientId: randomUUID(),
      role: "assistant",
      content: "你的产品岗投递已进入面试阶段。需要调整安排时，直接告诉我就好。",
    },
  });
  await db.assistantMessage.create({
    data: {
      ...w,
      conversationId: visualConversation,
      clientId: randomUUID(),
      role: "user",
      content: "把二面改到周六下午三点，还是留一小时。",
    },
  });
  const screenshotDraft = await seedDraft(visualConversation, [
    {
      key: "update",
      action: "event.save",
      id: event.id,
      values: {
        start: "2030-01-12T15:00:00+08:00",
        end: "2030-01-12T16:00:00+08:00",
      },
      reason: "把二面改到周六下午三点，结束时间仍为四点。",
    },
  ]);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const bc = await browser.newContext({
      storageState: await ctx.storageState(),
    });
    const page = await bc.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:3040/?view=assistant`);
    await page.locator(".assistant-letter").waitFor();
    await page.getByLabel("历史对话").selectOption(visualConversation);
    await page
      .getByText("把二面改到周六下午三点，结束时间仍为四点。")
      .waitFor();
    await mkdir("06_临时文件/assistant-mvp", { recursive: true });
    for (const width of [1280, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      assert.equal(
        await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth),
        false,
      );
      await page.screenshot({
        path: `06_临时文件/assistant-mvp/assistant-${width}.png`,
        fullPage: true,
      });
    }
    await page.reload();
    await page.locator(".assistant-letter").waitFor();
    await page.getByLabel("历史对话").selectOption(visualConversation);
    await page
      .getByText("把二面改到周六下午三点，结束时间仍为四点。")
      .waitFor();
    const sheet = page
      .locator(".assistant-action-sheet")
      .filter({ hasText: "把二面改到周六下午三点" });
    await sheet.getByRole("button", { name: "确认执行" }).click();
    await sheet.getByText("已保存", { exact: true }).waitFor();
    assert.equal(
      (await db.draft.findUniqueOrThrow({ where: { id: screenshotDraft.id } }))
        .confirmed,
      true,
    );
    assert.deepEqual(errors, []);
    report("桌面/375px无溢出、无运行错误；刷新恢复和手机确认实际保存通过");
  } finally {
    await browser.close();
  }
} finally {
  for (const table of [
    "assistantMessage",
    "assistantConversation",
    "assistantUsage",
    "notificationJob",
    "draft",
    "material",
    "preparation",
    "interview",
    "event",
    "application",
  ] as const)
    await (
      db[table] as unknown as { deleteMany: (x: unknown) => Promise<unknown> }
    ).deleteMany({ where: w });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
  await ctx.dispose();
}
