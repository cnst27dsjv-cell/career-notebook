import { expect, it } from "vitest";
import {
  noteSource,
  noteTitle,
  planNoteImport,
  displayNoteSource,
} from "../lib/markdown-library";
it("displays encoded note names once without changing identifiers or other sources", () => {
  const source = noteSource("interview preparation", "银行/瑞银 100%25.md");
  expect(displayNoteSource(source)).toBe(
    "Obsidian:interview preparation/银行/瑞银 100%25.md",
  );
  expect(source).toContain("%E9");
  expect(displayNoteSource("Obsidian:旧库/100%记录.md")).toBe(
    "Obsidian:旧库/100%记录.md",
  );
  expect(displayNoteSource("https://example.com/a%20b")).toBe(
    "https://example.com/a%20b",
  );
});
it("stable source distinguishes folders and rejects paths outside the selected folder", () => {
  expect(noteSource("面试库", "银行/练习.md")).not.toBe(
    noteSource("面试库", "科技/练习.md"),
  );
  expect(() => noteSource("库", "../private.md")).toThrow();
  expect(() => noteSource("库", ".obsidian/config.md")).toThrow();
});
it("keeps Markdown verbatim and creates only a genuinely new note", () => {
  const content = "---\ntags: [面试]\n---\n# 练习\n\n[[经历]]\n我的原回答\n";
  const result = planNoteImport(
    { vault: "库", path: "面试.md", content },
    null,
  );
  expect(result.content).toBe(content);
  expect(result.mode).toBe("create");
  expect(noteTitle("银行/练习.md")).toBe("练习");
});
it("reimport is idempotent, changed notes need matching version and retain previous text", () => {
  const old = {
    id: "m",
    content: "old",
    version: 2,
    archived: false,
    revisions: [],
  };
  expect(
    planNoteImport({ vault: "库", path: "面试.md", content: "old" }, old).mode,
  ).toBe("unchanged");
  expect(() =>
    planNoteImport(
      { vault: "库", path: "面试.md", content: "new", version: 1 },
      old,
    ),
  ).toThrow("更新");
  expect(
    planNoteImport(
      { vault: "库", path: "面试.md", content: "new", version: 2 },
      old,
    ).mode,
  ).toBe("update");
});
