import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { syncGeneratedEventTitle } from "../lib/application-stage";
import { executeBusinessAction } from "../lib/business";

describe("日程类型与自动名称同步", () => {
  it("没有关联公司时保留名称，也不改写其他公司的名称", () => {
    expect(syncGeneratedEventTitle("中信证券 · 测评", "AI面")).toBe(
      "中信证券 · 测评",
    );
    expect(syncGeneratedEventTitle("其他公司 · 测评", "AI面", "中信证券")).toBe(
      "其他公司 · 测评",
    );
    expect(syncGeneratedEventTitle("中信证券 · AI面", "投递", "中信证券")).toBe(
      "中信证券 · 完成投递",
    );
  });
  it.each([
    { oldKind: "测评", title: "中信证券 · 测评", expected: "中信证券 · AI面" },
    { oldKind: "新建", title: "中信证券 · 测评", expected: "中信证券 · AI面" },
    { oldKind: "AI面", title: "中信证券 · 测评", expected: "中信证券 · AI面" },
    {
      oldKind: "测评",
      title: "中信证券 AI 视频面试，提前测试设备",
      expected: "中信证券 AI 视频面试，提前测试设备",
    },
  ])(
    "保存 $oldKind 日程保留正确名称：$expected",
    async ({ oldKind, title, expected }) => {
      const application = {
        id: "application-1",
        company: "中信证券",
        stage: "AI面",
        stageStatus: "待完成",
        appliedAt: new Date(),
        history: [],
      };
      const old = {
        id: "event-1",
        userId: "user-1",
        applicationId: application.id,
        title,
        kind: oldKind,
        status: "待完成",
        version: 1,
      };
      let persisted: Record<string, unknown> = old;
      const db = {
        $queryRaw: async () => [],
        application: { findFirst: async () => application },
        event: {
          findFirst: async ({ where }: { where: { id?: string } }) =>
            typeof where.id === "string" ? old : null,
          create: async ({ data }: { data: Record<string, unknown> }) =>
            (persisted = { ...old, ...data, version: 1 }),
          update: async ({ data }: { data: Record<string, unknown> }) =>
            (persisted = { ...old, ...data, version: 2 }),
        },
        notificationJob: { updateMany: async () => ({ count: 0 }) },
      } as unknown as Prisma.TransactionClient;
      const response = await executeBusinessAction(db, "user-1", {
        action: "event.save",
        id: oldKind === "新建" ? undefined : old.id,
        version: 1,
        values: {
          title,
          kind: "AI面",
          applicationId: application.id,
          start: "2026-10-27T09:00:00+08:00",
          reminderHours: [],
          absoluteReminders: [],
        },
      });
      expect(persisted.title).toBe(expected);
      expect(persisted.kind).toBe("AI面");
      expect(await response.json()).toMatchObject({
        ok: true,
        event: { title: expected, kind: "AI面" },
      });
    },
  );
});
