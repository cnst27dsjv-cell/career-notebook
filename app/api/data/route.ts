import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { allReminderTimes, overlaps } from "@/lib/rules";
import { sendMail } from "@/lib/mail";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  applicationStageForEventKind,
  automaticApplicationStageStatus,
  completedApplicationStageForEventKind,
  eventKindForApplicationStage,
} from "@/lib/application-stage";
const text = z.string().trim().max(100000);
const date = z
  .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));
const appSchema = z.object({
  company: text.min(1),
  role: text.min(1),
  city: text.default(""),
  batch: text.default("2027 届秋招"),
  stage: z.enum(["待投递", "已投递", "测评", "笔试", "面试", "Offer"]),
  outcome: z
    .enum(["", "未通过", "主动撤回", "录用已接受", "录用已拒绝"])
    .default(""),
  appliedAt: date,
  url: text
    .refine((v) => !v || /^https?:\/\//.test(v), "链接应以 http 或 https 开头")
    .default(""),
  jd: text.default(""),
  notes: text.default(""),
  resumeId: z.string().nullable().optional(),
});
const applicationScheduleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("remove") }),
  z
    .object({
      mode: z.literal("upsert"),
      start: date,
      end: date,
      deadline: date,
      location: text.default(""),
      reminderHours: z.array(z.number().min(0).max(720)).max(8).default([24]),
      absoluteReminders: z
        .array(
          z
            .string()
            .datetime({ offset: true })
            .transform((value) => new Date(value)),
        )
        .max(8)
        .default([]),
      allowConflict: z.boolean().default(false),
    })
    .refine((value) => value.start || value.deadline, "请填写执行时间或截止时间")
    .refine(
      (value) => !value.start || !value.end || value.end > value.start,
      "结束时间必须晚于开始时间",
    )
    .refine(
      (value) => !value.end || !!value.start,
      "结束时间需要执行开始时间",
    )
    .refine(
      (value) =>
        !value.start ||
        !value.deadline ||
        (value.end ?? value.start) <= value.deadline,
      "执行时间不能晚于截止时间",
    ),
]);
const eventSchema = z
  .object({
    title: text.min(1),
    kind: z.enum(["招聘会", "投递", "测评", "笔试", "面试", "准备", "其他"]),
    applicationId: z.string().nullable().optional(),
    start: date,
    end: date,
    deadline: date,
    location: text.default(""),
    notes: text.default(""),
    reminderHours: z.array(z.number().min(0).max(720)).max(8).default([24]),
    absoluteReminders: z
      .array(
        z
          .string()
          .datetime({ offset: true })
          .transform((v) => new Date(v)),
      )
      .max(8)
      .default([]),
  })
  .refine((v) => v.start || v.deadline, "请填写执行时间或截止时间")
  .refine(
    (v) => !v.start || !v.end || v.end > v.start,
    "结束时间必须晚于开始时间",
  )
  .refine((v) => !v.end || !!v.start, "结束时间需要执行开始时间")
  .refine(
    (v) => !v.start || !v.deadline || (v.end ?? v.start) <= v.deadline,
    "执行时间不能晚于截止时间",
  );

async function createReminderJobs(
  tx: Prisma.TransactionClient,
  userId: string,
  event: {
    id: string;
    version: number;
    start: Date | null;
    deadline: Date | null;
    reminderHours: number[];
    absoluteReminders: Date[];
  },
) {
  const scheduledTimes = allReminderTimes(
    event.start,
    event.deadline,
    event.reminderHours,
    event.absoluteReminders,
  );
  if (!scheduledTimes.length) return;
  await tx.notificationJob.createMany({
    data: scheduledTimes.map((scheduledAt) => ({
      userId,
      eventId: event.id,
      eventVersion: event.version,
      scheduledAt,
    })),
  });
}
const materialSchema = z
  .object({
    title: text.min(1),
    content: text.min(1),
    category: z.enum(["岗位特有", "通用问题", "待确认"]).default("待确认"),
    kind: text.default("边界或分类待确认"),
    roleScope: text.default(""),
    tags: text.default(""),
    source: text.default("手动整理"),
    preparationId: z.string().nullable().optional(),
    parentId: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const allowed = {
      岗位特有: [
        "自我介绍",
        "求职动机",
        "岗位相关专业问题与知识点",
        "Case",
        "其他",
      ],
      通用问题: ["个性问题", "行为面试", "其他通用问题"],
      待确认: ["边界或分类待确认"],
    }[value.category];
    if (!allowed.includes(value.kind))
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "二级类目与一级类目不匹配",
      });
    if (value.category === "岗位特有" && !value.roleScope)
      ctx.addIssue({
        code: "custom",
        path: ["roleScope"],
        message: "岗位特有资料需要填写适用岗位",
      });
  })
  .transform((value) =>
    value.category === "通用问题" ? { ...value, roleScope: "" } : value,
  );

async function writeApplicationProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  applicationId: string,
  stage: string,
  stageStatus: string,
  appliedAt?: Date,
) {
  const application = await tx.application.findFirst({
    where: { id: applicationId, userId },
  });
  if (!application) return;
  const changed =
    application.stage !== stage ||
    application.stageStatus !== stageStatus ||
    (!!appliedAt && !application.appliedAt);
  if (!changed) return;
  await tx.application.update({
    where: { id: application.id },
    data: {
      stage,
      stageStatus,
      appliedAt: application.appliedAt ?? appliedAt,
      version: { increment: 1 },
      history: [
        ...(application.history as Prisma.JsonArray),
        {
          at: new Date().toISOString(),
          from: `${application.stage} · ${application.stageStatus}`,
          to: `${stage} · ${stageStatus}`,
        },
      ],
    },
  });
}

async function syncApplicationForPendingEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  event: { applicationId: string | null; kind: string },
) {
  if (!event.applicationId) return;
  const stage = applicationStageForEventKind(event.kind);
  if (!stage) return;
  await writeApplicationProgress(
    tx,
    userId,
    event.applicationId,
    stage,
    "待完成",
  );
}

async function syncApplicationAfterEventRemoval(
  tx: Prisma.TransactionClient,
  userId: string,
  event: { id: string; applicationId: string | null; kind: string },
) {
  if (!event.applicationId) return;
  const stage = applicationStageForEventKind(event.kind);
  if (!stage) return;
  const application = await tx.application.findFirst({
    where: { id: event.applicationId, userId },
  });
  if (!application || application.stage !== stage) return;
  const another = await tx.event.findFirst({
    where: {
      userId,
      applicationId: event.applicationId,
      kind: event.kind,
      status: "待完成",
      id: { not: event.id },
    },
  });
  await writeApplicationProgress(
    tx,
    userId,
    event.applicationId,
    stage,
    another ? "待完成" : "待安排",
  );
}

async function syncApplicationForCompletedEvent(
  tx: Prisma.TransactionClient,
  userId: string,
  event: { applicationId: string | null; kind: string },
) {
  if (!event.applicationId) return;
  const pendingStage = applicationStageForEventKind(event.kind);
  const completedStage = completedApplicationStageForEventKind(event.kind);
  if (!pendingStage || !completedStage) return;
  const application = await tx.application.findFirst({
    where: { id: event.applicationId, userId },
  });
  if (!application || application.stage !== pendingStage) return;
  await writeApplicationProgress(
    tx,
    userId,
    event.applicationId,
    completedStage,
    "等待结果",
    event.kind === "投递" ? new Date() : undefined,
  );
}
export async function GET(request: Request) {
  try {
    const user = await userFor(request);
    const w = { userId: user.id };
    const [
      applications,
      events,
      resumes,
      preparations,
      materials,
      materialRoles,
      interviews,
      files,
      settings,
      jobs,
      heartbeat,
    ] = await Promise.all([
      db.application.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.event.findMany({ where: w, orderBy: { start: "asc" } }),
      db.resume.findMany({ where: w, orderBy: { createdAt: "desc" } }),
      db.preparation.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.material.findMany({
        where: { ...w, archived: false },
        orderBy: { updatedAt: "desc" },
      }),
      db.materialRole.findMany({ where: w, orderBy: { createdAt: "asc" } }),
      db.interview.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.fileAsset.findMany({
        where: w,
        select: {
          id: true,
          applicationId: true,
          purpose: true,
          sortOrder: true,
          name: true,
          mime: true,
          size: true,
        },
      }),
      db.settings.upsert({
        where: { userId: user.id },
        create: { userId: user.id },
        update: {},
      }),
      db.notificationJob.findMany({
        where: w,
        orderBy: { scheduledAt: "desc" },
        take: 100,
      }),
      db.heartbeat.findUnique({ where: { id: "reminders" } }),
    ]);
    const applicationsWithAutomaticStatus = applications.map((application) => {
      const eventKind = eventKindForApplicationStage(application.stage);
      const hasPendingEvent = Boolean(
        eventKind &&
          events.some(
            (event) =>
              event.applicationId === application.id &&
              event.kind === eventKind &&
              event.status === "待完成",
          ),
      );
      const stageStatus = automaticApplicationStageStatus(application.stage, {
        hasPendingEvent,
        keepWaiting: application.stageStatus === "等待结果",
      });
      return stageStatus === application.stageStatus
        ? application
        : { ...application, stageStatus };
    });
    return Response.json({
      applications: applicationsWithAutomaticStatus,
      events,
      resumes,
      preparations,
      materials,
      materialRoles,
      interviews,
      files,
      settings: {
        email: settings.email,
        emailVerified: settings.emailVerified,
        availability: settings.availability,
        availabilityConfirmed: settings.availabilityConfirmed,
      },
      jobs,
      services: {
        model: !!(
          process.env.TEXT_MODEL_API_KEY && process.env.TEXT_MODEL_NAME
        ),
        vision: !!(
          process.env.VISION_MODEL_API_KEY && process.env.VISION_MODEL_NAME
        ),
        search: !!(
          process.env.SEARCH_MODEL_API_KEY && process.env.SEARCH_MODEL_NAME
        ),
        generalModel: process.env.TEXT_MODEL_NAME || "",
        polishModel: process.env.TEXT_MODEL_POLISH_NAME || "",
        visionModel: process.env.VISION_MODEL_NAME || "",
        searchModel: process.env.SEARCH_MODEL_NAME || "",
        mailMode: process.env.MAIL_MODE || "unconfigured",
        worker: heartbeat?.updatedAt || null,
      },
      user: { name: user.name, email: user.email },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await userFor(request);
    const raw = await request.json();
    const action = z.string().parse(raw.action);
    const id = z.string().optional().parse(raw.id);
    const w = { userId: user.id };
    const own = async (
      table:
        | "application"
        | "event"
        | "resume"
        | "preparation"
        | "material"
        | "interview",
      target: string | undefined,
    ) => {
      if (!target) throw new Error("缺少记录编号");
      const item = await (
        db[table] as unknown as {
          findFirst: (x: unknown) => Promise<{ id: string; version?: number }>;
        }
      ).findFirst({ where: { id: target, ...w } });
      if (!item) throw new Error("记录不存在");
      return item;
    };
    if (action === "application.save") {
      const values = appSchema.parse(raw.values);
      const hasScheduleInput = Object.prototype.hasOwnProperty.call(
        raw,
        "schedule",
      );
      const schedule = hasScheduleInput
        ? applicationScheduleSchema.parse(raw.schedule)
        : undefined;
      const eventKind = eventKindForApplicationStage(values.stage);
      if (schedule && !eventKind)
        throw new Error("当前阶段不能创建关联日程");
      if (
        schedule?.mode === "upsert" &&
        schedule.absoluteReminders.some((reminder) => reminder <= new Date())
      )
        throw new Error("自定义提醒时间必须在未来，请移除已经过去的时间");
      if (values.resumeId) await own("resume", values.resumeId);
      if (values.stage !== "待投递" && !values.appliedAt)
        throw new Error("请填写实际投递日期");
      const saved = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
        const old = id
          ? await tx.application.findFirst({ where: { id, ...w } })
          : null;
        if (id && !old) throw new Error("记录不存在");
        if (old) {
          if (old.version !== raw.version)
            throw new Error("记录已在其他设备修改，请刷新后重试");
        }
        const applicationId = old?.id || "";
        const existingEvent =
          applicationId && eventKind
            ? await tx.event.findFirst({
                where: {
                  ...w,
                  applicationId,
                  kind: eventKind,
                  status: "待完成",
                },
                orderBy: { updatedAt: "desc" },
              })
            : null;
        const stageStatus = automaticApplicationStageStatus(values.stage, {
          hasPendingEvent:
            schedule?.mode === "upsert" ||
            (!schedule && Boolean(existingEvent)),
          keepWaiting:
            !schedule &&
            old?.stage === values.stage &&
            old.stageStatus === "等待结果",
        });
        const history = old
          ? ([...(old.history as Prisma.JsonArray)] as Prisma.JsonArray)
          : [];
        history.push({
          at: new Date().toISOString(),
          from: old
            ? `${old.stage} · ${old.stageStatus}`
            : "新建",
          to: `${values.stage} · ${stageStatus}`,
          resumeId: values.resumeId ?? null,
        });
        const application = old
          ? await tx.application.update({
              where: { id: old.id },
              data: {
                ...values,
                stageStatus,
                version: { increment: 1 },
                history,
              },
            })
          : await tx.application.create({
              data: { ...values, stageStatus, ...w, history },
            });
        if (!eventKind || !schedule) return application;
        const linkedEvent = existingEvent;
        if (schedule.mode === "remove") {
          if (linkedEvent) {
            await tx.event.update({
              where: { id: linkedEvent.id },
              data: { status: "已取消", version: { increment: 1 } },
            });
            await tx.notificationJob.updateMany({
              where: {
                eventId: linkedEvent.id,
                state: { in: ["pending", "sending"] },
              },
              data: { state: "cancelled" },
            });
          }
          return application;
        }
        if (schedule.start) {
          const events = await tx.event.findMany({
            where: {
              ...w,
              status: "待完成",
              id: { not: linkedEvent?.id || "" },
            },
            select: { id: true, start: true, end: true },
          });
          if (
            !schedule.allowConflict &&
            events.some(
              (event) =>
                event.start &&
                overlaps(
                  schedule.start!,
                  schedule.end ?? new Date(schedule.start!.getTime() + 3600000),
                  event.start,
                  event.end ?? new Date(event.start.getTime() + 3600000),
                ),
            )
          )
            throw new Error("时间与已有日程冲突。勾选允许冲突后可继续保存");
        }
        if (linkedEvent)
          await tx.notificationJob.updateMany({
            where: {
              eventId: linkedEvent.id,
              state: { in: ["pending", "sending"] },
            },
            data: { state: "cancelled" },
          });
        const eventValues = {
          applicationId: application.id,
          title: `${values.company} · ${eventKind === "投递" ? "完成投递" : eventKind}`,
          kind: eventKind,
          start: schedule.start,
          end: schedule.end,
          deadline: schedule.deadline,
          location: schedule.location,
          reminderHours: schedule.reminderHours,
          absoluteReminders: schedule.absoluteReminders,
          status: "待完成",
        };
        const event = linkedEvent
          ? await tx.event.update({
              where: { id: linkedEvent.id },
              data: { ...eventValues, version: { increment: 1 } },
            })
          : await tx.event.create({ data: { ...eventValues, ...w } });
        await createReminderJobs(tx, user.id, event);
        return application;
      });
      return Response.json({
        ok: true,
        id: saved.id,
        version: saved.version,
      });
    } else if (action === "event.save") {
      const values = eventSchema.parse(raw.values);
      if (values.absoluteReminders.some((d) => d <= new Date()))
        throw Error("自定义提醒时间必须在未来，请移除已经过去的时间");
      if (values.applicationId) await own("application", values.applicationId);
      const item = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
        const old = id
          ? await tx.event.findFirst({ where: { id, ...w } })
          : null;
        if (id && !old) throw new Error("记录不存在");
        if (old && old.version !== raw.version)
          throw new Error("日程已更新，请刷新");
        if (values.start) {
          const all = await tx.event.findMany({
            where: { ...w, status: "待完成", id: { not: id || "" } },
            select: { id: true, start: true, end: true },
          });
          if (
            !raw.allowConflict &&
            all.some(
              (e) =>
                e.start &&
                overlaps(
                  values.start!,
                  values.end ?? new Date(values.start!.getTime() + 3600000),
                  e.start,
                  e.end ?? new Date(e.start.getTime() + 3600000),
                ),
            )
          )
            throw new Error("时间与已有日程冲突。勾选允许冲突后可继续保存");
        }
        if (old) {
          await tx.notificationJob.updateMany({
            where: { eventId: id, state: { in: ["pending", "sending"] } },
            data: { state: "cancelled" },
          });
        }
        const item = id
          ? await tx.event.update({
              where: { id },
              data: { ...values, version: { increment: 1 } },
            })
          : await tx.event.create({ data: { ...values, ...w } });
        if (item.status === "待完成") {
          await syncApplicationForPendingEvent(tx, user.id, item);
          await createReminderJobs(tx, user.id, item);
        }
        return item;
      });
      return Response.json({ ok: true, event: item });
    } else if (action === "event.status") {
      await own("event", id);
      const status = z.enum(["待完成", "已完成", "已取消"]).parse(raw.status);
      const item = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
        const old = await tx.event.findUniqueOrThrow({ where: { id } });
        if (old.version !== raw.version) throw new Error("日程已更新，请刷新");
        const e = await tx.event.update({
          where: { id },
          data: { status, version: { increment: 1 } },
        });
        await tx.notificationJob.updateMany({
          where: { eventId: id, state: { in: ["pending", "sending"] } },
          data: { state: "cancelled" },
        });
        if (status === "待完成") {
          await syncApplicationForPendingEvent(tx, user.id, e);
          await createReminderJobs(tx, user.id, e);
        } else if (status === "已完成")
          await syncApplicationForCompletedEvent(tx, user.id, e);
        else await syncApplicationAfterEventRemoval(tx, user.id, e);
        return e;
      });
      return Response.json({ ok: true, event: item });
    } else if (action === "event.delete") {
      await own("event", id);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
        const event = await tx.event.findUniqueOrThrow({ where: { id } });
        await tx.notificationJob.updateMany({
          where: { eventId: id, ...w, state: { in: ["pending", "sending"] } },
          data: { state: "cancelled" },
        });
        await tx.preparation.updateMany({
          where: { eventId: id, ...w },
          data: { eventId: null },
        });
        await tx.event.delete({ where: { id } });
        if (event.status === "待完成")
          await syncApplicationAfterEventRemoval(tx, user.id, event);
      });
      return Response.json({ ok: true, deletedEventId: id });
    } else if (action === "resume.current") {
      await own("resume", id);
      await db.$transaction(async (tx) => {
        const r = await tx.resume.findUniqueOrThrow({ where: { id } });
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id + r.series}))::text`;
        await tx.resume.updateMany({
          where: { ...w, series: r.series },
          data: { current: false },
        });
        await tx.resume.update({
          where: { id },
          data: { current: true, archived: false },
        });
      });
    } else if (action === "resume.archive") {
      await own("resume", id);
      await db.resume.update({
        where: { id },
        data: { archived: true, current: false },
      });
    } else if (action === "preparation.save") {
      const values = z
        .object({
          company: text.min(1),
          role: text.min(1),
          round: text.default("一面"),
          jd: text.default(""),
          applicationId: z.string().nullable().optional(),
          eventId: z.string().nullable().optional(),
          resumeId: z.string().nullable().optional(),
        })
        .parse(raw.values);
      if (values.applicationId) await own("application", values.applicationId);
      if (values.eventId) await own("event", values.eventId);
      if (values.resumeId) await own("resume", values.resumeId);
      if (id) {
        await own("preparation", id);
        await db.preparation.update({ where: { id }, data: values });
      } else {
        const item = await db.preparation.create({ data: { ...w, ...values } });
        return Response.json({ ok: true, id: item.id });
      }
    } else if (action === "material.import") {
      const key = z.string().uuid().parse(raw.key);
      const values = z.array(materialSchema).min(1).max(300).parse(raw.items);
      for (const v of values)
        if (v.preparationId) await own("preparation", v.preparationId);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id + key}))::text`;
        const existing = await tx.draft.findUnique({ where: { id: key } });
        if (existing) {
          if (existing.userId !== user.id) throw Error("无效导入标识");
          return;
        }
        await tx.draft.create({
          data: {
            id: key,
            ...w,
            kind: "import",
            input: "用户确认导入",
            result: values as Prisma.InputJsonValue,
            confirmed: true,
          },
        });
        for (const roleScope of [
          ...new Set(
            values
              .filter((v) => v.category === "岗位特有" && v.roleScope)
              .map((v) => v.roleScope),
          ),
        ])
          await tx.materialRole.upsert({
            where: { userId_name: { userId: user.id, name: roleScope } },
            create: { ...w, name: roleScope },
            update: {},
          });
        for (const v of values)
          await tx.material.create({ data: { ...w, ...v } });
      });
    } else if (action === "interview.create") {
      await own("preparation", raw.preparationId);
      const questions = z
        .array(z.string().min(1).max(2000))
        .min(1)
        .max(20)
        .parse(raw.questions);
      const item = await db.interview.create({
        data: {
          ...w,
          preparationId: raw.preparationId,
          questions: questions.map((question) => ({
            question,
            sourceIds: [],
            basis: "用户自定义练习题",
          })),
        },
      });
      return Response.json({ id: item.id });
    } else if (action === "material.save") {
      const values = materialSchema.parse(raw.values);
      if (values.preparationId) await own("preparation", values.preparationId);
      if (values.parentId) await own("material", values.parentId);
      if (values.category === "岗位特有" && values.roleScope)
        await db.materialRole.upsert({
          where: {
            userId_name: { userId: user.id, name: values.roleScope },
          },
          create: { ...w, name: values.roleScope },
          update: {},
        });
      if (id) {
        await own("material", id);
        await db.$transaction(async (tx) => {
          const old = await tx.material.findUniqueOrThrow({ where: { id } });
          const r = await tx.material.updateMany({
            where: { id, ...w, version: raw.version },
            data: {
              ...values,
              version: { increment: 1 },
              revisions: [
                ...(old.revisions as Prisma.JsonArray),
                { content: old.content, at: new Date().toISOString() },
              ],
            },
          });
          if (r.count !== 1) throw new Error("资料已被修改，请刷新后重试");
        });
      } else await db.material.create({ data: { ...values, ...w } });
    } else if (action === "materialRole.save") {
      const name = text
        .min(1)
        .max(60)
        .refine(
          (value) => !["通用", "待确认"].includes(value),
          "该名称为系统保留分类",
        )
        .parse(raw.name);
      const role = await db.materialRole.upsert({
        where: { userId_name: { userId: user.id, name } },
        create: { ...w, name },
        update: {},
      });
      return Response.json({ ok: true, id: role.id });
    } else if (action === "material.archive") {
      await own("material", id);
      await db.material.update({ where: { id }, data: { archived: true } });
    } else if (action === "settings.save") {
      const v = z
        .object({
          email: z.union([z.email(), z.literal("")]),
          availabilityConfirmed: z.boolean(),
          availability: z
            .object({
              weekdays: z.tuple([
                z.number().min(0).max(23),
                z.number().min(1).max(24),
              ]),
              weekends: z.tuple([
                z.number().min(0).max(23),
                z.number().min(1).max(24),
              ]),
            })
            .refine(
              (v) =>
                v.weekdays[0] < v.weekdays[1] && v.weekends[0] < v.weekends[1],
              "可用时段结束时间必须晚于开始时间",
            ),
        })
        .parse(raw.values);
      const old = await db.settings.findUnique({ where: { userId: user.id } });
      await db.settings.upsert({
        where: { userId: user.id },
        create: { ...w, ...v },
        update: {
          ...v,
          ...(old?.email !== v.email
            ? { emailVerified: false, verifyToken: null }
            : {}),
        },
      });
    } else if (action === "mail.test") {
      const settings = await db.settings.findUnique({
        where: { userId: user.id },
      });
      if (!settings?.email) throw new Error("请先保存收件邮箱");
      const token = randomBytes(24).toString("hex");
      await db.settings.update({
        where: { userId: user.id },
        data: {
          verifyToken: createHash("sha256").update(token).digest("hex"),
          verifyExpires: new Date(Date.now() + 1800000),
        },
      });
      await sendMail(
        settings.email,
        "求职手账 · 验证提醒邮箱",
        `点击链接验证收件邮箱（30 分钟内有效）：${process.env.APP_URL}/api/verify?token=${token}\n\n这是一封测试邮件。`,
      );
    } else if (action === "interview.answer") {
      await own("interview", id);
      const index = z.number().int().min(0).max(30).parse(raw.index);
      const answer = text.parse(raw.answer);
      const current = await db.interview.findUniqueOrThrow({ where: { id } });
      if (index >= (current.questions as Prisma.JsonArray).length)
        throw new Error("问题不存在");
      const turns = current.turns as Prisma.JsonArray;
      turns[index] = { answer };
      const changed = await db.interview.updateMany({
        where: { id, ...w, version: raw.version },
        data: { turns, version: { increment: 1 } },
      });
      if (!changed.count) throw new Error("会话已更新，请刷新");
      return Response.json({ ok: true, version: current.version + 1 });
    } else if (action === "interview.confirm") {
      await own("interview", id);
      await db.$transaction(async (tx) => {
        const current = await tx.interview.findUniqueOrThrow({ where: { id } });
        const i = z.number().int().min(0).parse(raw.index);
        const turns = current.turns as Prisma.JsonArray;
        const turn = turns[i] as Prisma.JsonObject;
        if (!turn) throw new Error("请先回答");
        if (turn.confirmed) return;
        const questions = current.questions as Prisma.JsonArray;
        const q = questions[i] as Prisma.JsonObject;
        const content = text.min(1).parse(raw.content);
        const changed = await tx.interview.updateMany({
          where: { id, ...w, version: raw.version },
          data: {
            version: { increment: 1 },
            turns: turns.map((v, n) =>
              n === i ? { ...turn, confirmed: true, suggestion: content } : v,
            ),
          },
        });
        if (!changed.count) throw new Error("会话已更新，请刷新");
        await tx.material.create({
          data: {
            ...w,
            preparationId: current.preparationId,
            title: String(q.question),
            content,
            category: "待确认",
            kind: "边界或分类待确认",
            source: `模拟面试 ${current.id} 第 ${i + 1} 题`,
            revisions: [
              { content: String(turn.answer), at: new Date().toISOString() },
            ],
          },
        });
      });
    } else throw new Error("不支持的操作");
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
