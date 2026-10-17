import { expect, it } from "vitest";
import { libraryTerms, rankLibrary } from "../lib/assistant-library";
const note = (id: string, title: string, content: string) => ({
  id,
  title,
  content,
  tags: "",
  roleScope: "",
  category: "待确认",
  version: 1,
  source: "Obsidian:面试库/经历.md",
});
it("retrieves a Chinese experience inside a natural sentence rather than requiring the whole sentence", () => {
  const notes = [
    note("a", "项目回顾", "华泰资管的ABS项目中，我核对台账和底层资产资料。"),
    note("b", "旅游", "去年去过杭州。"),
  ];
  expect(
    rankLibrary(notes, "帮我梳理华泰资管的ABS项目经历").map((n) => n.id),
  ).toEqual(["a"]);
  expect(libraryTerms("你好，谢谢")).toEqual([]);
});
it("reads matching content near the end of a long note", () => {
  const result = rankLibrary(
    [
      note(
        "a",
        "实习记录",
        "常规工作日志。".repeat(1800) +
          "我在ABS项目中逐项核验底层资产的权属关系，发现三项材料缺失。",
      ),
    ],
    "ABS项目如何核验底层资产",
  )[0];
  expect(result.content).toContain("发现三项材料缺失");
  expect(result.content.length).toBeLessThanOrEqual(3000);
  expect(result.truncated).toBe(true);
});
it("ranks current topic above previous conversation and caps results without recency bias", () => {
  const notes = Array.from({ length: 12 }, (_, i) =>
    note(String(i), "产品设计", "产品设计竞品分析"),
  );
  notes.push(note("old", "华泰资管", "ABS台账核验"));
  expect(
    rankLibrary(notes, "说说华泰资管的ABS", ["产品设计竞品分析"])[0].id,
  ).toBe("old");
  expect(rankLibrary(notes, "产品设计")).toHaveLength(6);
});
it("does not fill missing matches with unrelated or random notes", () => {
  expect(rankLibrary([note("a", "烧菜", "番茄炒蛋")], "基金运营")).toEqual([]);
});
it("uses recent user context for follow-up questions", () => {
  expect(
    rankLibrary([note("a", "华泰资管", "ABS台账核验")], "这段怎么讲", [
      "华泰资管的ABS经历",
    ])[0].id,
  ).toBe("a");
});
it("prefers a relevant reviewed item over an original document but never promotes unrelated items", () => {
  const entries = [
    { ...note("original", "ABS核验记录", "ABS核验资料"), format: "document" },
    { ...note("reviewed", "核验方法", "ABS"), format: "question" },
    { ...note("unrelated", "烹饪", "厨房"), format: "knowledge" },
  ];
  expect(rankLibrary(entries, "ABS核验").map((n) => n.id)).toEqual(["reviewed", "original"]);
});
