import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../lib/db";
import { assistantContext } from "../lib/assistant-context";
import { compilePlan } from "../lib/assistant-plan";
import { assistantReplySchema } from "../lib/assistant-schema";
const uid = `library-check-${randomUUID()}`;
const other = `${uid}-other`;
try {
  const original =
    "普通日记。".repeat(2200) +
    "华泰资管的ABS核验，我核对底层资产权属，记录三项缺失材料。";
  const note = await db.material.create({
    data: {
      userId: uid,
      title: "实习回顾",
      content: original,
      source: "Obsidian:面试库/华泰.md",
    },
  });
  await db.material.createMany({
    data: [
      { userId: other, title: "华泰资管秘密", content: "别人的秘密经历" },
      {
        userId: uid,
        title: "华泰资管已归档",
        content: "归档的内容",
        archived: true,
      },
      ...Array.from({ length: 12 }, (_, i) => ({
        userId: uid,
        title: `旅行${i}`,
        content: "我去了杭州",
      })),
    ],
  });
  const context = await assistantContext(uid, "帮我梳理华泰资管的ABS项目经历");
  assert.deepEqual(
    context.materials.map((m) => m.id),
    [note.id],
  );
  assert.match(context.model.materials[0].content, /三项缺失材料/);
  assert.equal(context.model.materials[0].truncated, true);
  const plan = compilePlan(
    assistantReplySchema.parse({ reply: "参考所选资料", sourceIds: [note.id] }),
    context,
  );
  assert.equal(
    plan.materialEvidence?.[0].content,
    context.model.materials[0].content,
  );
  assert.equal(plan.materialEvidence?.[0].source, "Obsidian:面试库/华泰.md");
  assert.equal(plan.materialEvidence?.[0].version, 1);
  const empty = await assistantContext(uid, "天气怎么样");
  assert.equal(empty.materials.length, 0);
  const followup = await assistantContext(
    uid,
    "这段怎么讲",
    [],
    ["华泰资管的ABS经历"],
  );
  assert.equal(followup.materials[0].id, note.id);
  await db.material.update({
    where: { id: note.id },
    data: {
      content: "华泰资管的ABS核验，更新为四项。",
      version: { increment: 1 },
    },
  });
  const updated = await assistantContext(uid, "华泰资管ABS");
  assert.match(updated.model.materials[0].content, /四项/);
  assert.equal(updated.model.materials[0].version, 2);
  assert.match(plan.materialEvidence![0].content, /三项/);
  // Force payload trimming and ensure evidence never advertises discarded material.
  await db.application.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      userId: uid,
      company: `公司${i}`,
      role: "产品",
      notes: "长内容".repeat(500),
      jd: "描述".repeat(1000),
    })),
  });
  const bounded = await assistantContext(uid, "华泰资管ABS 公司1", [
    {
      id: "file",
      name: "附加文件",
      text: "文".repeat(16000),
      truncated: false,
    },
  ]);
  const boundedPlan = compilePlan(
    assistantReplySchema.parse({ reply: "答复" }),
    bounded,
  );
  assert.deepEqual(
    boundedPlan.materialEvidence?.map((n) => n.id),
    bounded.model.materials.map((n) => n.id),
  );
  const prep = await db.preparation.create({
    data: { userId: uid, company: "华泰", role: "研究员", round: "初面" },
  });
  await db.material.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      userId: uid,
      title: `华泰研究员${i}`,
      content: "华泰研究员岗位",
    })),
  });
  const correction = await assistantContext(
    uid,
    "公司改成华泰，岗位改为研究员",
    [],
    [],
    [note.id],
  );
  const correctedPlan = compilePlan(
    assistantReplySchema.parse({
      reply: "待确认",
      actions: [
        {
          key: "reuse",
          action: "material.reuse",
          values: { materialId: note.id, preparationId: prep.id },
          reason: "保留之前选择的经历",
        },
      ],
    }),
    correction,
  );
  assert.equal(correctedPlan.actions[0].values.materialId, note.id);
  assert.ok(!correctedPlan.materialEvidence?.some((n) => n.id === note.id));
  await db.material.updateMany({
    where: { userId: uid, title: { startsWith: "华泰研究员" } },
    data: { content: "华泰研究员岗位说明。".repeat(1000) },
  });
  const ranked = await assistantContext(uid, "华泰研究员");
  const lastId = ranked.model.materials.at(-1)!.id;
  const trimmed = await assistantContext(
    uid,
    "华泰研究员",
    [{ id: "file", name: "正文", text: "文".repeat(16000), truncated: false }],
    [],
    [lastId],
  );
  assert.ok(!trimmed.model.materials.some((m) => m.id === lastId));
  const trimmedPlan = compilePlan(
    assistantReplySchema.parse({
      reply: "待确认",
      actions: [
        {
          key: "reuse",
          action: "material.reuse",
          values: { materialId: lastId, preparationId: prep.id },
          reason: "保留引用",
        },
      ],
    }),
    trimmed,
  );
  assert.equal(trimmedPlan.actions[0].values.materialId, lastId);
  const invalid = await assistantContext(uid, "无关", [], [], ["foreign-id"]);
  assert.ok(!invalid.materials.some((n) => n.id === "foreign-id"));
  console.log(
    "PASS: local database retrieval, Chinese/tail excerpts, account isolation, archived exclusion, updates, persisted evidence and bounded context",
  );
} finally {
  await db.preparation.deleteMany({ where: { userId: uid } });
  await db.application.deleteMany({ where: { userId: uid } });
  await db.material.deleteMany({ where: { userId: { in: [uid, other] } } });
  await db.$disconnect();
}
