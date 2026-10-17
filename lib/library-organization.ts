import { z } from "zod";
export const sourceSegmentLimit = 24000;
export function splitSourceSegments(source: string): string[] {
  if (!source) return [""];
  const segments: string[] = [];
  let start = 0;
  while (start < source.length) {
    let end = Math.min(start + sourceSegmentLimit, source.length);
    if (end < source.length) {
      const chunk = source.slice(start, end);
      const paragraph = chunk.lastIndexOf("\n\n");
      const line = chunk.lastIndexOf("\n");
      if (paragraph >= sourceSegmentLimit / 2) end = start + paragraph + 2;
      else if (line >= sourceSegmentLimit / 2) end = start + line + 1;
      // Keep a surrogate pair together when a paragraph exceeds the limit.
      const last = source.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end--;
    }
    segments.push(source.slice(start, end));
    start = end;
  }
  return segments;
}
export const libraryTypes = {
  question: "面试问答",
  experience: "经历素材",
  knowledge: "知识与调研",
} as const;
export const organizationItemSchema = z.object({
  key: z.string().min(1).max(100),
  type: z.enum(["question", "experience", "knowledge"]),
  title: z.string().trim().min(1).max(300),
  answer: z.string().max(20000).default(""),
  context: z.string().max(10000).default(""),
  feedback: z.string().max(10000).default(""),
  quote: z.string().max(20000).default(""),
  selected: z.boolean().default(true),
  category: z.enum(["通用问题", "岗位特有", "待确认"]).default("通用问题"),
  roleScope: z.string().max(200).default(""),
  targetId: z.string().max(100).default(""),
  targetVersion: z.number().int().positive().optional(),
  savedId: z.string().optional(),
});
export type OrganizationItem = z.infer<typeof organizationItemSchema>;
export type AnswerVersion = {
  answer: string;
  feedback: string;
  context: string;
  at: string;
  source: string;
  documentId?: string;
  documentVersion?: number;
  quote?: string;
};
export type MaterialStructure = {
  items?: OrganizationItem[];
  complete?: boolean;
  context?: string;
  feedback?: string;
  answer?: string;
  answers?: AnswerVersion[];
  documentId?: string;
  documentVersion?: number;
  quote?: string;
};
export function materialFormat(m: { format?: string; source: string }) {
  return m.format && m.format !== "legacy"
    ? m.format
    : m.source.startsWith("Obsidian:")
      ? "document"
      : "legacy";
}
export function validateSourceQuotes(
  items: OrganizationItem[],
  source: string,
) {
  if (items.some((i) => i.quote && !source.includes(i.quote)))
    throw Error("引用片段不在原文中，请重新核对");
}
export function renderOrganizedContent(
  item: Pick<
    OrganizationItem,
    "type" | "title" | "answer" | "context" | "feedback"
  >,
  answers: AnswerVersion[],
) {
  if (item.type === "question")
    return (
      `问题：${item.title}\n\n` +
      (answers.length
        ? answers
            .map(
              (a, i) =>
                `回答版本 ${i + 1} · ${a.source} · ${a.at}\n回答：${a.answer || "尚未填写"}\n背景 / 相关介绍：${a.context}\n建议 / 点评（非经历事实）：${a.feedback}`,
            )
            .join("\n\n")
        : `回答：${item.answer || "尚未填写"}\n背景 / 相关介绍：${item.context}\n建议 / 点评（非经历事实）：${item.feedback}`)
    );
  return `${libraryTypes[item.type]}：${item.title}\n\n正文：${item.answer}\n\n背景 / 相关介绍：${item.context}\n\n建议 / 点评（非经历事实）：${item.feedback}`;
}
