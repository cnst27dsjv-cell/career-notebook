import { describe, it, expect } from "vitest";
import {
  materialFormat,
  organizationItemSchema,
  renderOrganizedContent,
  validateSourceQuotes,
  splitSourceSegments,
} from "../lib/library-organization";
const item = {
  key: "one",
  type: "question",
  title: "如何处理分歧？",
  answer: "我组织了一次讨论。",
  context: "项目背景",
  feedback: "建议补充结果",
  quote: "我组织了一次讨论。",
  selected: true,
  category: "通用问题",
  roleScope: "",
  targetId: "",
};
describe("library organization", () => {
  it("splits long originals into complete continuous excerpts within the model limit", () => {
    const text =
      "第一段\n" + "甲".repeat(15000) + "\n\n" + "乙".repeat(27000) + "末尾";
    const segments = splitSourceSegments(text);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.join("")).toBe(text);
    expect(segments[0]).toBe("第一段\n" + "甲".repeat(15000) + "\n\n");
    expect(
      segments.every(
        (s) => s.length > 0 && s.length <= 24000 && text.includes(s),
      ),
    ).toBe(true);
  });
  it("keeps short originals whole and does not split an emoji at the size boundary", () => {
    expect(splitSourceSegments("完整短文\n")).toEqual(["完整短文\n"]);
    expect(splitSourceSegments("甲".repeat(24000))).toHaveLength(1);
    const text = "甲".repeat(23999) + "😀结束";
    const segments = splitSourceSegments(text);
    expect(segments.join("")).toBe(text);
    expect(segments[1]).toBe("😀结束");
    expect(splitSourceSegments("")).toEqual([""]);
  });
  it("keeps answers and suggestions distinct and does not invent absent answers", () => {
    const parsed = organizationItemSchema.parse({ ...item, answer: "" });
    const text = renderOrganizedContent(parsed, []);
    expect(text).toContain("回答：尚未填写");
    expect(text).toContain("建议 / 点评（非经历事实）");
    expect(text).not.toContain("回答：建议补充结果");
  });
  it("retains every answer version with source and feedback", () => {
    const text = renderOrganizedContent(organizationItemSchema.parse(item), [
      {
        answer: "第一次讨论",
        feedback: "补充结果",
        context: "背景一",
        at: "2026-10-16",
        source: "笔记一",
      },
      {
        answer: "第二次练习",
        feedback: "",
        context: "",
        at: "2026-10-17",
        source: "模拟面试",
      },
    ]);
    expect(text).toContain("第一次讨论");
    expect(text).toContain("第二次练习");
    expect(text).toContain("模拟面试");
  });
  it("recognizes imported documents without reclassifying old questions", () => {
    expect(materialFormat({ source: "Obsidian:库/a.md" })).toBe("document");
    expect(materialFormat({ source: "手动整理" })).toBe("legacy");
    expect(
      materialFormat({ format: "question", source: "Obsidian:库/a.md" }),
    ).toBe("question");
  });
  it("rejects invented excerpts and accepts a quote from a source", () => {
    expect(() =>
      validateSourceQuotes(
        [organizationItemSchema.parse(item)],
        "原文：我组织了一次讨论。",
      ),
    ).not.toThrow();
    expect(() =>
      validateSourceQuotes([organizationItemSchema.parse(item)], "另一篇文档"),
    ).toThrow(/原文/);
  });
});
