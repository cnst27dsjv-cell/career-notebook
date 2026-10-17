import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { handleInterview } from "../lib/interview-service";
import { importMaterialNote } from "../lib/material-notes";
import type { Prisma } from "@prisma/client";

const userId = `interview-check-${randomUUID()}`;
const fetchOriginal = globalThis.fetch;
const originalEnv = {
  key: process.env.TEXT_MODEL_API_KEY,
  url: process.env.TEXT_MODEL_BASE_URL,
  name: process.env.TEXT_MODEL_NAME,
};
process.env.TEXT_MODEL_API_KEY = "test-only";
process.env.TEXT_MODEL_BASE_URL = "https://interview-test.invalid";
process.env.TEXT_MODEL_NAME = "test-only";
let modelAction = "questions";
globalThis.fetch = async (input, init) => {
  if (String(input).startsWith("https://interview-test.invalid/")) {
    const body = JSON.parse(String(init?.body));
    assert(body.messages[0].content.includes("不能虚构"));
    const result =
      modelAction === "questions"
        ? {
            questions: [
              { question: "负责什么？", sourceIds: [], basis: "推测练习题" },
              { question: "如何检查？", sourceIds: [], basis: "推测练习题" },
            ],
          }
        : modelAction === "feedback"
          ? { content: "建议表达", feedback: "请补充核对依据" }
          : modelAction === "followup"
            ? { question: "依据来自哪里？", basis: "针对当前回答追问" }
            : { review: "具体改进：补充核对依据" };
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(result) } },
      ],
    });
  }
  return fetchOriginal(input, init);
};
try {
  const note = {
    vault: "测试面试库",
    path: "银行/面试.md",
    content: "# 既有智能体面试\n用户：我做过核验\n助理：请解释依据\n",
  };
  await Promise.all([
    importMaterialNote(userId, note),
    importMaterialNote(userId, note),
  ]);
  let materials = await db.material.findMany({ where: { userId } });
  assert.equal(materials.length, 1);
  const m = materials[0];
  assert.equal(m.content, note.content);
  await assert.rejects(
    importMaterialNote(userId, { ...note, content: "changed", version: 0 }),
  );
  await importMaterialNote(userId, {
    ...note,
    content: note.content + "\n补充背景",
    version: m.version,
  });
  let updated = await db.material.findUniqueOrThrow({ where: { id: m.id } });
  assert.equal((updated.revisions as Prisma.JsonArray).length, 1);
  const prep = await db.preparation.create({
    data: {
      userId,
      company: "测试公司",
      role: "运营",
      round: "二面",
      jd: "核验岗位",
    },
  });
  let session = await handleInterview(userId, {
    action: "research",
    preparationId: prep.id,
    search: false,
    materialIds: [m.id],
  });
  assert.equal(session.questions.length, 2);
  assert.equal(session.state?.context?.materials[0].content, updated.content);
  await assert.rejects(
    handleInterview("foreign-user", {
      action: "answer",
      id: session.id,
      version: session.version,
      index: 0,
      answer: "a",
    }),
    /会话/,
  );
  session = await handleInterview(userId, {
    action: "start",
    id: session.id,
    version: session.version,
    questions: session.questions,
  });
  session = await handleInterview(userId, {
    action: "answer",
    id: session.id,
    version: session.version,
    index: 1,
    answer: "核验底层材料",
  });
  assert.equal(session.turns[0].answer, "");
  modelAction = "feedback";
  session = await handleInterview(userId, {
    action: "feedback",
    id: session.id,
    version: session.version,
    index: 1,
  });
  modelAction = "followup";
  session = await handleInterview(userId, {
    action: "followup",
    id: session.id,
    version: session.version,
    index: 1,
  });
  assert.equal(session.questions[2].question, "依据来自哪里？");
  modelAction = "review";
  session = await handleInterview(userId, {
    action: "finish",
    id: session.id,
    version: session.version,
  });
  assert(session.state?.review?.includes("核对依据"));
  const previousVersion = session.version;
  session = await handleInterview(userId, {
    action: "answer",
    id: session.id,
    version: session.version,
    index: 1,
    answer: "补充后的真实回答",
  });
  assert.equal(session.turns[1].history?.[0].answer, "核验底层材料");
  assert(!session.state?.review);
  await assert.rejects(
    handleInterview(userId, {
      action: "answer",
      id: session.id,
      version: previousVersion,
      index: 1,
      answer: "过期输入",
    }),
    /更新/,
  );
  const confirmation = {
    action: "confirm",
    id: session.id,
    version: session.version,
    index: 1,
    content: "新的练习答案",
    materialId: m.id,
    materialVersion: updated.version,
  };
  await assert.rejects(handleInterview(userId, confirmation), /原始文档/);
  const independent = { ...confirmation, materialId: undefined, materialVersion: undefined };
  session = await handleInterview(userId, independent);
  updated = await db.material.findUniqueOrThrow({ where: { id: m.id } });
  assert(!updated.content.includes("新的练习答案"), "Original document stays untouched");
  assert(updated.content.includes("既有智能体面试"));
  await handleInterview(userId, independent);
  assert.equal(await db.material.count({ where: { userId, format: "question" } }), 1);
  const otherNote = await importMaterialNote(userId + "-other", note);
  assert.notEqual(otherNote.id, m.id);
  session = await handleInterview(userId, {action:"answer",id:session.id,version:session.version,index:1,answer:"另一轮回答"});
  await assert.rejects(handleInterview(userId,{action:"confirm",id:session.id,version:session.version,index:1,content:"不能写入别人资料",materialId:otherNote.id,materialVersion:1}),/目标资料/);
  const concurrent = {action:"confirm",id:session.id,version:session.version,index:1,content:"新独立条目"};
  await Promise.allSettled([handleInterview(userId,concurrent),handleInterview(userId,concurrent)]);
  assert.equal(await db.material.count({where:{userId}}),3,"Concurrent confirmation must not create duplicate materials");
  const persisted = await db.interview.findUniqueOrThrow({
    where: { id: session.id },
  });
  assert.equal((persisted.state as Prisma.JsonObject).index, 1);
  console.log(
    "PASS: real local database import deduplication, revisions, selected context, question/answer/followup/review, history, ownership, conflicts and repeat confirmation",
  );
} finally {
  globalThis.fetch = fetchOriginal;
  process.env.TEXT_MODEL_API_KEY = originalEnv.key;
  process.env.TEXT_MODEL_BASE_URL = originalEnv.url;
  process.env.TEXT_MODEL_NAME = originalEnv.name;
  await db.interview.deleteMany({ where: { userId } });
  await db.material.deleteMany({ where: { userId: { in: [userId, userId + "-other"] } } });
  await db.preparation.deleteMany({ where: { userId } });
  await db.$disconnect();
}
