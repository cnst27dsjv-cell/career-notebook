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
  it("新建投递时可以在没有日程的情况下直接完成测评", async () => {
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
      values: applicationValues,
    });

    expect(await response.json()).toMatchObject({
      ok: true,
      id: "application-1",
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stage: "测评",
        stageStatus: "等待结果",
      }),
    });
  });

  it("手动完成阶段时同步完成待办日程并取消提醒", async () => {
    const oldApplication = {
      id: "application-1",
      userId: "user-1",
      version: 3,
      stage: "测评",
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
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...oldApplication,
          ...data,
          version: 4,
        })),
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
      values: applicationValues,
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
  });
});
