import { describe, expect, it } from "vitest";
import { parseWebSearchResponse } from "../lib/model";

describe("Grok 联网搜索结果", () => {
  it("提取回答和去重后的真实来源", () => {
    const result = parseWebSearchResponse({
      citations: ["https://example.com/a"],
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "公开资料摘要",
              annotations: [
                {
                  type: "url_citation",
                  url: "https://example.com/a",
                  title: "示例来源",
                },
                {
                  type: "url_citation",
                  url: "https://example.com/b",
                  title: "第二来源",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(result.text).toBe("公开资料摘要");
    expect(result.sources).toEqual([
      { url: "https://example.com/a", title: "示例来源" },
      { url: "https://example.com/b", title: "第二来源" },
    ]);
  });

  it("没有来源时拒绝伪装成联网结果", () => {
    expect(() =>
      parseWebSearchResponse({
        output: [
          { content: [{ type: "output_text", text: "没有可核对来源" }] },
        ],
      }),
    ).toThrow("没有返回可核对的来源");
  });
});
