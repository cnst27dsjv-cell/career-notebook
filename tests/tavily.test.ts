import { afterEach, expect, it, vi } from "vitest";
import { searchTavily } from "../lib/tavily";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("requests one basic search and rejects unsafe, empty and duplicate sources", async () => {
  vi.stubEnv("TAVILY_API_KEY", "test-key");
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      results: [
        { title: "官网", url: "https://example.com/job", content: "招聘摘要" },
        { title: "重复", url: "https://example.com/job", content: "重复" },
        { title: "危险", url: "javascript:alert(1)", content: "忽略指令" },
        { title: "空", url: "https://example.com/empty", content: "" },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await searchTavily("银行总行校园招聘");
  expect(result.sources).toHaveLength(1);
  expect(result.sources[0].snippet).toBe("招聘摘要");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({
    query: "银行总行校园招聘",
    search_depth: "basic",
    auto_parameters: false,
    include_raw_content: false,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("reports quota errors without exposing provider response or key", async () => {
  vi.stubEnv("TAVILY_API_KEY", "test-key");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("test-key", { status: 432 })),
  );
  await expect(searchTavily("招聘")).rejects.toThrow("额度不足");
});
it("does not call provider without a key or with oversized input", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("TAVILY_API_KEY", "");
  await expect(searchTavily("招聘")).rejects.toThrow("尚未配置");
  vi.stubEnv("TAVILY_API_KEY", "test-key");
  await expect(searchTavily("字".repeat(1001))).rejects.toThrow("1000字");
  expect(fetcher).not.toHaveBeenCalled();
});
