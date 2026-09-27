import {
  eventKindForApplicationStage,
  automaticApplicationStageStatus,
} from "@/lib/application-stage";
import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { executeBusinessAction, materialSchema } from "@/lib/business";
import { sendMail } from "@/lib/mail";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
const text = z.string().trim().max(100000);
export async function GET(request: Request) {
  try {
    const user = await userFor(request);
    const w = { userId: user.id };
    const full = new URL(request.url).searchParams.get("scope") !== "core";
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
      full
        ? db.resume.findMany({ where: w, orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      full
        ? db.preparation.findMany({
            where: w,
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      full
        ? db.material.findMany({
            where: { ...w, archived: false },
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      full
        ? db.materialRole.findMany({
            where: w,
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      full
        ? db.interview.findMany({
            where: w,
            orderBy: { updatedAt: "desc" },
          })
        : Promise.resolve([]),
      full
        ? db.fileAsset.findMany({
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
          })
        : Promise.resolve([]),
      db.settings.findUnique({ where: { userId: user.id } }),
      full
        ? db.notificationJob.findMany({
            where: w,
            orderBy: { scheduledAt: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
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
      partial: !full,
      applications: applicationsWithAutomaticStatus,
      events,
      resumes,
      preparations,
      materials,
      materialRoles,
      interviews,
      files,
      settings: {
        email: settings?.email || "",
        emailVerified: settings?.emailVerified || false,
        availability: settings?.availability || {
          weekdays: [19, 22],
          weekends: [9, 18],
        },
        availabilityConfirmed: settings?.availabilityConfirmed || false,
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
    if (
      [
        "application.save",
        "event.save",
        "event.status",
        "event.delete",
      ].includes(action)
    ) {
      return await db.$transaction((tx) =>
        executeBusinessAction(tx, user.id, raw),
      );
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
        const changed = await db.preparation.updateMany({
          where: { id, ...w, version: z.number().int().parse(raw.version) },
          data: { ...values, version: { increment: 1 } },
        });
        if (!changed.count) throw Error("准备已在其他设备修改，请刷新");
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
