import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { allReminderTimes, overlaps } from "@/lib/rules";
import { sendMail } from "@/lib/mail";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
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
  stageStatus: z.enum(["待安排", "待完成", "等待结果"]),
  outcome: z
    .enum(["", "未通过", "主动撤回", "录用已接受", "录用已拒绝"])
    .default(""),
  appliedAt: date,
  url: text
    .refine((v) => !v || /^https?:\/\//.test(v), "链接应以 http 或 https 开头")
    .default(""),
  notes: text.default(""),
  resumeId: z.string().nullable().optional(),
});
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
        select: { id: true, name: true, size: true },
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
    return Response.json({
      applications,
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
        model: !!(process.env.MODEL_API_KEY && process.env.MODEL_NAME),
        search: !!(process.env.MODEL_API_KEY && process.env.MODEL_SEARCH_NAME),
        generalModel: process.env.MODEL_NAME || "",
        polishModel: process.env.MODEL_POLISH_NAME || "",
        searchModel: process.env.MODEL_SEARCH_NAME || "",
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
      if (values.resumeId) await own("resume", values.resumeId);
      if (values.stage !== "待投递" && !values.appliedAt)
        throw new Error("请填写实际投递日期");
      if (id) {
        await own("application", id);
        await db.$transaction(async (tx) => {
          const old = await tx.application.findUniqueOrThrow({ where: { id } });
          if (old.version !== raw.version)
            throw new Error("记录已在其他设备修改，请刷新后重试");
          const history = old.history as Prisma.JsonArray;
          history.push({
            at: new Date().toISOString(),
            from: `${old.stage} · ${old.stageStatus}`,
            to: `${values.stage} · ${values.stageStatus}`,
            resumeId: values.resumeId ?? null,
          });
          const changed = await tx.application.updateMany({
            where: { id, userId: user.id, version: raw.version },
            data: { ...values, version: { increment: 1 }, history },
          });
          if (changed.count !== 1) throw new Error("版本冲突，请刷新");
        });
      } else
        await db.application.create({
          data: {
            ...values,
            ...w,
            history: [
              { at: new Date().toISOString(), from: "新建", to: values.stage },
            ],
          },
        });
    } else if (action === "event.save") {
      const values = eventSchema.parse(raw.values);
      if (values.absoluteReminders.some((d) => d <= new Date()))
        throw Error("自定义提醒时间必须在未来，请移除已经过去的时间");
      if (values.applicationId) await own("application", values.applicationId);
      if (id) await own("event", id);
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))::text`;
        if (values.start) {
          const all = await tx.event.findMany({
            where: { ...w, status: "待完成", id: { not: id || "" } },
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
        if (id) {
          const old = await tx.event.findUniqueOrThrow({ where: { id } });
          if (old.version !== raw.version)
            throw new Error("日程已更新，请刷新");
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
        if (item.status === "待完成")
          for (const scheduledAt of allReminderTimes(
            item.start,
            item.deadline,
            item.reminderHours,
            item.absoluteReminders,
          ))
            await tx.notificationJob.create({
              data: {
                ...w,
                eventId: item.id,
                eventVersion: item.version,
                scheduledAt,
              },
            });
      });
    } else if (action === "event.status") {
      await own("event", id);
      const status = z.enum(["待完成", "已完成", "已取消"]).parse(raw.status);
      await db.$transaction(async (tx) => {
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
        if (status === "待完成")
          for (const scheduledAt of allReminderTimes(
            e.start,
            e.deadline,
            e.reminderHours,
            e.absoluteReminders,
          ))
            await tx.notificationJob.create({
              data: {
                ...w,
                eventId: e.id,
                eventVersion: e.version,
                scheduledAt,
              },
            });
        if (status === "已完成" && e.applicationId) {
          const a = await tx.application.findFirst({
            where: { id: e.applicationId, ...w },
          });
          if (a && ["测评", "笔试", "面试", "投递"].includes(e.kind)) {
            const stage = e.kind === "投递" ? "已投递" : e.kind;
            await tx.application.update({
              where: { id: a.id },
              data: {
                stage,
                stageStatus: "等待结果",
                appliedAt: a.appliedAt ?? new Date(),
                version: { increment: 1 },
                history: [
                  ...(a.history as Prisma.JsonArray),
                  {
                    at: new Date().toISOString(),
                    from: a.stage,
                    to: `${stage} · 等待结果`,
                  },
                ],
              },
            });
          }
        }
      });
    } else if (action === "event.delete") {
      await own("event", id);
      await db.$transaction([
        db.notificationJob.updateMany({
          where: { eventId: id, ...w, state: { in: ["pending", "sending"] } },
          data: { state: "cancelled" },
        }),
        db.preparation.updateMany({
          where: { eventId: id, ...w },
          data: { eventId: null },
        }),
        db.event.delete({ where: { id } }),
      ]);
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
