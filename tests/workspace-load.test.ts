import { afterEach, describe, expect, it, vi } from "vitest";
import { loadWorkspaceData } from "../lib/workspace-load";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("workspace loading recovery", () => {
  it("retries a disconnected read and returns the recovered data", async () => {
    let attempts = 0;
    vi.stubGlobal("fetch", async () => {
      if (++attempts === 1) throw new TypeError("Failed to fetch");
      return Response.json({ applications: [{ id: "recovered" }] });
    });
    expect(await loadWorkspaceData(true)).toEqual({
      applications: [{ id: "recovered" }],
    });
    expect(attempts).toBe(2);
  });

  it("times out even when headers arrive but the response body stalls, then allows another load", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const signal = init.signal!;
      signals.push(signal);
      return new Response(
        new ReadableStream({
          start(controller) {
            signal.addEventListener("abort", () =>
              controller.error(signal.reason),
            );
          },
        }),
      );
    });
    const result = expect(loadWorkspaceData(true)).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(60000);
    await result;
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    vi.stubGlobal("fetch", async () => Response.json({ applications: [] }));
    expect(await loadWorkspaceData(true)).toEqual({ applications: [] });
  });

  it("returns a login signal without retrying unauthorized responses", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    expect(await loadWorkspaceData(true)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves server errors instead of hiding them as a network problem", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ error: "数据库暂时不可用" }, { status: 503 }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(loadWorkspaceData(false)).rejects.toThrow("数据库暂时不可用");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("stops after one retry on a disconnected network", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);
    await expect(loadWorkspaceData(false)).rejects.toThrow(/网络连接/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
