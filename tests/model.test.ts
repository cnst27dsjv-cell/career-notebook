import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getTextModelConfig,
  getVisionModelConfig,
  parseWebSearchResponse,
} from "../lib/model";

afterEach(() => vi.unstubAllEnvs());

describe("文本与图片模型配置", () => {
  it("为 DeepSeek 文本和 Tokendance 图片使用独立密钥", () => {
    vi.stubEnv("TEXT_MODEL_BASE_URL", "https://api.deepseek.com/");
    vi.stubEnv("TEXT_MODEL_API_KEY", "deepseek-secret");
    vi.stubEnv("TEXT_MODEL_NAME", "deepseek-flash");
    vi.stubEnv("TEXT_MODEL_POLISH_NAME", "deepseek-v4-pro");
    vi.stubEnv("VISION_MODEL_BASE_URL", "https://tokendance.space/gateway/v1/");
    vi.stubEnv("VISION_MODEL_API_KEY", "tokendance-secret");
    vi.stubEnv("VISION_MODEL_NAME", "qwen3.5-flash");

    expect(getTextModelConfig()).toEqual({
      baseUrl: "https://api.deepseek.com",
      apiKey: "deepseek-secret",
      model: "deepseek-flash",
    });
    expect(getTextModelConfig("polish").model).toBe("deepseek-v4-pro");
    expect(getVisionModelConfig()).toEqual({
      baseUrl: "https://tokendance.space/gateway/v1",
      apiKey: "tokendance-secret",
      model: "qwen3.5-flash",
    });
  });

  it("不会回退使用旧的统一模型密钥", () => {
    vi.stubEnv("MODEL_BASE_URL", "https://legacy.example/v1");
    vi.stubEnv("MODEL_API_KEY", "legacy-secret");
    vi.stubEnv("MODEL_NAME", "legacy-model");
    vi.stubEnv("TEXT_MODEL_BASE_URL", "");
    vi.stubEnv("TEXT_MODEL_API_KEY", "");
    vi.stubEnv("TEXT_MODEL_NAME", "");
    vi.stubEnv("VISION_MODEL_BASE_URL", "");
    vi.stubEnv("VISION_MODEL_API_KEY", "");
    vi.stubEnv("VISION_MODEL_NAME", "");

    expect(() => getTextModelConfig()).toThrow("DeepSeek 文本服务");
    expect(() => getVisionModelConfig()).toThrow("Tokendance 图片识别服务");
  });
});

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
