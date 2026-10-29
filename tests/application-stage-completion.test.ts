import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { executeBusinessAction } from "../lib/business";

const applicationValues = {
  company: "甲公司",
  role: "产品经理",
  city: "上海",
  batch: "2027 届秋招",
  stage: "测评",
  outcome: "",
  appliedAt: "2026-10-03T08:00:00+08:00",
  url: "",
  jd: "",
  notes: "",
  resumeId: null,
};

describe("投递阶段手动完成", () => {
  it("rejects a stale form without claiming another device changed it or overwriting progress", async () => {
    const update = vi.fn();
    const findEvents = vi.fn();
    const db = {
      $queryRaw: vi.fn(async () => []),
      application: {
        findFirst: vi.fn(async () => ({
          id: "application-1",
          version: 2,
          stage: "AI面",
          stageStatus: "待完成",
          history: [],
        })),
        update,
      },
      event: { findMany: findEvents },
    } as unknown as Prisma.TransactionClient;
    await expect(
      executeBusinessAction(db, "user-1", {
        action: "application.save",
        id: "application-1",
        version: 1,
        values: { ...applicationValues, stage: "AI面" },
      }),
    ).rejects.toThrow(
      "投递记录已更新，可能是上次保存已成功或关联日程发生了变化",
    );
    expect(update).not.toHaveBeenCalled();
    expect(findEvents).not.toHaveBeenCalled();
  });

  it.each(["测评", "AI面"])("新建投递时可以直接完成%s", async (stage) => {
    const create = vi.fn(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...data,
        id: "application-1",
        version: 1,
      }),
    );
    const db = {
      $queryRaw: vi.fn(async () => []),
      application: {
        findFirst: vi.fn(async () => null),
        create,
      },
      event: {
        findMany: vi.fn(async () => []),
      },
    } as unknown as Prisma.TransactionClient;

    const response = await executeBusinessAction(db, "user-1", {
      action: "application.save",
      stageCompleted: true,
      values: { ...applicationValues, stage },
    });

    expect(await response.json()).toMatchObject({
      ok: true,
      id: "application-1",
    });
    expect(create).toHaveBeenCalledWith({
      select: { id: true, version: true },
      data: expect.objectContaining({
        stage,
        stageStatus: "等待结果",
      }),
    });
  });

  it.each(["测评", "AI面"])(
    "手动完成%s同步完成日程并取消提醒",
    async (stage) => {
      const oldApplication = {
        id: "application-1",
        userId: "user-1",
        version: 3,
        stage,
        stageStatus: "待完成",
        appliedAt: new Date("2026-10-03T00:00:00Z"),
        history: [],
      };
      const updateMany = vi.fn(async () => ({ count: 2 }));
      const cancelNotifications = vi.fn(async () => ({ count: 2 }));
      const db = {
        $queryRaw: vi.fn(async () => []),
        application: {
          findFirst: vi.fn(async () => oldApplication),
          update: vi.fn(
            async ({ data }: { data: Record<string, unknown> }) => ({
              ...oldApplication,
              ...data,
              version: 4,
            }),
          ),
        },
        event: {
          findMany: vi.fn(async () => [
            { id: "event-1", updatedAt: new Date() },
            { id: "event-2", updatedAt: new Date() },
          ]),
          updateMany,
        },
        notificationJob: {
          updateMany: cancelNotifications,
        },
      } as unknown as Prisma.TransactionClient;

      await executeBusinessAction(db, "user-1", {
        action: "application.save",
        id: "application-1",
        version: 3,
        stageCompleted: true,
        values: { ...applicationValues, stage },
      });

      expect(cancelNotifications).toHaveBeenCalledWith({
        where: {
          eventId: { in: ["event-1", "event-2"] },
          state: { in: ["pending", "sending"] },
        },
        data: { state: "cancelled" },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ["event-1", "event-2"] },
          userId: "user-1",
        },
        data: { status: "已完成", version: { increment: 1 } },
      });
    },
  );
});

describe("投递保存查询成本", () => {
  it.each(["测评", "AI面"])(
    "保存%s安排时间并在允许冲突时不扫描其他日程",
    async (stage) => {
      const findMany = vi.fn(async () => {
        throw Error("不应读取全部日程");
      });
      const db = {
        $queryRaw: vi.fn(async () => []),
        application: {
          create: vi.fn(async ({ data }) => ({
            ...data,
            id: "new",
            version: 1,
          })),
        },
        event: {
          findMany,
          create: vi.fn(async ({ data }) => ({
            ...data,
            id: "event",
            version: 1,
          })),
        },
        notificationJob: { createMany: vi.fn(async () => ({ count: 1 })) },
      } as unknown as Prisma.TransactionClient;
      const response = await executeBusinessAction(db, "user-1", {
        action: "application.save",
        values: { ...applicationValues, stage },
        schedule: {
          mode: "upsert",
          start: "2035-10-23T10:00:00Z",
          allowConflict: true,
        },
      });
      expect(await response.json()).toMatchObject({ ok: true, id: "new" });
      expect(findMany).not.toHaveBeenCalled();
      expect(db.event.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: stage,
            start: new Date("2035-10-23T10:00:00Z"),
            applicationId: "new",
          }),
        }),
      );
    },
  );
});
