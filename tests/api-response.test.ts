import { afterEach, expect, it, vi } from "vitest";
import { api } from "../components/context";

afterEach(() => vi.unstubAllGlobals());

it.each([200, 502, 504])("reports an HTML save response (%i) without resubmitting the write", async (status) => {
  const fetch = vi.fn(async () => new Response("<!DOCTYPE html><title>Error</title>", {
    status,
    headers: { "Content-Type": "text/html" },
  }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("/api/data", { action: "application.save" })).rejects.toThrow(/无法确认.*是否保存.*核对/);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("reports expired authentication even when the response is HTML", async () => {
  vi.stubGlobal("fetch", async () => new Response("<!DOCTYPE html>", { status: 401 }));
  await expect(api("/api/data", {})).rejects.toThrow(/登录/);
});

it("preserves the schedule conflict message and allows a subsequent valid save", async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ error: "时间与已有日程冲突" }, { status: 400 }))
    .mockResolvedValueOnce(Response.json({ id: "application-1", version: 2 }));
  vi.stubGlobal("fetch", fetch);
  await expect(api("/api/data", {})).rejects.toThrow("时间与已有日程冲突");
  await expect(api("/api/data", {})).resolves.toEqual({ id: "application-1", version: 2 });
});
