import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { allReminderTimes, overlaps } from "./rules";
import {
  applicationStageForEventKind,
  automaticApplicationStageStatus,
  completedApplicationStageForEventKind,
  eventKindForApplicationStage,
  isManuallyCompletableApplicationStage,
} from "./application-stage";
const text = z.string().trim().max(100000);
const date = z
  .union([z.string().datetime({ offset: true }), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null));
export const appSchema = z.object({
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
    .refine(
      (value) => value.start || value.deadline,
      "请填写执行时间或截止时间",
    )
    .refine(
      (value) => !value.start || !value.end || value.end > value.start,
      "结束时间必须晚于开始时间",
    )
    .refine((value) => !value.end || !!value.start, "结束时间需要执行开始时间")
    .refine(
      (value) =>
        !value.start ||
        !value.deadline ||
        (value.end ?? value.start) <= value.deadline,
      "执行时间不能晚于截止时间",
    ),
]);
export const eventSchema = z
  .object({
    title: text.min(1),
    kind: z.enum(["招聘会", "投递", "测评", "笔试", "面试", "准备", "其他"]),
    round: z.string().max(40).optional(),
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
export const materialSchema = z
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
export async function executeBusinessAction(
  db: Prisma.TransactionClient,
  userId: string,
  raw: Record<string, unknown>,
) {
  const user = { id: userId };
  const w = { userId };
  const action = z.string().parse(raw.action);
  const id = z.string().optional().parse(raw.id);
  const withinTransaction = <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ) => fn(db);
  const own = async (
    table: "application" | "event" | "resume",
    target: string | undefined,
  ) => {
    if (!target) throw Error("缺少记录编号");
    const item = await (
      db[table] as unknown as {
        findFirst: (x: unknown) => Promise<{ id: string }>;
      }
    ).findFirst({ where: { id: target, ...w } });
    if (!item) throw Error("记录不存在");
    return item;
  };
  if (action === "application.save") {
    const values = appSchema.parse(raw.values);
    const hasStageCompletedInput = Object.prototype.hasOwnProperty.call(
      raw,
      "stageCompleted",
    );
    const stageCompleted = z
      .boolean()
      .optional()
      .default(false)
      .parse(raw.stageCompleted);
    if (stageCompleted && !isManuallyCompletableApplicationStage(values.stage))
      throw new Error("当前阶段不能手动标记完成");
    const hasScheduleInput = Object.prototype.hasOwnProperty.call(
      raw,
      "schedule",
    );
    const schedule = hasScheduleInput
      ? applicationScheduleSchema.parse(raw.schedule)
      : undefined;
    const eventKind = eventKindForApplicationStage(values.stage);
    if (schedule && !eventKind) throw new Error("当前阶段不能创建关联日程");
    if (
      !stageCompleted &&
      schedule?.mode === "upsert" &&
      schedule.absoluteReminders.some((reminder) => reminder <= new Date())
    )
      throw new Error("自定义提醒时间必须在未来，请移除已经过去的时间");
    if (values.resumeId) await own("resume", values.resumeId);
    if (values.stage !== "待投递" && !values.appliedAt)
      throw new Error("请填写实际投递日期");
    const saved = await withinTransaction(async (tx) => {
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
      const pendingEvents =
        applicationId && eventKind
          ? await tx.event.findMany({
              where: {
                ...w,
                applicationId,
                kind: eventKind,
                status: "待完成",
              },
              orderBy: { updatedAt: "desc" },
            })
          : [];
      const existingEvent = pendingEvents[0] || null;
      const stageStatus = automaticApplicationStageStatus(values.stage, {
        stageCompleted,
        hasPendingEvent:
          schedule?.mode === "upsert" || (!schedule && Boolean(existingEvent)),
        keepWaiting:
          !hasStageCompletedInput &&
          !schedule &&
          old?.stage === values.stage &&
          old.stageStatus === "等待结果",
      });
      const history = old
        ? ([...(old.history as Prisma.JsonArray)] as Prisma.JsonArray)
        : [];
      history.push({
        at: new Date().toISOString(),
        from: old ? `${old.stage} · ${old.stageStatus}` : "新建",
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
      if (stageCompleted && eventKind) {
        const pendingEventIds = pendingEvents.map((event) => event.id);
        if (pendingEventIds.length)
          await tx.notificationJob.updateMany({
            where: {
              eventId: { in: pendingEventIds },
              state: { in: ["pending", "sending"] },
            },
            data: { state: "cancelled" },
          });
        if (schedule?.mode === "upsert") {
          const completedEventValues = {
            applicationId: application.id,
            title: `${values.company} · ${eventKind}`,
            kind: eventKind,
            start: schedule.start,
            end: schedule.end,
            deadline: schedule.deadline,
            location: schedule.location,
            reminderHours: schedule.reminderHours,
            absoluteReminders: schedule.absoluteReminders,
            status: "已完成",
          };
          if (existingEvent)
            await tx.event.update({
              where: { id: existingEvent.id },
              data: {
                ...completedEventValues,
                version: { increment: 1 },
              },
            });
          else
            await tx.event.create({
              data: { ...completedEventValues, ...w },
            });
          const remainingIds = pendingEventIds.filter(
            (eventId) => eventId !== existingEvent?.id,
          );
          if (remainingIds.length)
            await tx.event.updateMany({
              where: { id: { in: remainingIds }, ...w },
              data: { status: "已完成", version: { increment: 1 } },
            });
        } else if (pendingEventIds.length) {
          await tx.event.updateMany({
            where: { id: { in: pendingEventIds }, ...w },
            data: { status: "已完成", version: { increment: 1 } },
          });
        }
        return application;
      }
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
    const item = await withinTransaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
      const old = id ? await tx.event.findFirst({ where: { id, ...w } }) : null;
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
    const item = await withinTransaction(async (tx) => {
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
    await withinTransaction(async (tx) => {
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
  }
  throw Error("不支持的业务操作");
}
