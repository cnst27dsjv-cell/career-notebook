import { expect, it } from "vitest";
import { readRecognitionResponse } from "../lib/recognition-response";

it.each([200, 502, 503, 504])(
  "explains an HTML recognition response (%i)",
  async (status) => {
    await expect(
      readRecognitionResponse(
        new Response("<!DOCTYPE html><title>Error</title>", {
          status,
          headers: { "Content-Type": "text/html" },
        }),
      ),
    ).rejects.toThrow(/识别服务.*异常.*图片.*保留/);
  },
);

it("explains expired login even if the server returns HTML", async () => {
  await expect(
    readRecognitionResponse(new Response("<!DOCTYPE html>", { status: 401 })),
  ).rejects.toThrow("登录状态已失效");
});

it("preserves specific recognition errors", async () => {
  await expect(
    readRecognitionResponse(
      Response.json({ error: "模型额度不足" }, { status: 400 }),
    ),
  ).rejects.toThrow("模型额度不足");
});

it("returns recognized fields unchanged", async () => {
  const result = { fields: { company: "测试公司", jd: "岗位正文" }, notes: [] };
  await expect(readRecognitionResponse(Response.json(result))).resolves.toEqual(
    result,
  );
});
