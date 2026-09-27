import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { generate, generateWithImages, searchWeb } from "@/lib/model";
import { z } from "zod";
import { suggestSlots } from "@/lib/rules";
import type { Prisma } from "@prisma/client";
import {
  importBatches,
  materialCategories,
  materialKinds,
  mergeClassifications,
  splitInterviewMaterial,
  type MaterialClassification,
} from "@/lib/material-import";
import { isSubstantivePolish } from "@/lib/polish";
import {
  automaticApplicationStageStatus,
  eventKindForApplicationStage,
} from "@/lib/application-stage";
export async function POST(r: Request) {
  try {
    const user = await userFor(r);
    const raw = await r.json();
    const action = z.string().parse(raw.action);
    const w = { userId: user.id };
    const input = z.string().max(100000).optional().parse(raw.input) || "";
    if (action === "connection") {
      const target = z.enum(["model", "vision", "search"]).parse(raw.target);
      if (target === "model") {
        const result = z
          .object({ ok: z.boolean() })
          .parse(
            await generate(
              '这是连接测试。只返回 {"ok":true}。',
              "不含个人信息的连接测试",
            ),
          );
        return Response.json(result);
      }
      if (target === "vision") {
        const result = z.object({ ok: z.boolean() }).parse(
          await generateWithImages(
            '这是连接测试。不需要描述图片，只返回 {"ok":true}。',
            "不含个人信息的图片连接测试",
            [
              {
                mime: "image/png",
                data: Buffer.from(
                  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8//8/AymAiSTVDKMaiANMRKqDg1ENxACSQwkAVW0DHeN02ZEAAAAASUVORK5CYII=",
                  "base64",
                ),
              },
            ],
          ),
        );
        return Response.json(result);
      }
      const result = await searchWeb("OpenAI Next Credits 官方接入指南");
      return Response.json({ ok: true, sourceCount: result.sources.length });
    }
    if (action === "polish") {
      const polishSchema = z.object({
        content: z.string().min(1),
        feedback: z.string(),
        questions: z.array(z.string()).default([]),
      });
      const payload = {
        input,
        style: raw.style || "口语自然，表达清晰",
        question: raw.question || "",
        supplement:
          z.string().max(20000).optional().parse(raw.supplement) || "",
      };
      const prompt =
        "把用户原文润色成可直接用于面试回答的完整建议稿。首要目标是让回答结构清晰、思维逻辑严密、语句通顺流畅；先识别题目真正要回答的内容，再根据题型选择合适的组织方式，例如结论—理由—经历证据—岗位匹配，但不要死套模板，也不要为了显得不同而机械替换句式。明确原文中隐含但有事实支撑的因果关系，让每一段都服务于核心回答。保留岗位相关的专业术语和必要细节，语气应专业自然，既不过于书面化，也不过于口语化。其次再删减重复内容、改善段落衔接。content必须体现结构或论证上的实质性优化，不能只替换少量词语。保持用户事实、口吻和个人经历，不新增数字或用户未提供的经历。supplement是用户主动补充的事实，可以用于完善回答。若原文和supplement仍没有完整回答题目，也要先润色已有内容，不能用正在思考、经验不足、仍需实践等说法替用户编写缺失答案；只在content末尾加入【待补充：具体缺失内容】，同时在feedback中指出缺口，并把需要用户补充的信息写入questions。返回 {content,feedback,questions:需要补充的事实问题数组}。";
      let result = polishSchema.parse(
        await generate(prompt, payload, "polish"),
      );
      const insufficient = (content: string) =>
        !isSubstantivePolish(input, content);
      const missingMarkerRequired = (value: typeof result) =>
        value.questions.length > 0 && !value.content.includes("【待补充：");
      if (insufficient(result.content) || missingMarkerRequired(result)) {
        const correction = [
          insufficient(result.content)
            ? "上一次建议稿与原文过于相似，只做了少量词语替换。本次必须重新梳理核心结论、论证顺序、经历证据与岗位匹配关系，在保留全部真实信息及专业术语的前提下产出结构明显更清晰的建议稿；不要只给评价，也不要继续沿用原文的段落组织。"
            : "",
          missingMarkerRequired(result)
            ? "上一次结果提出了需要用户补充的问题，却没有按要求标注缺失内容。请删除所有替用户推测或编写的缺失答案，只保留原文已有事实，并在content末尾使用【待补充：具体缺失内容】标明缺口。"
            : "",
        ].join("");
        result = polishSchema.parse(
          await generate(
            prompt + correction,
            { ...payload, previousFeedback: result.feedback },
            "polish",
          ),
        );
      }
      if (insufficient(result.content))
        throw Error("模型没有生成实质性优化的建议稿，请补充信息后重新尝试");
      if (missingMarkerRequired(result))
        throw Error("模型尝试补写未提供的信息，请补充事实后重新润色");
      return Response.json(result);
    }
    if (action === "import") {
      const segments = splitInterviewMaterial(input);
      if (!segments.length) throw Error("没有可拆分的文字内容");
      const classificationSchema = z.object({
        items: z.array(
          z.object({
            sourceIndex: z.number().int().min(0),
            roleScope: z.string().default(""),
            category: z.enum(materialCategories),
            kind: z.enum(materialKinds),
            title: z.string().min(1).max(200),
            confidence: z.number().min(0).max(1),
          }),
        ),
      });
      const classifications: MaterialClassification[] = [];
      const batches = importBatches(segments);
      let nextBatch = 0;
      const classifyNextBatch = async () => {
        const batchIndex = nextBatch++;
        const batch = batches[batchIndex];
        if (!batch) return;
        const payload = batch.map((segment) => ({
          sourceIndex: segment.sourceIndex,
          roleHint: segment.roleScope,
          text: segment.content,
        }));
        let parsed: z.infer<typeof classificationSchema> | undefined;
        for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
          try {
            parsed = classificationSchema.parse(
              await generate(
                "你只负责给原文片段分类，不得省略、合并或拆分片段，也不要返回正文。每个sourceIndex必须恰好返回一次。category只能是岗位特有、通用问题、待确认。岗位特有的kind只能是自我介绍、求职动机、岗位相关专业问题与知识点、Case、其他；岗位职责、行业知识、工具、法规和专业问答都归入岗位相关专业问题与知识点；为什么选择某岗位、公司或行业属于求职动机；与岗位相关但不属于前述类别的内容归入其他。通用问题的kind只能是个性问题、行为面试、其他通用问题；其中优势短板、性格与个人偏好属于个性问题。通用问题的roleScope返回空字符串。无法确定时使用category=待确认、kind=边界或分类待确认。title优先使用原问题或原有版本标题。confidence为0到1。返回{items:[{sourceIndex,roleScope,category,kind,title,confidence}]}。",
                payload,
              ),
            );
            const expected = new Set(
              batch.map((segment) => segment.sourceIndex),
            );
            if (
              parsed.items.length !== batch.length ||
              parsed.items.some((entry) => !expected.has(entry.sourceIndex))
            )
              throw Error("模型分类结果未覆盖当前批次");
          } catch {
            parsed = undefined;
          }
        }
        if (parsed) classifications.push(...parsed.items);
        await classifyNextBatch();
      };
      await Promise.all(
        Array.from({ length: Math.min(2, batches.length) }, classifyNextBatch),
      );
      return Response.json(mergeClassifications(segments, classifications));
    }
    if (action === "reuse") {
      const prep = await db.preparation.findFirst({
        where: { id: raw.preparationId, ...w },
      });
      if (!prep) throw Error("面试准备不存在");
      const query = [
        prep.company,
        prep.role,
        ...(prep.jd.match(/[\p{L}\p{N}]{2,16}/gu) || []).slice(0, 15),
      ];
      const candidates = await db.material.findMany({
        where: {
          ...w,
          archived: false,
          AND: [
            {
              OR: [
                { preparationId: { not: prep.id } },
                { preparationId: null },
              ],
            },
            {
              OR: [
                { kind: "自我介绍" },
                ...query
                  .filter(Boolean)
                  .flatMap((q) => [
                    { title: { contains: q } },
                    { tags: { contains: q } },
                    { content: { contains: q } },
                  ]),
              ],
            },
          ],
        },
        take: 100,
        orderBy: { updatedAt: "desc" },
      });
      const ranked = candidates
        .map((m) => ({
          m,
          score:
            query.reduce(
              (n, q) =>
                n + (`${m.title} ${m.tags} ${m.content}`.includes(q) ? 1 : 0),
              0,
            ) + (m.kind === "自我介绍" ? 1 : 0),
        }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((x) => ({
          ...x.m,
          reason:
            x.m.kind === "自我介绍"
              ? "可复用的自我介绍，请核对公司名称与岗位方向"
              : "匹配公司、岗位或 JD 关键词",
        }));
      return Response.json({ items: ranked });
    }
    if (action === "application") {
      const records = await db.application.findMany({ where: w });
      const candidates = records.filter((a) => input.includes(a.company));
      if (!candidates.length)
        throw Error("请在消息中写出已投递的公司名称，方便找到对应岗位。");
      const result = z
        .object({
          id: z.string().nullable(),
          stage: z
            .enum(["待投递", "已投递", "测评", "笔试", "面试", "Offer"])
            .nullable(),
          outcome: z
            .enum(["", "未通过", "主动撤回", "录用已接受", "录用已拒绝"])
            .nullable(),
          missing: z.array(z.string()),
        })
        .parse(
          await generate(
            "根据用户明确表达生成投递进度更新草稿，返回 {id,stage,outcome,missing}。只选择提供的记录ID；同公司多岗位且无法确定则id=null并询问岗位。未要求变更的字段返回null。阶段状态由关联日程自动计算，不要返回阶段状态。完成面试仅代表等待结果，不代表通过。",
            {
              input,
              candidates: candidates.map((a) => ({
                id: a.id,
                company: a.company,
                role: a.role,
                stage: a.stage,
                stageStatus: a.stageStatus,
                outcome: a.outcome,
              })),
            },
          ),
        );
      const existing = candidates.find((a) => a.id === result.id);
      if (!existing)
        throw Error(result.missing.join("、") || "请明确要更新的公司和岗位");
      const stage = result.stage ?? existing.stage;
      const eventKind = eventKindForApplicationStage(stage);
      const pendingEvent = eventKind
        ? await db.event.findFirst({
            where: {
              ...w,
              applicationId: existing.id,
              kind: eventKind,
              status: "待完成",
            },
          })
        : null;
      return Response.json({
        application: {
          ...existing,
          stage,
          stageStatus: automaticApplicationStageStatus(stage, {
            hasPendingEvent: Boolean(pendingEvent),
            keepWaiting:
              stage === existing.stage && existing.stageStatus === "等待结果",
          }),
          outcome: result.outcome ?? existing.outcome,
        },
        before: existing,
        missing: result.missing,
      });
    }
    if (action === "schedule") {
      const result = z
        .object({
          title: z.string(),
          kind: z.enum([
            "招聘会",
            "投递",
            "测评",
            "笔试",
            "面试",
            "准备",
            "其他",
          ]),
          start: z.string().datetime({ offset: true }).nullable(),
          deadline: z.string().datetime({ offset: true }).nullable(),
          company: z.string().default(""),
          role: z.string().default(""),
          notes: z.string(),
          missing: z.array(z.string()),
        })
        .parse(
          await generate(
            "从邮件/文字提取一项日程。返回 {title,kind,start,deadline,company,role,notes,missing:缺失或歧义字段列表}。时间返回带+08:00的ISO格式；不明确则null并放入missing，不能猜年份。当前日期" +
              new Date().toISOString(),
            input,
          ),
        );
      const settings = await db.settings.findUnique({
        where: { userId: user.id },
      });
      let slots: string[] = [];
      if (
        result.deadline &&
        !Number.isNaN(Date.parse(result.deadline)) &&
        settings?.availabilityConfirmed
      ) {
        const events = await db.event.findMany({ where: w });
        slots = suggestSlots(
          events,
          60,
          new Date(result.deadline),
          settings.availability as { weekdays: number[]; weekends: number[] },
        );
      }
      return Response.json({ ...result, slots });
    }
    if (action === "research") {
      const prep = await db.preparation.findFirst({
        where: { id: raw.preparationId, ...w },
      });
      if (!prep) throw Error("面试准备不存在");
      const research = await searchWeb(
        `${prep.company} ${prep.role} 招聘 面试 面经`,
      );
      const sources = research.sources.map((source, i) => ({
        id: `source-${i}`,
        title: source.title,
        url: source.url,
        description: "Grok 搜索引用，请打开来源核对全文。",
        published: "未知",
        retrievedAt: new Date().toISOString(),
        kind: "联网引用，未核实全文",
      }));
      const result = z
        .object({
          questions: z
            .array(
              z.object({
                question: z.string(),
                sourceIds: z.array(z.string()),
                basis: z.string(),
              }),
            )
            .min(1)
            .max(10),
        })
        .parse(
          await generate(
            "根据公司岗位JD和检索摘要出5道模拟面试题。返回 {questions:[{question,sourceIds,basis}]}。不能称为公司原题。只引用提供的source ID；没有证据则sourceIds为空且basis写明推测练习题。",
            {
              company: prep.company,
              role: prep.role,
              jd: prep.jd,
              research: research.text,
              sources,
            },
          ),
        );
      if (
        result.questions.some((q) =>
          q.sourceIds.some(
            (id) => !sources.some((s: { id: string }) => s.id === id),
          ),
        )
      )
        throw Error("来源校验失败，请重试");
      const interview = await db.interview.create({
        data: {
          ...w,
          preparationId: prep.id,
          questions: result.questions,
          sources,
        },
      });
      return Response.json({ id: interview.id });
    }
    if (action === "feedback") {
      const current = await db.interview.findFirst({
        where: { id: raw.id, ...w },
      });
      if (!current) throw Error("会话不存在");
      const index = z.number().int().min(0).parse(raw.index);
      const q = (current.questions as Prisma.JsonArray)[index];
      const turns = current.turns as Prisma.JsonArray;
      const turn = turns[index] as Prisma.JsonObject;
      if (!turn?.answer) throw Error("请先保存回答");
      const result = z
        .object({ content: z.string(), feedback: z.string() })
        .parse(
          await generate(
            "针对问题和回答给出反馈，并润色为口语逐字稿，不能新增任何个人事实。返回 {content,feedback}。",
            { question: q, answer: turn.answer },
            "polish",
          ),
        );
      turns[index] = {
        ...turn,
        suggestion: result.content,
        feedback: result.feedback,
      };
      const change = await db.interview.updateMany({
        where: { id: current.id, version: current.version },
        data: { turns, version: { increment: 1 } },
      });
      if (!change.count) throw Error("回答已修改，请重新润色");
      return Response.json(result);
    }
    throw Error("不支持的助理操作");
  } catch (e) {
    return failure(e);
  }
}
