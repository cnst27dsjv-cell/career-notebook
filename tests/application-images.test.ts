import { describe, expect, it } from "vitest";
import {
  applicationImageTextFallback,
  parseApplicationImageText,
  parseApplicationImageRecognition,
  readApplicationImage,
  validateApplicationImageBatch,
} from "../lib/application-images";

const png = (name = "jd.png") =>
  new File([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0])], name, {
    type: "image/png",
  });

describe("application image validation", () => {
  it("accepts an image whose extension, MIME type and signature agree", async () => {
    await expect(readApplicationImage(png())).resolves.toMatchObject({
      extension: ".png",
      mime: "image/png",
    });
  });

  it("rejects a renamed non-image", async () => {
    const fake = new File(["not an image"], "jd.png", { type: "image/png" });
    await expect(readApplicationImage(fake)).rejects.toThrow("不是有效的图片");
  });

  it("limits one import to six images", () => {
    expect(() =>
      validateApplicationImageBatch(Array.from({ length: 7 }, () => png())),
    ).toThrow("最多识别 6 张");
  });

  it("normalizes common model variations", () => {
    expect(
      parseApplicationImageRecognition({
        fields: {
          company: "测试科技",
          role: "产品经理",
          city: null,
          batch: "2027 届秋招",
          url: "",
          jd: "负责产品需求分析",
        },
        confidence: { company: "0.9", role: 0.8 },
        notes: "城市未在图片中出现",
      }),
    ).toMatchObject({
      fields: { city: "" },
      confidence: { company: 0.9, role: 0.8, city: 0 },
      notes: ["城市未在图片中出现"],
    });
  });

  it("accepts OCR text from common vision model response shapes", () => {
    expect(parseApplicationImageText({ text: "岗位职责\n负责需求分析" })).toBe(
      "岗位职责\n负责需求分析",
    );
    expect(
      parseApplicationImageText({
        pages: [{ text: "第 1 页" }, { content: "第 2 页" }],
      }),
    ).toBe("第 1 页\n\n第 2 页");
  });

  it("rejects empty OCR output", () => {
    expect(() => parseApplicationImageText({ text: "   " })).toThrow(
      "没有识别出可用文字",
    );
  });

  it("applies a scalar confidence score to every field", () => {
    expect(
      parseApplicationImageRecognition({
        fields: {
          company: "测试科技",
          role: "产品经理",
          jd: "负责产品需求分析",
        },
        confidence: 0.9,
        notes: [],
      }).confidence,
    ).toEqual({
      company: 0.9,
      role: 0.9,
      city: 0.9,
      batch: 0.9,
      url: 0.9,
      jd: 0.9,
    });
  });

  it("accepts wrapped fields, aliases and imperfect metadata", () => {
    expect(
      parseApplicationImageRecognition({
        result: {
          companyName: "测试科技",
          position: "产品经理",
          location: "上海",
          recruitmentBatch: "2027 届秋招",
          jobDescription: {
            responsibilities: ["负责需求分析", "推进产品上线"],
            requirements: ["逻辑清晰"],
          },
          confidence: "90%",
          notes: { warning: "未提供职位链接" },
        },
      }),
    ).toMatchObject({
      fields: {
        company: "测试科技",
        role: "产品经理",
        city: "上海",
        batch: "2027 届秋招",
        jd: "负责需求分析\n推进产品上线\n逻辑清晰",
      },
      confidence: { company: 0.9, jd: 0.9 },
      notes: ["未提供职位链接"],
    });
  });

  it("does not reject useful fields because optional metadata is malformed", () => {
    expect(
      parseApplicationImageRecognition({
        fields: { company: "测试科技", role: "产品经理" },
        confidence: { company: 95, role: "unknown" },
        notes: Array.from({ length: 20 }, (_, index) => ({ note: `提示 ${index}` })),
      }),
    ).toMatchObject({
      fields: { company: "测试科技", role: "产品经理" },
      confidence: { company: 0.95, role: 0 },
    });
  });

  it("keeps OCR text as JD when structured analysis is unusable", () => {
    expect(applicationImageTextFallback("岗位职责\n负责需求分析")).toMatchObject({
      fields: { jd: "岗位职责\n负责需求分析" },
      confidence: { jd: 0.5 },
      notes: ["已提取图片全文，但岗位字段需要人工确认"],
    });
  });

  it("returns a readable error for unusable model output", () => {
    expect(() => parseApplicationImageRecognition({ fields: {} })).toThrow(
      "AI 返回的字段不完整",
    );
  });
});
