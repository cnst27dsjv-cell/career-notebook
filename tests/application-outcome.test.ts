import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { executeBusinessAction } from "../lib/business";

it("reopening an application does not reactivate cancelled schedules", async () => {
  const update = vi.fn(async () => ({ id: "app-1", version: 4 }));
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findFirst: vi.fn(async () => ({
        id: "app-1",
        version: 3,
        stage: "面试",
        stageStatus: "待完成",
        outcome: "未通过",
        history: [],
      })),
      update,
    },
    event: { findMany: vi.fn(async () => []) },
  } as unknown as Prisma.TransactionClient;
  await executeBusinessAction(db, "user-1", {
    action: "application.save",
    id: "app-1",
    version: 3,
    values: {
      company: "甲公司",
      role: "分析师",
      stage: "面试",
      outcome: "",
      appliedAt: "2026-10-01T00:00:00Z",
    },
  });
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ outcome: "", stageStatus: "待安排" }),
    }),
  );
});

it("a stale calendar cannot reactivate reminders for an ended application", async () => {
  const update = vi.fn();
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: { findFirst: vi.fn(async () => ({ outcome: "未通过" })) },
    event: {
      findFirst: vi.fn(async () => ({ id: "event-1" })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "event-1",
        version: 2,
        applicationId: "app-1",
      })),
      update,
    },
  } as unknown as Prisma.TransactionClient;
  await expect(
    executeBusinessAction(db, "user-1", {
      action: "event.status",
      id: "event-1",
      version: 2,
      status: "待完成",
    }),
  ).rejects.toThrow(/流程已结束/);
  expect(update).not.toHaveBeenCalled();
});

it("ending an application cancels pending schedules and reminders without creating a conflicting schedule", async () => {
  const update = vi.fn(async () => ({ id: "app-1", version: 3 }));
  const cancelEvents = vi.fn();
  const cancelJobs = vi.fn();
  const findEvents = vi.fn(async () => [{ id: "event-1" }, { id: "event-2" }]);
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findFirst: vi.fn(async () => ({
        id: "app-1",
        version: 2,
        stage: "AI面",
        stageStatus: "等待结果",
        outcome: "",
        history: [],
      })),
      update,
    },
    event: { findMany: findEvents, updateMany: cancelEvents },
    notificationJob: { updateMany: cancelJobs },
  } as unknown as Prisma.TransactionClient;
  const response = await executeBusinessAction(db, "user-1", {
    action: "application.save",
    id: "app-1",
    version: 2,
    stageCompleted: true,
    values: {
      company: "甲公司",
      role: "分析师",
      stage: "AI面",
      outcome: "未通过",
      appliedAt: "2026-10-01T00:00:00Z",
    },
    schedule: {
      mode: "upsert",
      start: "2026-10-01T10:00:00Z",
      end: "2026-10-01T09:00:00Z",
      absoluteReminders: ["2026-10-01T00:00:00Z"],
    },
  });
  expect(response.ok).toBe(true);
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        outcome: "未通过",
        stage: "AI面",
        stageStatus: "等待结果",
        history: expect.arrayContaining([
          expect.objectContaining({ to: "AI面 · 未通过" }),
        ]),
      }),
    }),
  );
  expect(cancelEvents).toHaveBeenCalledWith({
    where: { userId: "user-1", applicationId: "app-1", status: "待完成" },
    data: { status: "已取消", version: { increment: 1 } },
  });
  expect(cancelJobs).toHaveBeenCalledWith({
    where: {
      userId: "user-1",
      eventId: { in: ["event-1", "event-2"] },
      state: { in: ["pending", "sending"] },
    },
    data: { state: "cancelled" },
  });
});

it("old calendar actions cannot move an ended application's stage", async () => {
  const updateApplication = vi.fn();
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findFirst: vi.fn(async () => ({
        id: "app-1",
        stage: "AI面",
        stageStatus: "待安排",
        outcome: "未通过",
        history: [],
        version: 2,
      })),
      update: updateApplication,
    },
    event: {
      findFirst: vi.fn(async () => ({ id: "event-1" })),
      findUniqueOrThrow: vi.fn(async () => ({ id: "event-1", version: 1 })),
      update: vi.fn(async () => ({
        id: "event-1",
        applicationId: "app-1",
        kind: "AI面",
        status: "已完成",
      })),
    },
    notificationJob: { updateMany: vi.fn() },
  } as unknown as Prisma.TransactionClient;
  await executeBusinessAction(db, "user-1", {
    action: "event.status",
    id: "event-1",
    version: 1,
    status: "已完成",
  });
  expect(updateApplication).not.toHaveBeenCalled();
});
