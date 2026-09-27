import { describe, it, expect } from "vitest";
import {
  assistantReplySchema,
  validateReferences,
} from "../lib/assistant-schema";
import {
  compilePlan,
  hashPlan,
  calendarFingerprint,
} from "../lib/assistant-plan";
import type { AssistantContext } from "../lib/assistant-context";
const context = {
  applications: [],
  events: [],
  preparations: [],
  resumes: [],
  materials: [],
  sources: [],
  model: {},
} as unknown as AssistantContext;
const parse = (actions: unknown[], missing: string[] = []) =>
  assistantReplySchema.parse({ reply: "待确认", actions, missing });
describe("助理行动边界", () => {
  it.each(["event.delete", "mail.send", "shell.run", "resume.delete"])(
    "拒绝白名单外动作 %s",
    (action) => {
      expect(() =>
        parse([{ key: "a", action, values: {}, reason: "test" }]),
      ).toThrow();
    },
  );
  it("拒绝超过5项操作", () =>
    expect(() =>
      parse(
        Array.from({ length: 6 }, (_, i) => ({
          key: `a${i}`,
          action: "application.save",
          values: {},
          reason: "test",
        })),
      ),
    ).toThrow());
  it("拒绝前向引用和错误类型", () => {
    expect(() =>
      validateReferences(
        parse([
          {
            key: "e",
            action: "event.save",
            values: { applicationId: "$a" },
            reason: "x",
          },
        ]).actions,
      ),
    ).toThrow();
    expect(() =>
      validateReferences(
        parse([
          { key: "a", action: "event.save", values: {}, reason: "x" },
          {
            key: "e",
            action: "event.save",
            values: { applicationId: "$a" },
            reason: "x",
          },
        ]).actions,
      ),
    ).toThrow();
  });
  it("接受投递→日程→准备的依赖", () => {
    expect(() =>
      validateReferences(
        parse([
          { key: "a", action: "application.save", values: {}, reason: "x" },
          {
            key: "e",
            action: "event.save",
            values: { applicationId: "$a" },
            reason: "x",
          },
          {
            key: "p",
            action: "preparation.save",
            values: { applicationId: "$a", eventId: "$e" },
            reason: "x",
          },
        ]).actions,
      ),
    ).not.toThrow();
  });
  it("拒绝重复动作编号", () =>
    expect(() =>
      validateReferences(
        parse(
          Array(2).fill({
            key: "a",
            action: "event.save",
            values: {},
            reason: "x",
          }),
        ).actions,
      ),
    ).toThrow());
  it.each(["company", "role"])("缺失投递%s时禁止确认", (field) => {
    const values: Record<string, string> = { company: "A", role: "产品经理" };
    delete values[field];
    expect(
      compilePlan(
        parse([{ key: "a", action: "application.save", values, reason: "x" }]),
        context,
      ).missing.length,
    ).toBeGreaterThan(0);
  });
  it("已投递不能猜实际日期", () =>
    expect(
      compilePlan(
        parse([
          {
            key: "a",
            action: "application.save",
            values: { company: "A", role: "产品", stage: "已投递" },
            reason: "x",
          },
        ]),
        context,
      ).missing,
    ).toContain("请补充实际投递日期"));
  it.each([
    { start: null },
    { start: "周五" },
    { start: "2030-01-01T10:00:00+08:00", end: "2030-01-01T09:00:00+08:00" },
  ])("日期不明确或倒序需要补充", (values) =>
    expect(
      compilePlan(
        parse([
          {
            key: "e",
            action: "event.save",
            values: { title: "面试", kind: "面试", ...values },
            reason: "x",
          },
        ]),
        context,
      ).missing.length,
    ).toBeGreaterThan(0),
  );
  it("不存在的记录和来源不能使用", () => {
    expect(() =>
      compilePlan(
        parse([
          {
            key: "e",
            action: "event.status",
            id: "other-user",
            status: "已完成",
            reason: "x",
          },
        ]),
        context,
      ),
    ).toThrow();
    expect(() =>
      compilePlan(
        assistantReplySchema.parse({ reply: "x", sourceIds: ["fake"] }),
        context,
      ),
    ).toThrow();
  });
  it("拒绝写入额外字段", () =>
    expect(() =>
      compilePlan(
        parse([
          {
            key: "a",
            action: "application.save",
            values: { company: "A", role: "产品", userId: "other" },
            reason: "x",
          },
        ]),
        context,
      ),
    ).toThrow());
  it("缺失信息保留且哈希随内容变化", () => {
    const plan = compilePlan(parse([], ["哪场面试？"]), context);
    expect(plan.missing).toEqual(["哪场面试？"]);
    expect(hashPlan(plan)).not.toBe(hashPlan({ ...plan, missing: [] }));
  });
  it("JSONB重排对象键不改变草稿哈希", () => {
    const plan = compilePlan(
      parse([
        {
          key: "a",
          action: "application.save",
          values: { company: "A", role: "产品" },
          reason: "x",
        },
      ]),
      context,
    );
    const reverse = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reverse)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reverse(x)]),
            )
          : v;
    expect(hashPlan(plan)).toBe(hashPlan(reverse(plan) as typeof plan));
  });
  it("日历指纹与顺序无关，随版本和新增占用变化", () => {
    const list = [
      { id: "a", version: 1, status: "待完成" },
      { id: "b", version: 1, status: "待完成" },
    ];
    expect(calendarFingerprint(list)).toBe(
      calendarFingerprint([...list].reverse()),
    );
    expect(calendarFingerprint(list)).not.toBe(
      calendarFingerprint([...list, { id: "c", version: 1, status: "待完成" }]),
    );
  });
});
