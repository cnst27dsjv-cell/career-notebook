import { z } from "zod";
import { materialFormat, renderOrganizedContent, type MaterialStructure } from "./library-organization";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { generate } from "./model";
import { searchTavily } from "./tavily";
import { ensureExtractedFile } from "./assistant-files";
import {
  publicInterviewQuery,
  mapResearchSources,
  replaceAnswer,
  validateQuestions,
} from "./interview-practice";
import type { Interview, InterviewState } from "./types";

const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const content = z.string().trim().max(100000);
const asInterview = (value: unknown) => value as Interview;
const now = () => new Date().toISOString();
const message = (e: unknown) =>
  e instanceof Error ? e.message : "服务暂不可用，请重试";
function invalidateReview(state: InterviewState): InterviewState {
  const { review, completedAt, ...rest } = state;
  return review
    ? {
        ...rest,
        reviewHistory: [
          ...(rest.reviewHistory || []),
          { content: review, at: completedAt || now() },
        ],
      }
    : rest;
}
async function save(
  userId: string,
  current: Interview,
  patch: Partial<Interview>,
) {
  const result = await db.interview.updateMany({
    where: { id: current.id, userId, version: current.version },
    data: {
      ...(patch.questions ? { questions: json(patch.questions) } : {}),
      ...(patch.sources ? { sources: json(patch.sources) } : {}),
      ...(patch.turns ? { turns: json(patch.turns) } : {}),
      ...(patch.state ? { state: json(patch.state) } : {}),
      version: { increment: 1 },
    },
  });
  if (!result.count) throw Error("会话已在其他页面更新，请重新打开后重试");
  return { ...current, ...patch, version: current.version + 1 };
}
async function contextFor(userId: string, raw: Record<string, unknown>) {
  const prep = await db.preparation.findFirst({
    where: { id: z.string().parse(raw.preparationId), userId },
  });
  if (!prep) throw Error("面试准备不存在");
  const ids = [
    ...new Set(z.array(z.string()).max(8).default([]).parse(raw.materialIds)),
  ];
  const materials = ids.length
    ? await db.material.findMany({
        where: { userId, id: { in: ids }, archived: false },
      })
    : [];
  if (materials.length !== ids.length)
    throw Error("所选资料不存在或已归档，请重新选择");
  const context: NonNullable<InterviewState["context"]> = {
    company: prep.company,
    role: prep.role,
    round: prep.round,
    jd: prep.jd.slice(0, 12000),
    materials: materials.map((m) => ({
      id: m.id,
      title: m.title,
      content: m.content.slice(0, 6000),
      version: m.version,
      truncated: m.content.length > 6000,
    })),
  };
  if (raw.includeResume === true) {
    if (!prep.resumeId) throw Error("请先在面试准备中关联简历");
    const resume = await db.resume.findFirst({
      where: { id: prep.resumeId, userId },
    });
    const file =
      resume &&
      (await db.fileAsset.findFirst({ where: { id: resume.fileId, userId } }));
    if (!file) throw Error("关联简历文件不存在");
    const extracted = await ensureExtractedFile(file);
    context.resume = {
      name: file.name,
      content: extracted.extractedText.slice(0, 12000),
      truncated: extracted.extractedText.length > 12000,
    };
  }
  return { prep, context };
}
async function generateQuestions(
  userId: string,
  current: Interview,
  search: boolean,
) {
  let state = { ...current.state, generationError: "", researchError: "" };
  if (search) {
    try {
      const sources = mapResearchSources(
        await searchTavily(publicInterviewQuery(state.context!)),
      );
      current = await save(userId, current, { sources, questions: [], state });
    } catch (e) {
      return save(userId, current, {
        state: { ...state, researchError: message(e) },
      });
    }
  }
  try {
    const result = z
      .object({ questions: z.unknown() })
      .parse(
        await generate(
          "依据岗位、轮次、用户选择的简历和练习资料及公开搜索摘要，出5道模拟面试题。返回 {questions:[{question,sourceIds,basis}]}。不能声称公司原题。摘要不等于已阅读全文；只引用提供的source ID。个人经历来自context，不得编造。无公开证据时sourceIds为空、basis注明推测练习题。优先追问用户实际职责、方法和证据。",
          { context: state.context, sources: current.sources },
          "default",
          { maxTokens: 4096, thinking: "disabled" },
        ),
      );
    return save(userId, current, {
      questions: validateQuestions(result.questions, current.sources),
      state,
    });
  } catch (e) {
    return save(userId, current, {
      state: { ...state, generationError: message(e) },
    });
  }
}

export async function handleInterview(
  userId: string,
  raw: Record<string, unknown>,
): Promise<Interview> {
  const action = z.string().parse(raw.action);
  if (action === "research") {
    const { prep, context } = await contextFor(userId, raw);
    const current = asInterview(
      await db.interview.create({
        data: {
          userId,
          preparationId: prep.id,
          questions: [],
          state: json({ context, started: false, index: 0 }),
        },
      }),
    );
    return generateQuestions(userId, current, raw.search !== false);
  }
  const id = z.string().parse(raw.id);
  const row = await db.interview.findFirst({ where: { id, userId } });
  if (!row) throw Error("会话不存在");
  const current = asInterview(row);
  const version = z.number().int().min(1).parse(raw.version);
  if (action === "confirm") {
    const i = z
      .number()
      .int()
      .min(0)
      .max(current.questions.length - 1)
      .parse(raw.index);
    const existing = current.turns[i];
    if (
      existing?.confirmed &&
      existing.suggestion === raw.content &&
      (!raw.materialId || existing.materialId === raw.materialId)
    )
      return current;
  }
  if (version !== current.version) throw Error("会话已更新，请重新打开后重试");
  const state = current.state || {};
  if (action === "regenerate") {
    if (state.started || current.turns.some((t) => t?.answer))
      throw Error("练习开始后不能替换题目，请新建练习");
    return generateQuestions(userId, current, raw.search === true);
  }
  if (action === "start") {
    if (state.started || current.turns.some((t) => t?.answer))
      throw Error("练习已开始");
    return save(userId, current, {
      questions: validateQuestions(raw.questions, current.sources),
      state: { ...state, started: true, index: 0 },
    });
  }
  if (action === "progress") {
    const index = z
      .number()
      .int()
      .min(0)
      .max(current.questions.length - 1)
      .parse(raw.index);
    return save(userId, current, { state: { ...state, index } });
  }
  if (action === "finish") {
    if (!current.turns.some((t) => t?.answer?.trim()))
      throw Error("至少完成一道回答后再复盘");
    const result = z
      .object({ review: z.string().trim().min(1).max(20000) })
      .parse(
        await generate(
          "复盘本次模拟面试，返回 {review:Markdown文字}。分别整理已回答/未回答、做得好的具体回答片段、逻辑或证据缺口、待用户补充的事实、下次练习建议。引用原回答，勿用空泛评分。建议不等于用户事实；不要声称已新建日程或更改资料。",
          {
            context: state.context,
            questions: current.questions,
            turns: current.turns,
          },
          "default",
          { maxTokens: 4096, thinking: "disabled" },
        ),
      );
    return save(userId, current, {
      state: {
        ...invalidateReview(state),
        review: result.review,
        completedAt: now(),
      },
    });
  }
  const index = z
    .number()
    .int()
    .min(0)
    .max(current.questions.length - 1)
    .parse(raw.index);
  const turn = current.turns[index];
  if (action === "answer") {
    const answer = content.parse(raw.answer);
    if (turn?.answer === answer) return current;
    const turns = [...current.turns];
    // JSON arrays must stay dense when a person skips an earlier question.
    while (turns.length <= index) turns.push({ answer: "" });
    turns[index] = replaceAnswer(turn, answer, now());
    return save(userId, current, {
      turns,
      state: { ...invalidateReview(state), index },
    });
  }
  if (!turn?.answer?.trim()) throw Error("请先填写并保存回答");
  if (action === "feedback") {
    const result = z
      .object({
        content: z.string().min(1).max(20000),
        feedback: z.string().min(1).max(12000),
      })
      .parse(
        await generate(
          "针对当前回答给出具体反馈和建议稿，返回 {content,feedback}。参考用户选定的简历、资料和前文，区分缺失事实与表达问题；指出原句和改进理由。结构清晰、逻辑严密，保留专业术语，专业自然，既不过于书面也不过于口语。不得虚构用户经历和数字，待补事实写在feedback中询问。",
          {
            context: state.context,
            question: current.questions[index],
            answer: turn.answer,
            previousTurns: current.questions.slice(0, index).map((q, i) => ({
              question: q.question,
              answer: current.turns[i]?.answer || "",
            })),
          },
          "default",
          { maxTokens: 4096, thinking: "disabled" },
        ),
      );
    const turns = [...current.turns];
    const { history = [], ...old } = turn;
    turns[index] = {
      ...turn,
      feedback: result.feedback,
      suggestion: result.content,
      confirmed: false,
      history: turn.feedback ? [...history, { ...old, at: now() }] : history,
    };
    return save(userId, current, { turns, state: invalidateReview(state) });
  }
  if (action === "followup") {
    if (current.questions.length >= 30)
      throw Error("本场最多30题，请先复盘再开始下一次练习");
    const result = z
      .object({
        question: z.string().trim().min(1).max(2000),
        basis: z.string().max(2000),
      })
      .parse(
        await generate(
          "围绕当前真实回答提出一道有价值的追问，返回 {question,basis}。结合岗位、轮次、所选资料，追问职责边界、方法、依据或结果；不能新增用户事实，不重复已有问题。",
          {
            context: state.context,
            question: current.questions[index],
            answer: turn.answer,
            existingQuestions: current.questions.map((q) => q.question),
          },
          "default",
          { maxTokens: 4096, thinking: "disabled" },
        ),
      );
    const questions = [...current.questions];
    questions.splice(index + 1, 0, { ...result, sourceIds: [] });
    const turns = [...current.turns];
    while (turns.length < current.questions.length) turns.push({ answer: "" });
    turns.splice(index + 1, 0, { answer: "" });
    return save(userId, current, {
      questions,
      turns,
      state: { ...invalidateReview(state), index: index + 1 },
    });
  }
  if (action === "confirm") {
    if (turn.confirmed) return current;
    const value = content.min(1).parse(raw.content);
    const targetId = z.string().optional().parse(raw.materialId);
    return db.$transaction(async (tx) => {
      let material;
      if (targetId) {
        const old = await tx.material.findFirst({
          where: { id: targetId, userId, archived: false },
        });
        if (!old) throw Error("目标资料不存在");
        const format = materialFormat(old);
        if (["document", "experience", "knowledge"].includes(format)) throw Error("请新建问答条目或选择已有问题，原始文档与经历知识不会被练习答案覆盖");
        const structure = old.structure as MaterialStructure;
        const answers = [...(structure.answers || []), { answer: value, context: "", feedback: turn.feedback || "", at: now(), source: `模拟面试 ${id}` }];
        const updated = await tx.material.updateMany({
          where: {
            id: targetId,
            userId,
            version: z.number().int().parse(raw.materialVersion),
          },
          data: {
            content: format === "question" ? renderOrganizedContent({ type: "question", title: old.title, answer: value, context: "", feedback: turn.feedback || "" }, answers) : value,
            ...(format === "question" ? { structure: json({ ...structure, answers }) } : {}),
            version: { increment: 1 },
            revisions: json([
              ...(old.revisions as Prisma.JsonArray),
              { content: old.content, at: now(), source: `模拟面试 ${id}` },
            ]),
          },
        });
        if (!updated.count) throw Error("资料已更新，请重新核对后保存");
        material = { id: targetId };
      } else {
        material = await tx.material.create({
          data: {
            userId,
            preparationId: current.preparationId,
            title: current.questions[index].question,
            format: "question",
            content: renderOrganizedContent({ type: "question", title: current.questions[index].question, answer: value, context: "", feedback: turn.feedback || "" }, [{ answer: value, context: "", feedback: turn.feedback || "", at: now(), source: `模拟面试 ${id}` }]),
            structure: json({ answers: [{ answer: value, context: "", feedback: turn.feedback || "", at: now(), source: `模拟面试 ${id}` }] }),
            category: "待确认",
            kind: "边界或分类待确认",
            source: `模拟面试 ${id} 第${index + 1}题`,
            revisions: json([{ content: turn.answer, at: now() }]),
          },
        });
      }
      const turns = [...current.turns];
      turns[index] = {
        ...turn,
        confirmed: true,
        suggestion: value,
        materialId: material.id,
      };
      const updated = await tx.interview.updateMany({
        where: { id, userId, version },
        data: { turns: json(turns), version: { increment: 1 } },
      });
      if (!updated.count) throw Error("会话已更新，请重新打开后重试");
      return { ...current, turns, version: version + 1 };
    });
  }
  throw Error("不支持的练习操作");
}
