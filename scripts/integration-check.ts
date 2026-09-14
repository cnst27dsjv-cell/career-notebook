import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { request, chromium } from "@playwright/test";
import AdmZip from "adm-zip";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const email = `qa-${Date.now()}@career.local`,
  password = randomBytes(20).toString("hex");
const created = await auth.api.signUpEmail({
  body: { email, password, name: "验收账号" },
});
const userId = created.user.id;
const ctx = await request.newContext({ baseURL: "http://127.0.0.1:3040" });
const report: string[] = [];
async function post(v: unknown, expected = 200) {
  const r = await ctx.post("/api/data", { data: v });
  const body = await r.json();
  assert.equal(r.status(), expected, JSON.stringify(body));
  return body;
}
const check = (s: string) => {
  report.push(s);
  console.log("PASS", s);
};
try {
  assert.equal((await ctx.get("/api/data")).status(), 401);
  await ctx.post("/api/auth/sign-in/email", { data: { email, password } });
  check("未登录不能读取，账号可登录");
  await post({
    action: "application.save",
    values: {
      company: "验收公司",
      role: "产品经理",
      city: "上海",
      batch: "验收",
      stage: "已投递",
      stageStatus: "等待结果",
      appliedAt: new Date().toISOString(),
    },
  });
  let data = await (await ctx.get("/api/data")).json();
  const app = data.applications[0];
  assert.equal(app.company, "验收公司");
  await post(
    {
      action: "application.save",
      id: app.id,
      version: 0,
      values: { ...app, city: "杭州" },
    },
    400,
  );
  check("投递持久化与过期版本拒绝");
  const start = new Date(Date.now() + 2 * 86400000).toISOString(),
    end = new Date(Date.now() + 2 * 86400000 + 3600000).toISOString();
  await post({
    action: "event.save",
    values: {
      title: "验收面试",
      kind: "面试",
      applicationId: app.id,
      start,
      end,
      reminderHours: [24, 0.5],
    },
  });
  data = await (await ctx.get("/api/data")).json();
  const event = data.events[0];
  assert.equal(data.jobs.length, 2);
  await post(
    {
      action: "event.save",
      values: {
        title: "冲突面试",
        kind: "面试",
        start,
        end,
        reminderHours: [24],
      },
    },
    400,
  );
  await post({
    action: "event.status",
    id: event.id,
    version: event.version,
    status: "已完成",
  });
  data = await (await ctx.get("/api/data")).json();
  assert(data.jobs.every((j: { state: string }) => j.state === "cancelled"));
  assert.equal(data.applications[0].stageStatus, "等待结果");
  check("日程冲突、完成后取消提醒、面试等待结果");
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>这是我的真实项目介绍，用于验收 Word 文字导入。</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  const file = zip.toBuffer();
  const imported = await ctx.post("/api/files", {
    multipart: {
      mode: "import",
      file: {
        name: "qa.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buffer: file,
      },
    },
  });
  assert.equal(imported.status(), 200, await imported.text());
  assert((await imported.json()).text.includes("真实项目"));
  check("真实 DOCX 文件提取");
  for (let i = 0; i < 2; i++) {
    const r = await ctx.post("/api/files", {
      multipart: {
        series: "验收简历",
        target: "产品岗",
        allowDuplicate: "true",
        file: {
          name: "qa.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          buffer: file,
        },
      },
    });
    assert.equal(r.status(), 200, await r.text());
    if (i === 0) {
      data = await (await ctx.get("/api/data")).json();
      await post({
        action: "application.save",
        id: app.id,
        version: data.applications[0].version,
        values: { ...data.applications[0], resumeId: data.resumes[0].id },
      });
    }
  }
  data = await (await ctx.get("/api/data")).json();
  assert.equal(data.resumes.length, 2);
  assert.equal(
    data.resumes.filter((r: { current: boolean }) => r.current).length,
    1,
  );
  assert.notEqual(
    data.applications[0].resumeId,
    data.resumes.find((r: { current: boolean }) => r.current).id,
  );
  check("简历新版本不覆盖实际投递版本");
  const foreign = await db.application.findFirst({
    where: { userId: { not: userId } },
  });
  if (foreign)
    await post(
      {
        action: "application.save",
        id: foreign.id,
        version: 1,
        values: { ...app },
      },
      400,
    );
  const unauth = await request.newContext({ baseURL: "http://127.0.0.1:3040" });
  assert.equal(
    (await unauth.get("/api/files/" + data.files[0].id)).status(),
    401,
  );
  await unauth.dispose();
  check("跨账号记录和未登录文件下载被拒绝");
  const prep = await post({
    action: "preparation.save",
    values: { company: "验收公司", role: "产品经理" },
  });
  const importKey = randomUUID();
  const payload = {
    action: "material.import",
    key: importKey,
    items: [
      {
        title: "自我介绍",
        content: "这是我的真实经历",
        kind: "自我介绍",
        preparationId: prep.id,
      },
      { title: "项目介绍", content: "我负责整理需求", kind: "项目经历" },
    ],
  };
  await post(payload);
  await post(payload);
  data = await (await ctx.get("/api/data")).json();
  assert.equal(data.materials.length, 2);
  const m = data.materials[0];
  await post({
    action: "material.save",
    id: m.id,
    version: m.version,
    values: { ...m, content: "修改后的真实经历" },
  });
  data = await (await ctx.get("/api/data")).json();
  assert.equal(
    data.materials.find((x: { id: string }) => x.id === m.id).revisions.length,
    1,
  );
  check("批量导入确认幂等与资料修订保留");
  const session = await post({
    action: "interview.create",
    preparationId: prep.id,
    questions: ["请介绍一下你的项目"],
  });
  await post({
    action: "interview.answer",
    id: session.id,
    index: 0,
    answer: "我负责整理需求并与团队沟通",
    version: 1,
  });
  await post({
    action: "interview.confirm",
    id: session.id,
    index: 0,
    content: "项目中，我负责梳理需求，并与团队沟通确认。",
    version: 2,
  });
  await post({
    action: "interview.confirm",
    id: session.id,
    index: 0,
    content: "项目中，我负责梳理需求，并与团队沟通确认。",
    version: 2,
  });
  data = await (await ctx.get("/api/data")).json();
  assert.equal(data.materials.length, 3);
  check("模拟回答保存与确认逐字稿不重复入库");
  await post({
    action: "settings.save",
    values: {
      email,
      availabilityConfirmed: true,
      availability: { weekdays: [19, 22], weekends: [9, 18] },
    },
  });
  await post({ action: "mail.test" });
  const mail = await (
    await fetch("http://127.0.0.1:8026/api/v1/messages")
  ).json();
  const msg = mail.messages.find((m: { To: { Address: string }[] }) =>
    m.To.some((t) => t.Address === email),
  );
  assert(msg);
  const detail = await (
    await fetch("http://127.0.0.1:8026/api/v1/message/" + msg.ID)
  ).json();
  const link = detail.Text.match(
    /http:\/\/[^\s]+\/api\/verify\?token=[a-f0-9]+/,
  )[0];
  assert((await (await ctx.get(link)).text()).includes("验证成功"));
  check("测试邮箱验证完整流程");
  await post({
    action: "event.save",
    values: {
      title: "后台触发验收",
      kind: "其他",
      start: new Date(Date.now() + 3600000).toISOString(),
      reminderHours: [0.5],
    },
  });
  const job = await db.notificationJob.findFirstOrThrow({
    where: { userId, state: "pending" },
  });
  await db.notificationJob.update({
    where: { id: job.id },
    data: { scheduledAt: new Date(Date.now() - 1000) },
  });
  await new Promise((r) => setTimeout(r, 32000));
  const sent = await db.notificationJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(sent.state, "accepted");
  check("无网页打开时独立后台触发邮件");
  const backup = await ctx.get("/api/export?format=zip");
  assert.equal(backup.status(), 200);
  const archive = new AdmZip(Buffer.from(await backup.body()));
  assert(archive.getEntry("data.json"));
  assert(archive.getEntries().some((x) => x.entryName.startsWith("files/")));
  check("全量 JSON 与原文件 ZIP 导出");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const browserContext = await browser.newContext({
    storageState: await ctx.storageState(),
    viewport: { width: 1440, height: 1000 },
  });
  const page = await browserContext.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const view of [
    "today",
    "applications",
    "calendar",
    "resumes",
    "preparations",
    "assistant",
    "settings",
  ]) {
    await page.goto("http://127.0.0.1:3040/?view=" + view);
    await page.locator(".notebook-page").waitFor();
    await page.screenshot({ path: "06_临时文件/qa-" + view + ".png" });
    assert.equal(
      await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth),
      false,
    );
  }
  await page.goto("http://127.0.0.1:3040/?view=applications");
  await page.getByRole("button", { name: "新增投递" }).click();
  await page.getByLabel("公司", { exact: true }).fill("界面新公司");
  await page.getByLabel("岗位", { exact: true }).fill("产品经理");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: /界面新公司/ }).waitFor();
  check("桌面表单真实新增投递");
  await page.setViewportSize({ width: 375, height: 812 });
  for (const view of [
    "today",
    "applications",
    "calendar",
    "resumes",
    "preparations",
    "assistant",
    "settings",
  ]) {
    await page.goto("http://127.0.0.1:3040/?view=" + view);
    await page.locator(".notebook-page").waitFor();
    assert.equal(
      await page.locator("body").evaluate((e) => e.scrollWidth > innerWidth),
      false,
      view + " mobile overflow",
    );
  }
  assert.deepEqual(errors, []);
  check("七个栏目桌面/手机无横向溢出与运行错误");
  await browser.close();
  await writeFile(
    "06_临时文件/integration-results.json",
    JSON.stringify({ at: new Date(), passed: report }, null, 2),
  );
} finally {
  const files = await db.fileAsset.findMany({ where: { userId } });
  const { unlink } = await import("node:fs/promises");
  for (const f of files) await unlink("storage/" + f.key).catch(() => {});
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
  await ctx.dispose();
  await db.$disconnect();
}
