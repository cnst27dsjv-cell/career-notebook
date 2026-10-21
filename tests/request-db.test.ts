import { beforeEach, expect, it, vi } from "vitest";
const created = vi.hoisted(
  () => [] as { $disconnect: ReturnType<typeof vi.fn> }[],
);
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $disconnect = vi.fn(async () => {});
    constructor() {
      created.push(this);
    }
  },
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
beforeEach(() => {
  vi.resetModules();
  created.length = 0;
});
it("reuses a disconnected client's compiler but disconnects after every request", async () => {
  const { withRequestDatabase } = await import("../cloudflare/request-db");
  const a = await withRequestDatabase("postgresql://a", async (db) => db);
  expect(a.$disconnect).toHaveBeenCalledOnce();
  const b = await withRequestDatabase("postgresql://a", async (db) => db);
  expect(a).toBe(b);
  expect(a.$disconnect).toHaveBeenCalledTimes(2);
});
it("never hands an in-use client to a concurrent request", async () => {
  const { withRequestDatabase } = await import("../cloudflare/request-db");
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const first = withRequestDatabase("postgresql://a", async (db) => {
    await gate;
    return db;
  });
  const second = await withRequestDatabase("postgresql://a", async (db) => db);
  expect(created).toHaveLength(2);
  unblock();
  expect(await first).not.toBe(second);
  for (const client of created)
    expect(client.$disconnect).toHaveBeenCalledOnce();
});
it("does not reuse a client until disconnect finishes", async () => {
  const { withRequestDatabase } = await import("../cloudflare/request-db");
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = withRequestDatabase("postgresql://a", async (db) => {
    vi.mocked(db.$disconnect).mockImplementationOnce(() => gate);
    return db;
  });
  await Promise.resolve();
  const second = await withRequestDatabase("postgresql://a", async (db) => db);
  finish();
  expect(await first).not.toBe(second);
});
it("discards failed requests and failed disconnects", async () => {
  const { withRequestDatabase } = await import("../cloudflare/request-db");
  await expect(
    withRequestDatabase("postgresql://a", async () => {
      throw Error("query failed");
    }),
  ).rejects.toThrow("query failed");
  await expect(
    withRequestDatabase("postgresql://a", async (db) => {
      vi.mocked(db.$disconnect).mockRejectedValueOnce(
        Error("disconnect failed"),
      );
    }),
  ).rejects.toThrow("disconnect failed");
  await withRequestDatabase("postgresql://a", async () => {});
  expect(created).toHaveLength(3);
});
it("does not reuse clients for a different database", async () => {
  const { withRequestDatabase } = await import("../cloudflare/request-db");
  const a = await withRequestDatabase("postgresql://a", async (db) => db);
  const b = await withRequestDatabase("postgresql://b", async (db) => db);
  expect(a).not.toBe(b);
});
