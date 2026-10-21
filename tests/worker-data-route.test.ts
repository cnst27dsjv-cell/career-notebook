import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(async () => new Response("framework")),
  get: vi.fn(async (_request: Request) => Response.json({ applications: [] })),
  post: vi.fn(async (_request: Request) => Response.json({ ok: true })),
  disconnect: vi.fn(async () => {}),
}));
vi.mock("vinext/server/fetch-handler", () => ({
  default: { fetch: mocks.fetch },
}));
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    $disconnect = mocks.disconnect;
  },
}));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.mock("../app/api/data/route", () => ({ GET: mocks.get, POST: mocks.post }));
vi.mock("../lib/reminders", () => ({ tick: vi.fn() }));
import worker from "../cloudflare/worker";
import { current } from "../cloudflare/context";
const env = { DATABASE_URL: "postgresql://local", FILES: {} } as Parameters<
  typeof worker.fetch
>[1];
afterEach(() => vi.clearAllMocks());
it.each(["GET", "POST"])(
  "%s data requests enter the existing authenticated handler within the DB context",
  async (method) => {
    const target = method === "GET" ? mocks.get : mocks.post;
    target.mockImplementationOnce(async () => {
      expect(current().db).toBeDefined();
      return Response.json({ ok: true });
    });
    const request = new Request(
      "https://career-notebook.cn/api/data?scope=core",
      { method },
    );
    const response = (await worker.fetch(request, env, {})) as Response;
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(target).toHaveBeenCalledWith(request);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
  },
);
it.each(["/", "/api/auth/get-session", "/api/data/other"])(
  "keeps %s on the framework router",
  async (path) => {
    const response = (await worker.fetch(
      new Request(`https://career-notebook.cn${path}`),
      env,
      {},
    )) as Response;
    expect(await response.text()).toBe("framework");
    expect(mocks.get).not.toHaveBeenCalled();
  },
);
it("keeps unsupported methods on the framework router", async () => {
  await worker.fetch(
    new Request("https://career-notebook.cn/api/data", { method: "DELETE" }),
    env,
    {},
  );
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.post).not.toHaveBeenCalled();
});
