import { afterEach, expect, it, vi } from "vitest";
import { withRequestTimeout } from "../lib/request-timeout";
afterEach(() => vi.useRealTimers());
it("bounds a stalled mutation without retrying it", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const pending = withRequestTimeout(
    async (signal) => {
      calls++;
      await new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason)),
      );
    },
    30000,
    "保存响应超时，无法确认是否已保存",
  );
  const check = expect(pending).rejects.toThrow("无法确认是否已保存");
  await vi.advanceTimersByTimeAsync(30000);
  await check;
  expect(calls).toBe(1);
  expect(vi.getTimerCount()).toBe(0);
});
it("clears the deadline after success and preserves validation errors", async () => {
  vi.useFakeTimers();
  expect(
    await withRequestTimeout(async () => ({ id: "saved" }), 30000, "超时"),
  ).toEqual({ id: "saved" });
  await expect(
    withRequestTimeout(
      async () => {
        throw Error("时间冲突");
      },
      30000,
      "超时",
    ),
  ).rejects.toThrow("时间冲突");
  expect(vi.getTimerCount()).toBe(0);
});
