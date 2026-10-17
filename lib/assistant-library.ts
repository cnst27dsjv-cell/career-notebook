type LibraryNote = {
  format?: string;
  id: string;
  title: string;
  content: string;
  tags: string;
  roleScope: string;
};
const stop = new Set(
  "你好 谢谢 帮我 请问 梳理 说说 如何 怎么 这段 那段 这个 那个 之前 现在 可以 能够 一下 一些 什么 我的 我们 已经 进行 需要 希望 结合 根据 帮助 准备 面试 经历 内容 资料 笔记 回答 问题 项目 实习 工作 the and for with please".split(
    " ",
  ),
);
export function libraryTerms(input: string): string[] {
  const words = new Intl.Segmenter("zh-CN", { granularity: "word" }).segment(
    input.toLowerCase(),
  );
  return [
    ...new Set(
      [...words]
        .filter(
          (w) => w.isWordLike && w.segment.length >= 2 && !stop.has(w.segment),
        )
        .map((w) => w.segment),
    ),
  ].slice(0, 24);
}
function hits(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.reduce((n, term) => n + (lower.includes(term) ? 1 : 0), 0);
}
function score(note: LibraryNote, terms: string[]) {
  return (
    hits(note.title, terms) * 4 +
    hits(note.tags + " " + note.roleScope, terms) * 2 +
    hits(note.content, terms)
  );
}
function excerpt(text: string, current: string[], previous: string[]) {
  if (text.length <= 3000) return { content: text, truncated: false };
  const chunks = [];
  for (let start = 0; start < text.length; start += 800) {
    const content = text.slice(start, start + 900);
    chunks.push({
      start,
      content,
      score: hits(content, current) * 100 + hits(content, previous),
    });
  }
  const selected = chunks
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, 3)
    .sort((a, b) => a.start - b.start);
  return {
    content: selected.map((c) => c.content).join("\n[…节选间省略…]\n"),
    truncated: true,
  };
}
export function rankLibrary<T extends LibraryNote>(
  notes: T[],
  input: string,
  previous: string[] = [],
) {
  const currentTerms = libraryTerms(input);
  const oldTerms = libraryTerms(previous.slice(0, 3).join(" "));
  return notes
    .map((note) => ({
      note,
      current: score(note, currentTerms),
      previous: score(note, oldTerms),
    }))
    .filter((n) => n.current || n.previous)
    .sort(
      (a, b) =>
        Number(!!b.current) - Number(!!a.current) ||
        Number(["question", "experience", "knowledge"].includes(b.note.format || "")) - Number(["question", "experience", "knowledge"].includes(a.note.format || "")) ||
        b.current - a.current ||
        b.previous - a.previous ||
        a.note.id.localeCompare(b.note.id),
    )
    .slice(0, 6)
    .map(({ note }) => ({
      ...note,
      ...excerpt(note.content, currentTerms, oldTerms),
    }));
}
