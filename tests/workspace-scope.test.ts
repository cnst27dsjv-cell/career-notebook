import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => {
  const tables = [
    "application",
    "event",
    "resume",
    "preparation",
    "material",
    "materialRole",
    "interview",
    "fileAsset",
    "settings",
    "notificationJob",
    "heartbeat",
  ];
  return {
    db: Object.fromEntries(
      tables.map((name) => [
        name,
        {
          findMany: vi.fn(async () => []),
          findUnique: vi.fn(async () => null),
        },
      ]),
    ),
  };
});
vi.mock("@/lib/db", () => ({ db: f.db }));
vi.mock("@/lib/http", () => ({
  userFor: async () => ({
    id: "test-user",
    name: "Test",
    email: "test@example.invalid",
  }),
  failure: (e: Error) => Response.json({ error: e.message }, { status: 400 }),
}));
import { GET } from "../app/api/data/route";
afterEach(() => vi.clearAllMocks());
it.each([
  ["core", 4],
  ["applications", 6],
  ["full", 11],
])("loads only required tables for %s", async (scope, count) => {
  const response = await GET(
    new Request(`https://example.invalid/api/data?scope=${scope}`),
  );
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.scope).toBe(scope);
  let calls = 0;
  for (const [table, methods] of Object.entries(f.db)) {
    calls +=
      methods.findMany.mock.calls.length + methods.findUnique.mock.calls.length;
    for (const args of [
      ...methods.findMany.mock.calls,
      ...methods.findUnique.mock.calls,
    ] as unknown as { where: Record<string, unknown> }[][]) {
      if (table !== "heartbeat")
        expect(args[0].where).toMatchObject({ userId: "test-user" });
    }
  }
  expect(calls).toBe(count);
  if (scope !== "full") expect(f.db.interview.findMany).not.toHaveBeenCalled();
});
