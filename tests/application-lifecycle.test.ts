import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { executeBusinessAction } from "../lib/business";

const createId = "32011001-1111-4111-8111-111111111111";
const values = { company: "复星创富", role: "投资实习生", stage: "待投递" };

it("retries a creation after a lost response without creating a second application", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  const create = vi.fn(async ({ data }) => {
    const row = {
      ...data,
      id: data.id || `generated-${rows.size}`,
      version: 1,
    };
    rows.set(row.id, row);
    return row;
  });
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findUnique: vi.fn(async ({ where }) => rows.get(where.id) || null),
      create,
    },
  } as unknown as Prisma.TransactionClient;
  const request = { action: "application.save", createId, values };
  const first = await (
    await executeBusinessAction(db, "user-1", request)
  ).json();
  const retry = await (
    await executeBusinessAction(db, "user-1", {
      ...request,
      values: { ...values, role: "重试时新填写的岗位" },
    })
  ).json();
  expect(first.application).toMatchObject({ id: first.id, company: "复星创富", role: "投资实习生", version: 1 });
  expect(retry.application).toBeUndefined();
  expect(retry).toMatchObject({ id: first.id, version: 1, replayed: true });
  expect(rows.size).toBe(1);
  expect([...rows.values()][0].role).toBe("投资实习生");
  expect(create).toHaveBeenCalledOnce();
});

it("does not expose another user's application through a creation token", async () => {
  const create = vi.fn();
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findUnique: vi.fn(async () => ({
        id: createId,
        userId: "other-user",
        version: 1,
      })),
      create,
    },
  } as unknown as Prisma.TransactionClient;
  await expect(
    executeBusinessAction(db, "user-1", {
      action: "application.save",
      createId,
      values,
    }),
  ).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});

it("deletes only the chosen application and preserves linked schedules, files and preparation", async () => {
  const unlinkEvents = vi.fn();
  const unlinkFiles = vi.fn();
  const unlinkPreparations = vi.fn();
  const remove = vi.fn();
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findFirst: vi.fn(async () => ({ id: "app-1", version: 3 })),
      delete: remove,
    },
    event: { updateMany: unlinkEvents },
    fileAsset: { updateMany: unlinkFiles },
    preparation: { updateMany: unlinkPreparations },
  } as unknown as Prisma.TransactionClient;
  const response = await executeBusinessAction(db, "user-1", {
    action: "application.delete",
    id: "app-1",
    version: 3,
  });
  expect(await response.json()).toMatchObject({
    deletedApplicationId: "app-1",
  });
  for (const unlink of [unlinkEvents, unlinkFiles, unlinkPreparations]) {
    expect(unlink).toHaveBeenCalledWith({
      where: { applicationId: "app-1", userId: "user-1" },
      data: { applicationId: null },
    });
  }
  expect(remove).toHaveBeenCalledWith({ where: { id: "app-1" } });
});

it("does not delete a record changed since the detail was opened", async () => {
  const remove = vi.fn();
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: {
      findFirst: vi.fn(async () => ({ id: "app-1", version: 4 })),
      delete: remove,
    },
  } as unknown as Prisma.TransactionClient;
  await expect(
    executeBusinessAction(db, "user-1", {
      action: "application.delete",
      id: "app-1",
      version: 3,
    }),
  ).rejects.toThrow(/已更新/);
  expect(remove).not.toHaveBeenCalled();
});

it("a repeated deletion or another user's ID cannot mutate linked data", async () => {
  const findFirst = vi.fn(async () => null);
  const db = {
    $queryRaw: vi.fn(async () => []),
    application: { findFirst },
  } as unknown as Prisma.TransactionClient;
  const response = await executeBusinessAction(db, "user-1", {
    action: "application.delete",
    id: "not-owned",
    version: 1,
  });
  expect(response.ok).toBe(true);
  expect(findFirst).toHaveBeenCalledWith({
    where: { id: "not-owned", userId: "user-1" },
    select: { version: true },
  });
});
