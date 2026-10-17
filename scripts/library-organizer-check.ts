import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { handleLibraryOrganizer as run } from "../lib/library-organizer-service";
import { handleInterview } from "../lib/interview-service";
import { assistantContext } from "../lib/assistant-context";
import { compilePlan, executePlan } from "../lib/assistant-plan";
import { assistantReplySchema } from "../lib/assistant-schema";
import { importMaterialNote } from "../lib/material-notes";
const uid = `organizer-${randomUUID()}`;
const candidate = (key: string, title = "介绍项目") => ({
  key,
  title,
  type: "question",
  answer: "我负责核对数据。",
  context: "实习项目",
  feedback: "建议补充指标",
  quote: "我负责核对数据。",
  selected: true,
  category: "通用问题",
  roleScope: "",
  targetId: "",
});
try {
  const doc = await run(uid, {
    action: "create",
    title: "旧面试记录",
    content: "介绍项目\n我负责核对数据。\n建议补充指标",
    source: "文字",
  });
  const draft = await run(uid, {
    action: "draft",
    id: doc.id,
    version: doc.version,
    items: [
      candidate("one"),
      { ...candidate("two", "第二题"), selected: false },
    ],
  });
  const first = await run(uid, {
    action: "confirm",
    id: doc.id,
    version: draft.version,
    items: draft.structure.items,
  });
  assert.equal(first.content, doc.content);
  let entries = await db.material.findMany({
    where: { userId: uid, parentId: doc.id },
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].format, "question");
  assert.match(entries[0].content, /建议 \/ 点评（非经历事实）/);
  assert.equal(first.structure.items[0].savedId, entries[0].id);
  await assert.rejects(
    () =>
      run(uid, {
        action: "confirm",
        id: doc.id,
        version: draft.version,
        items: draft.structure.items,
      }),
    /更新|修改/,
  );
  await assert.rejects(
    () =>
      run(uid + "other", {
        action: "draft",
        id: doc.id,
        version: first.version,
        items: [],
      }),
    /不存在/,
  );
  const question = entries[0];
  const append = {
    ...candidate("two"),
    answer: "第二版回答",
    targetId: question.id,
    targetVersion: question.version,
  };
  const second = await run(uid, {
    action: "confirm",
    id: doc.id,
    version: first.version,
    items: [first.structure.items[0], append],
  });
  entries = await db.material.findMany({
    where: { userId: uid, parentId: doc.id },
  });
  assert.equal(entries.length, 1);
  assert.equal((entries[0].structure as any).answers.length, 2);
  assert.match(entries[0].content, /第二版回答/);
  const complete = await run(uid, {
    action: "complete",
    id: doc.id,
    version: second.version,
    items: second.structure.items,
  });
  assert.equal(complete.structure.complete, true);
  const foreign = await db.material.create({
    data: {
      userId: uid + "other",
      title: "foreign",
      content: "secret",
      format: "question",
    },
  });
  await assert.rejects(
    () =>
      run(uid, {
        action: "confirm",
        id: doc.id,
        version: complete.version,
        items: [
          ...complete.structure.items,
          { ...candidate("third"), targetId: foreign.id, targetVersion: 1 },
        ],
      }),
    /不存在/,
  );
  assert.equal(
    (await db.material.findUniqueOrThrow({ where: { id: doc.id } })).version,
    complete.version,
  );
  const imported = await importMaterialNote(uid, {
    vault: "test",
    path: "notes.md",
    content: "旧原文",
  });
  await db.material.update({
    where: { id: imported.id },
    data: { structure: { complete: true, items: [candidate("x")] } },
  });
  await importMaterialNote(uid, {
    vault: "test",
    path: "notes.md",
    content: "新原文",
    version: 1,
  });
  assert.deepEqual(
    (await db.material.findUniqueOrThrow({ where: { id: imported.id } }))
      .structure,
    {},
  );
  const prep = await db.preparation.create({
    data: { userId: uid, company: "测试", role: "运营", round: "一面" },
  });
  const interview = await db.interview.create({
    data: {
      userId: uid,
      preparationId: prep.id,
      questions: [{ question: "介绍项目", sourceIds: [], basis: "" }],
      turns: [{ answer: "我主动复核数据。", feedback: "可补充依据" }],
      state: { started: true },
    },
  });
  await handleInterview(uid, {
    action: "confirm",
    id: interview.id,
    version: 1,
    index: 0,
    content: "我主动复核数据并记录差异。",
    materialId: entries[0].id,
    materialVersion: entries[0].version,
  });
  const practiced = await db.material.findUniqueOrThrow({
    where: { id: entries[0].id },
  });
  assert.equal((practiced.structure as any).answers.length, 3);
  assert.match(practiced.content, /我主动复核数据并记录差异/);
  assert.match(practiced.content, /第二版回答/);
  const batchDoc = await run(uid, {
    action: "create",
    title: "第二份来源",
    content: "我负责核对数据。",
  });
  const batch = await run(uid, {
    action: "confirm",
    id: batchDoc.id,
    version: batchDoc.version,
    items: [
      {
        ...candidate("batch-a"),
        targetId: practiced.id,
        targetVersion: practiced.version,
      },
      {
        ...candidate("batch-b"),
        targetId: practiced.id,
        targetVersion: practiced.version,
        answer: "另一版回答",
      },
    ],
  });
  assert.equal(batch.structure.items.filter((i: any) => i.savedId).length, 2);
  assert.equal(
    (
      (await db.material.findUniqueOrThrow({ where: { id: practiced.id } }))
        .structure as any
    ).answers.length,
    5,
  );
  const context = await assistantContext(uid, "", [], [], [practiced.id]);
  const reusePlan = compilePlan(
    assistantReplySchema.parse({
      reply: "复用",
      actions: [
        {
          key: "reuse",
          action: "material.reuse",
          values: { materialId: practiced.id, preparationId: prep.id },
          reason: "复用问答",
        },
      ],
    }),
    context,
  );
  await db.$transaction((tx) => executePlan(tx, uid, reusePlan, true));
  const copied = await db.material.findFirstOrThrow({
    where: { userId: uid, parentId: practiced.id },
  });
  assert.equal(
    copied.format,
    "question",
    "Assistant reuse must keep structured question type",
  );
  assert.equal((copied.structure as any).answers.length, 5);
  assert.equal((copied.structure as any).answers[0].documentId, doc.id);
  const manualCopy = await run(uid, {
    action: "reuse",
    id: copied.id,
    version: copied.version,
    preparationId: prep.id,
  });
  assert.equal(manualCopy.format, "question");
  assert.equal(manualCopy.structure.answers.length, 5);
  await assert.rejects(
    () =>
      run(uid + "other", {
        action: "reuse",
        id: copied.id,
        version: copied.version,
        preparationId: prep.id,
      }),
    /不存在/,
  );
  console.log(
    "PASS: source preservation, partial/resume, stale/foreign rejection, answer versions, completion, original update invalidation",
  );
} finally {
  await db.interview.deleteMany({ where: { userId: uid } });
  await db.preparation.deleteMany({ where: { userId: uid } });
  await db.material.deleteMany({
    where: { userId: { in: [uid, uid + "other"] } },
  });
  await db.$disconnect();
}
