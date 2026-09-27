import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { appSchema, eventSchema, executeBusinessAction } from "./business";
import { overlaps } from "./rules";
import {
  assistantReplySchema,
  validateReferences,
  type AssistantPlan,
  type ExpectedRecord,
} from "./assistant-schema";
import type { AssistantContext } from "./assistant-context";

export const preparationSchema = z.object({
  company: z.string().trim().min(1),
  role: z.string().trim().min(1),
  round: z.string().max(40).default("一面"),
  jd: z.string().max(100000).default(""),
  applicationId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  resumeId: z.string().nullable().optional(),
});
const fields = {
  "application.save": [
    "company",
    "role",
    "city",
    "batch",
    "stage",
    "outcome",
    "appliedAt",
    "url",
    "jd",
    "notes",
    "resumeId",
  ],
  "event.save": [
    "applicationId",
    "title",
    "kind",
    "round",
    "start",
    "end",
    "deadline",
    "location",
    "notes",
    "reminderHours",
    "absoluteReminders",
  ],
  "preparation.save": [
    "company",
    "role",
    "round",
    "jd",
    "applicationId",
    "eventId",
    "resumeId",
  ],
  "material.reuse": ["materialId", "preparationId"],
  "event.status": [],
};
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));
export function calendarFingerprint(
  events: { id: string; version: number; status: string }[],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        events
          .filter((e) => e.status === "待完成")
          .map((e) => `${e.id}:${e.version}`)
          .sort(),
      ),
    )
    .digest("hex");
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
export function hashPlan(plan: AssistantPlan) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(plan)))
    .digest("hex");
}
export function compilePlan(
  reply: z.infer<typeof assistantReplySchema>,
  ctx: AssistantContext,
): AssistantPlan {
  validateReferences(reply.actions);
  const expected: ExpectedRecord[] = [];
  const warnings: string[] = [];
  const missing = [...reply.missing];
  function expect(
    table: ExpectedRecord["table"],
    row: { id: string; version: number },
  ) {
    if (!expected.some((e) => e.table === table && e.id === row.id))
      expected.push({ table, id: row.id, version: row.version });
  }
  const actions = reply.actions.map((a) => {
    const table = a.action.startsWith("application")
      ? "application"
      : a.action.startsWith("event")
        ? "event"
        : a.action.startsWith("preparation")
          ? "preparation"
          : null;
    const rows =
      table === "application"
        ? ctx.applications
        : table === "event"
          ? ctx.events
          : table === "preparation"
            ? ctx.preparations
            : [];
    const old = a.id ? rows.find((x) => x.id === a.id) : undefined;
    if (a.id && !old) throw Error("未找到要修改的记录，请明确公司、岗位或场次");
    if (old && table) expect(table, old);
    if (a.action === "event.status" && (!old || !a.status))
      throw Error("完成或取消日程需要明确记录和状态");
    if (
      Object.keys(a.values).some(
        (k) => !(fields[a.action] as string[]).includes(k),
      )
    )
      throw Error("草稿包含不支持的字段，请重新整理");
    const before = old
      ? (plain(old) as unknown as Record<string, unknown>)
      : undefined;
    const merged = { ...before, ...a.values };
    const values: Record<string, unknown> = {};
    for (const key of fields[a.action])
      if (merged[key] !== undefined) values[key] = merged[key];
    if (a.action === "application.save") {
      values.stage ??= "待投递";
      if (values.stage !== "待投递" && !values.appliedAt)
        missing.push("请补充实际投递日期");
      // Zod validates all business dates and enums before a draft becomes confirmable.
      try {
        Object.assign(values, plain(appSchema.parse(values)));
      } catch {
        missing.push("投递信息不完整：请补充公司、岗位或有效日期");
      }
      if (
        !old &&
        ctx.applications.some(
          (x) =>
            x.company === values.company &&
            x.role === values.role &&
            x.batch === values.batch,
        )
      )
        warnings.push(
          "已有相同公司、岗位和批次的投递；请明确是否仍要另建一条。",
        );
    }
    if (a.action === "event.save") {
      try {
        Object.assign(values, plain(eventSchema.parse(values)));
      } catch {
        missing.push(
          "日程信息不完整：请补充标题、准确起止/截止时间，结束必须晚于开始",
        );
      }
      if (
        !old &&
        ctx.events.some(
          (x) =>
            x.title === values.title &&
            String(x.start?.toISOString() || "") === String(values.start || ""),
        )
      )
        warnings.push("已有相同标题和时间的日程，请核对是否重复。");
      if (values.start && Number.isFinite(Date.parse(String(values.start)))) {
        const start = new Date(String(values.start));
        const end = new Date(
          String(
            values.end || new Date(start.getTime() + 3600000).toISOString(),
          ),
        );
        if (
          ctx.events.some(
            (e) =>
              e.id !== a.id &&
              e.status === "待完成" &&
              e.start &&
              overlaps(
                start,
                end,
                e.start,
                e.end || new Date(e.start.getTime() + 3600000),
              ),
          )
        )
          warnings.push("时间与已有日程冲突；确认继续会保留重叠安排。");
      }
      const reminderHours = values.reminderHours as number[] | undefined;
      if (
        reminderHours?.some((h) =>
          [values.start, values.deadline].some(
            (t) =>
              t && new Date(String(t)).getTime() - h * 3600000 <= Date.now(),
          ),
        )
      )
        warnings.push(
          "部分提前提醒时间已过，保存后只安排未来提醒；可修改时间或提醒。",
        );
      if (
        (values.absoluteReminders as string[] | undefined)?.some(
          (t) => Date.parse(t) <= Date.now(),
        )
      )
        missing.push("指定提醒时间已过，请移除或改到未来");
    }
    if (a.action === "preparation.save") {
      try {
        Object.assign(values, preparationSchema.parse(values));
      } catch {
        missing.push("面试准备需要公司和岗位");
      }
      if (
        !old &&
        ctx.preparations.some(
          (p) =>
            p.company === values.company &&
            p.role === values.role &&
            p.round === values.round,
        )
      )
        warnings.push("已有相同岗位和轮次的准备，请核对是否复用已有记录。");
    }
    if (
      a.action === "material.reuse" &&
      (!values.materialId || !values.preparationId)
    )
      missing.push("请选择来源资料和目标面试准备");
    for (const [field, refTable, records] of [
      ["applicationId", "application", ctx.applications],
      ["eventId", "event", ctx.events],
      ["preparationId", "preparation", ctx.preparations],
      ["materialId", "material", ctx.materials],
      ["resumeId", null, ctx.resumes],
    ] as const) {
      const id = values[field];
      if (!id) continue;
      if (typeof id !== "string") throw Error("关联编号无效");
      if (id.startsWith("$")) continue;
      const row = records.find((x) => x.id === id);
      if (!row) throw Error("关联资料不可用，请重新选择");
      if (refTable) expect(refTable, row as { id: string; version: number });
    }
    if (
      table === "event" &&
      old &&
      "applicationId" in old &&
      old.applicationId
    ) {
      const app = ctx.applications.find((x) => x.id === old.applicationId);
      if (app) expect("application", app);
    }
    return { ...a, values, before, version: old?.version };
  });
  const sourceIds = [
    ...new Set([
      ...reply.sourceIds,
      ...expected.map((e) => e.id),
      ...actions.flatMap((a) =>
        Object.entries(a.values)
          .filter(
            ([k, v]) =>
              k.endsWith("Id") && typeof v === "string" && !v.startsWith("$"),
          )
          .map(([, v]) => String(v)),
      ),
    ]),
  ];
  const sources = sourceIds.map((id) => ctx.sources.find((s) => s.id === id));
  if (sources.some((s) => !s)) throw Error("资料引用无效，请重新整理");
  return plain({
    actions,
    expected,
    calendarFingerprint: actions.some((a) => a.action.startsWith("event"))
      ? calendarFingerprint(ctx.events)
      : undefined,
    sources: sources.filter((s): s is { id: string; label: string } => !!s),
    warnings: [...new Set(warnings)],
    missing: [...new Set(missing)],
  });
}

export async function executePlan(
  tx: Prisma.TransactionClient,
  userId: string,
  plan: AssistantPlan,
  allowWarnings: boolean,
) {
  if (plan.missing.length) throw Error("请先补全草稿中的缺失信息");
  if (plan.warnings.length && !allowWarnings)
    throw Error("请先核对并勾选草稿提示");
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`;
  for (const ref of plan.expected) {
    const row = await (
      tx[ref.table] as unknown as {
        findFirst: (x: unknown) => Promise<{ version: number } | null>;
      }
    ).findFirst({ where: { id: ref.id, userId } });
    if (!row || row.version !== ref.version)
      throw Error(
        "记录已变化，请发送补充消息重新生成草稿，不能覆盖其他设备的修改",
      );
  }
  if (
    plan.calendarFingerprint &&
    calendarFingerprint(
      await tx.event.findMany({
        where: { userId },
        select: { id: true, version: true, status: true },
      }),
    ) !== plan.calendarFingerprint
  )
    throw Error("日程已变化，请重新整理草稿并核对冲突");
  const ids: Record<string, string> = Object.create(null);
  const receipt: { key: string; id: string; action: string }[] = [];
  for (const a of plan.actions) {
    const values = { ...a.values };
    for (const field of [
      "applicationId",
      "eventId",
      "preparationId",
      "resumeId",
      "materialId",
    ]) {
      if (typeof values[field] === "string" && values[field].startsWith("$")) {
        const id = ids[values[field].slice(1)];
        if (!id) throw Error("关联行动尚未完成");
        values[field] = id;
      }
    }
    // Recheck ownership even if a reference was archived/deleted after planning.
    for (const [field, table] of [
      ["applicationId", "application"],
      ["eventId", "event"],
      ["preparationId", "preparation"],
      ["resumeId", "resume"],
      ["materialId", "material"],
    ] as const) {
      if (
        values[field] &&
        !(await (
          tx[table] as unknown as {
            findFirst: (x: unknown) => Promise<unknown>;
          }
        ).findFirst({ where: { id: values[field], userId } }))
      )
        throw Error("关联记录已不存在");
    }
    if (
      !a.id &&
      a.action === "application.save" &&
      !plan.warnings.some((w) => w.includes("相同公司"))
    ) {
      if (
        await tx.application.findFirst({
          where: {
            userId,
            company: String(values.company),
            role: String(values.role),
            batch: String(values.batch),
          },
        })
      )
        throw Error("刚刚出现相同投递，请重新核对以免重复创建");
    }
    let savedId: string;
    if (a.action === "preparation.save") {
      const data = preparationSchema.parse(values);
      if (data.eventId && data.applicationId) {
        const event = await tx.event.findFirst({
          where: { id: data.eventId, userId },
        });
        if (event?.applicationId && event.applicationId !== data.applicationId)
          throw Error("面试日程和准备指向不同投递，请重新核对");
      }
      const item = a.id
        ? await tx.preparation.update({
            where: { id: a.id },
            data: { ...data, version: { increment: 1 } },
          })
        : await tx.preparation.create({ data: { ...data, userId } });
      savedId = item.id;
    } else if (a.action === "material.reuse") {
      const source = await tx.material.findFirst({
        where: { id: String(values.materialId), userId, archived: false },
      });
      if (!source) throw Error("来源资料不可用");
      const copy = await tx.material.create({
        data: {
          userId,
          preparationId: String(values.preparationId),
          title: source.title,
          category: source.category,
          kind: source.kind,
          roleScope: source.roleScope,
          content: source.content,
          tags: source.tags,
          parentId: source.id,
          source: `复用 ${source.id} v${source.version}`,
          revisions: [],
        },
      });
      savedId = copy.id;
    } else {
      // A prior action in this SAME transaction may have incremented the target version.
      const table = a.action.startsWith("application")
        ? "application"
        : "event";
      const current = a.id
        ? await (
            tx[table] as unknown as {
              findFirst: (x: unknown) => Promise<{ version: number } | null>;
            }
          ).findFirst({ where: { id: a.id, userId } })
        : null;
      const response = await executeBusinessAction(tx, userId, {
        action: a.action,
        id: a.id,
        values,
        version: current?.version,
        status: a.status,
        allowConflict:
          allowWarnings && plan.warnings.some((w) => w.includes("冲突")),
      });
      const result = await response.json();
      savedId = result.id || result.event?.id || a.id;
    }
    ids[a.key] = savedId;
    receipt.push({ key: a.key, id: savedId, action: a.action });
  }
  return receipt;
}
