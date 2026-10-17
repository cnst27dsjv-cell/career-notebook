import { expect, it } from "vitest";
import {
  publicInterviewQuery,
  mapResearchSources,
  replaceAnswer,
  validateQuestions,
  interviewMarkdown,
} from "../lib/interview-practice";
it("search query uses public role context but never private JD/material text", () => {
  expect(
    publicInterviewQuery({
      company: "测试银行",
      role: "基金运营",
      round: "二面",
      jd: "私人经历",
    }),
  ).toBe("测试银行 基金运营 二面 招聘 面试 岗位要求");
});
it("research cards retain real snippets and dates without claiming full text", () => {
  expect(
    mapResearchSources({
      searchedAt: "2026-10-12",
      sources: [
        {
          id: "web-1",
          label: "招聘",
          url: "https://example.com",
          snippet: "运营要求",
        },
      ],
    }),
  ).toEqual([
    {
      id: "web-1",
      title: "招聘",
      url: "https://example.com",
      description: "运营要求",
      published: "未知",
      retrievedAt: "2026-10-12",
      kind: "搜索摘要，未核实全文",
    },
  ]);
});
it("re-answering keeps reviewed attempt and material link without stale confirmation", () => {
  const old = {
    answer: "原回答",
    feedback: "缺乏证据",
    suggestion: "建议",
    confirmed: true,
    materialId: "m1",
  };
  const next = replaceAnswer(old, "新回答", "2026-10-12");
  expect(next.answer).toBe("新回答");
  expect(next.confirmed).toBeUndefined();
  expect(next.materialId).toBe("m1");
  expect(next.history).toEqual([{ ...old, at: "2026-10-12" }]);
  expect(replaceAnswer(next, "新回答", "later")).toEqual(next);
});
it("rejects fabricated source IDs and empty question lists", () => {
  expect(() =>
    validateQuestions(
      [{ question: "介绍", basis: "来源", sourceIds: ["invented"] }],
      [],
    ),
  ).toThrow("来源");
  expect(() => validateQuestions([], [])).toThrow();
});
it("Markdown export keeps original answers, feedback, history and whole-session review", () => {
  const md = interviewMarkdown({
    id: "i1",
    preparationId: "p1",
    version: 1,
    sources: [],
    questions: [{ question: "你的职责？", basis: "推测", sourceIds: [] }],
    turns: [
      {
        answer: "现在",
        history: [{ answer: "过去", at: "2026-10-11" }],
        feedback: "明确边界",
      },
    ],
    state: { review: "下次补证据", completedAt: "2026-10-12" },
  });
  expect(md).toContain("现在");
  expect(md).toContain("过去");
  expect(md).toContain("明确边界");
  expect(md).toContain("下次补证据");
});
