import { z } from "zod";
import type { Interview, Question, Source, Turn } from "./types";

export function publicInterviewQuery(prep: {
  company: string;
  role: string;
  round: string;
  jd?: string;
}) {
  return `${prep.company.slice(0, 200)} ${prep.role.slice(0, 200)} ${prep.round.slice(0, 100)} 招聘 面试 岗位要求`;
}
export function mapResearchSources(research: {
  searchedAt: string;
  sources: { id: string; label: string; url: string; snippet: string }[];
}): Source[] {
  return research.sources.map((s) => ({
    id: s.id,
    title: s.label,
    url: s.url,
    description: s.snippet,
    published: "未知",
    retrievedAt: research.searchedAt,
    kind: "搜索摘要，未核实全文",
  }));
}
export function replaceAnswer(
  turn: Turn | undefined,
  answer: string,
  at: string,
): Turn {
  if (turn?.answer === answer) return turn;
  const { history = [], ...previous } = turn || { answer: "" };
  return {
    answer,
    ...(turn?.materialId ? { materialId: turn.materialId } : {}),
    history:
      previous.answer || previous.feedback
        ? [...history, { ...previous, at }]
        : history,
  };
}
export function validateQuestions(
  input: unknown,
  sources: Source[],
): Question[] {
  const questions = z
    .array(
      z.object({
        question: z.string().trim().min(1).max(2000),
        sourceIds: z.array(z.string()).max(10),
        basis: z.string().max(2000),
      }),
    )
    .min(1)
    .max(30)
    .parse(input);
  if (
    questions.some((q) =>
      q.sourceIds.some((id) => !sources.some((s) => s.id === id)),
    )
  )
    throw Error("来源校验失败，请重新生成");
  return questions;
}
export function interviewMarkdown(session: Interview) {
  const context = session.state?.context;
  return [
    `# ${context ? `${context.company} · ${context.role} · ${context.round}` : "模拟面试记录"}`,
    `会话：${session.id}\n状态：${session.state?.completedAt ? "已复盘" : "练习中"}`,
    ...session.questions.map((q, i) => {
      const turn = session.turns[i];
      return [
        `## ${i + 1}. ${q.question}`,
        `出题依据：${q.basis}`,
        `### 原始回答\n${turn?.answer || "（未回答）"}`,
        ...(turn?.history || []).map(
          (h) =>
            `### 历史回答 · ${h.at}\n${h.answer}\n\n${h.feedback || ""}\n\n${h.suggestion || ""}`,
        ),
        turn?.feedback ? `### 反馈\n${turn.feedback}` : "",
        turn?.suggestion
          ? `### ${turn.confirmed ? "已确认答案" : "建议稿（未确认）"}\n${turn.suggestion}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");
    }),
    ...(session.state?.reviewHistory || []).map(
      (r) => `## 历史复盘 · ${r.at}\n${r.content}`,
    ),
    session.state?.review ? `## 整场复盘\n${session.state.review}` : "",
    "## 调研来源",
    ...session.sources.map(
      (s) =>
        `- [${s.title}](${s.url})（${s.kind}；检索 ${s.retrievedAt}）\n  ${s.description}`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}
