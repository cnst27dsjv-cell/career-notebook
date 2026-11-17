import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateWithImages } from "../lib/model";

const images = [{ mime: "image/png", data: Buffer.from("test-image") }];
const completion = {
  choices: [
    { finish_reason: "stop", message: { content: '{"text":"岗位正文"}' } },
  ],
};

beforeEach(() => {
  vi.stubEnv("VISION_MODEL_BASE_URL", "https://vision.example/v1");
  vi.stubEnv("VISION_MODEL_API_KEY", "test-key");
  vi.stubEnv("VISION_MODEL_NAME", "qwen3.5-flash");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(["qwen3.5-flash", "qwen3.5-flash-2026-02-23"])(
  "disables unnecessary reasoning for OCR with %s while retaining the images",
  async (model) => {
    vi.stubEnv("VISION_MODEL_NAME", model);
    let request: any;
    vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
      request = JSON.parse(String(init.body));
      return Response.json(completion);
    });
    await expect(generateWithImages("识别文字", {}, images)).resolves.toEqual({
      text: "岗位正文",
    });
    expect(request.enable_thinking).toBe(false);
    expect(request.messages[1].content[1].image_url.url).toBe(
      "data:image/png;base64,dGVzdC1pbWFnZQ==",
    );
  },
);

it("does not send Qwen-specific options to a different vision model", async () => {
  vi.stubEnv("VISION_MODEL_NAME", "other-vision");
  let request: any;
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(String(init.body));
    return Response.json(completion);
  });
  await generateWithImages("识别文字", {}, images);
  expect(request.enable_thinking).toBeUndefined();
});

it.each(["headers", "body"])(
  "explains a timeout while reading response %s",
  async (phase) => {
    vi.stubGlobal("fetch", async () => {
      if (phase === "headers")
        throw new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        );
      const response = Response.json(completion);
      response.json = async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      };
      return response;
    });
    await expect(generateWithImages("识别文字", {}, images)).rejects.toThrow(
      /超时.*重试/,
    );
  },
);

it("retains an upstream service error instead of reporting it as a timeout", async () => {
  vi.stubGlobal(
    "fetch",
    async () => new Response("unavailable", { status: 520 }),
  );
  await expect(generateWithImages("识别文字", {}, images)).rejects.toThrow(
    "（520）",
  );
});

it("rejects truncated OCR rather than returning incomplete job requirements", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      choices: [
        {
          finish_reason: "length",
          message: { content: '{"text":"部分正文"}' },
        },
      ],
    }),
  );
  await expect(generateWithImages("识别文字", {}, images)).rejects.toThrow(
    "识别结果过长",
  );
});
