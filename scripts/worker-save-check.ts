// Run against local wrangler (3042) with the same local .env database.
// Creates isolated test users and deletes only their records afterwards.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { request } from "@playwright/test";
if (new URL(process.env.DATABASE_URL!).hostname !== "127.0.0.1")
  throw Error("This check requires the local database");
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const ctx = await request.newContext({
  baseURL: "http://127.0.0.1:3042",
});
const anonymous = await request.newContext({
  baseURL: "http://127.0.0.1:3042",
});
const userIds: string[] = [];
const values = {
  company: "保存性能验收",
  role: "分析师",
  stage: "笔试",
  appliedAt: new Date().toISOString(),
  jd: "岗位资料".repeat(3000),
};
const schedule = {
  mode: "upsert",
  start: "2035-10-23T10:00:00Z",
  end: "2035-10-23T11:00:00Z",
  reminderHours: [24],
};
async function save(data: Record<string, unknown>, status = 200) {
  const response = await ctx.post("/api/data", {
    data: { action: "application.save", ...data },
  });
  assert.equal(response.status(), status, await response.text());
  assert.match(response.headers()["content-type"], /application\/json/);
  return response.json();
}
try {
  assert.equal((await anonymous.get("/api/data")).status(), 401);
  assert.equal(
    (
      await anonymous.post("/api/data", {
        data: { action: "application.save" },
      })
    ).status(),
    401,
  );
  const password = randomBytes(20).toString("hex");
  for (let i = 0; i < 2; i++) {
    const { user } = await auth.api.signUpEmail({
      body: {
        email: `save-qa-${randomBytes(10).toString("hex")}@career.local`,
        password,
        name: "Workers 保存验收",
      },
    });
    userIds.push(user.id);
    if (!i) {
      const login = await ctx.post("/api/auth/sign-in/email", {
        data: { email: user.email, password },
      });
      assert.equal(login.status(), 200, await login.text());
    }
  }
  const [userId, otherUserId] = userIds;
  const foreign = await db.application.create({
    data: { userId: otherUserId, company: "其他账号", role: "测试" },
  });
  assert.match(
    (await save({ id: foreign.id, version: 1, values }, 400)).error,
    /记录不存在/,
  );
  const origin = await ctx.post("/api/data", {
    headers: { Origin: "https://untrusted.invalid" },
    data: { action: "application.save" },
  });
  assert.equal(origin.status(), 400);
  assert.equal(await db.application.count({ where: { userId } }), 0);
  console.log(
    "PASS anonymous requests, origin validation and account isolation",
  );

  const first = await save({ values, schedule });
  let event = await db.event.findFirstOrThrow({
    where: { userId, applicationId: first.id },
  });
  assert.equal(event.end?.toISOString(), "2035-10-23T11:00:00.000Z");
  assert.equal(
    await db.notificationJob.count({
      where: { eventId: event.id, state: "pending" },
    }),
    1,
  );
  const cleared = await save({
    id: first.id,
    version: first.version,
    values,
    schedule: { ...schedule, end: null },
  });
  event = await db.event.findUniqueOrThrow({ where: { id: event.id } });
  assert.equal(event.end, null);
  assert.equal(event.start?.toISOString(), "2035-10-23T10:00:00.000Z");
  assert.equal(event.version, 2);
  assert.equal(
    await db.notificationJob.count({
      where: { eventId: event.id, state: "pending" },
    }),
    1,
  );
  console.log("PASS create, edit, clear end time and replace reminders");

  const beforeJobs = await db.notificationJob.count({ where: { userId } });
  assert.match(
    (await save({ values, schedule }, 400)).error,
    /时间与已有日程冲突/,
  );
  assert.equal(await db.application.count({ where: { userId } }), 1);
  assert.equal(await db.event.count({ where: { userId } }), 1);
  assert.equal(
    await db.notificationJob.count({ where: { userId } }),
    beforeJobs,
  );
  const allowed = await save({
    values,
    schedule: { ...schedule, allowConflict: true },
  });
  assert(allowed.id);
  console.log("PASS conflict rollback and explicit overlap permission");

  const edits = await Promise.all(
    [0, 1].map((n) =>
      ctx.post("/api/data", {
        data: {
          action: "application.save",
          id: first.id,
          version: cleared.version,
          values: { ...values, notes: `并发修改${n}` },
        },
      }),
    ),
  );
  assert.deepEqual(edits.map((r) => r.status()).sort(), [200, 400]);
  const rejected = edits.find((r) => r.status() === 400)!;
  assert.match((await rejected.json()).error, /投递记录已更新/);
  const updated = await db.application.findUniqueOrThrow({
    where: { id: first.id },
  });
  assert.equal(updated.version, cleared.version + 1);
  console.log("PASS concurrent edits cannot overwrite a newer version");

  const status = await ctx.post("/api/data", {
    data: {
      action: "event.status",
      id: event.id,
      version: event.version,
      status: "已完成",
    },
  });
  assert.equal(status.status(), 200, await status.text());
  assert.equal(
    (await db.application.findUniqueOrThrow({ where: { id: first.id } }))
      .stageStatus,
    "等待结果",
  );
  const loaded = await ctx.get("/api/data?scope=core");
  assert.equal(loaded.status(), 200);
  assert.equal((await loaded.json()).applications.length, 2);
  console.log(
    "PASS completion updates application progress and authenticated reload",
  );
  await db.event.create({
    data: {
      userId,
      title: "未填结束时间",
      start: new Date("2036-01-01T10:00:00Z"),
    },
  });
  for (const [start, end, expected] of [
    ["09:00", "10:00", 200],
    ["10:59", "11:30", 400],
    ["11:00", "12:00", 200],
  ] as const) {
    const response = await ctx.post("/api/data", {
      data: {
        action: "event.save",
        values: {
          title: "冲突边界验收",
          kind: "其他",
          start: `2036-01-01T${start}:00Z`,
          end: `2036-01-01T${end}:00Z`,
          reminderHours: [],
        },
      },
    });
    assert.equal(response.status(), expected, await response.text());
    if (expected === 200)
      await db.event.delete({
        where: { id: (await response.json()).event.id },
      });
    else assert.match((await response.json()).error, /时间与已有日程冲突/);
  }
  console.log(
    "PASS null end uses one hour; touching boundaries do not conflict",
  );
} finally {
  for (const userId of userIds) {
    await db.notificationJob.deleteMany({ where: { userId } });
    await db.event.deleteMany({ where: { userId } });
    await db.application.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
  await Promise.all([ctx.dispose(), anonymous.dispose(), db.$disconnect()]);
}
