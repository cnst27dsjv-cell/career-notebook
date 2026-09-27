import { z } from "zod";

export const assistantActionSchema = z
  .object({
    key: z.string().min(1).max(80),
    action: z.enum([
      "application.save",
      "event.save",
      "event.status",
      "preparation.save",
      "material.reuse",
    ]),
    id: z.string().optional(),
    values: z.record(z.string(), z.unknown()).default({}),
    status: z.enum(["待完成", "已完成", "已取消"]).optional(),
    reason: z.string().max(1000),
  })
  .strict();
export const assistantReplySchema = z.object({
  reply: z.string().min(1).max(6000),
  missing: z.array(z.string().max(300)).max(8).default([]),
  actions: z.array(assistantActionSchema).max(5).default([]),
  sourceIds: z.array(z.string()).max(20).default([]),
});
export type AssistantAction = z.infer<typeof assistantActionSchema>;
export type ExpectedRecord = {
  table: "application" | "event" | "preparation" | "material";
  id: string;
  version: number;
};
export type AssistantPlan = {
  actions: (AssistantAction & {
    before?: Record<string, unknown>;
    version?: number;
  })[];
  expected: ExpectedRecord[];
  calendarFingerprint?: string;
  sources: { id: string; label: string }[];
  warnings: string[];
  missing: string[];
};
export const actionLabels: Record<AssistantAction["action"], string> = {
  "application.save": "保存投递",
  "event.save": "保存日程",
  "event.status": "更新日程状态",
  "preparation.save": "保存面试准备",
  "material.reuse": "复用面试资料",
};
export const fieldLabels: Record<string, string> = {
  company: "公司",
  role: "岗位",
  city: "城市",
  batch: "批次",
  stage: "阶段",
  outcome: "结果",
  appliedAt: "投递时间",
  url: "职位链接",
  jd: "岗位描述",
  notes: "备注",
  resumeId: "简历版本",
  applicationId: "关联投递",
  eventId: "关联日程",
  preparationId: "面试准备",
  title: "标题",
  kind: "类型",
  round: "轮次",
  start: "开始",
  end: "结束",
  deadline: "截止",
  location: "地点/链接",
  reminderHours: "提前提醒（小时）",
  absoluteReminders: "指定提醒时间",
  status: "状态",
  materialId: "来源资料",
};
export function validateReferences(actions: AssistantAction[]) {
  const seen = new Map<string, string>();
  for (const a of actions) {
    if (seen.has(a.key)) throw Error("行动编号重复，请重新整理");
    for (const field of [
      "applicationId",
      "eventId",
      "preparationId",
      "resumeId",
      "materialId",
    ]) {
      const value = a.values[field];
      if (typeof value !== "string" || !value.startsWith("$")) continue;
      const expected = {
        applicationId: "application.save",
        eventId: "event.save",
        preparationId: "preparation.save",
      }[field];
      if (!expected || seen.get(value.slice(1)) !== expected)
        throw Error("关联行动缺失或顺序错误，请重新整理");
    }
    seen.set(a.key, a.action);
  }
}
