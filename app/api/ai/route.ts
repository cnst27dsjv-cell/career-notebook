import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { generate } from "@/lib/model";
import { z } from "zod";
import { suggestSlots } from "@/lib/rules";
import type { Prisma } from "@prisma/client";
const item = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  kind: z.string(),
});
export async function POST(r: Request) {
  try {
    const user = await userFor(r);
    const raw = await r.json();
    const action = z.string().parse(raw.action);
    const w = { userId: user.id };
    const input = z.string().max(100000).optional().parse(raw.input) || "";
    if (action === "polish") {
      const result = z
        .object({
          content: z.string(),
          feedback: z.string(),
          questions: z.array(z.string()).default([]),
        })
        .parse(
          await generate(
            "润色用户原文，保持事实、口吻和个人经历，不新增数字。返回 {content,feedback,questions:需要补充的事实问题数组}。",
            {
              input,
              style: raw.style || "口语自然，表达清晰",
              question: raw.question || "",
            },
          ),
        );
      return Response.json(result);
    }
    if (action === "import") {
      const result = z
        .object({ items: z.array(item).max(100) })
        .parse(
          await generate(
            "将原文拆为自我介绍和问题回答。逐字保留回答事实，不编写新回答。返回 {items:[{title,content,kind}]}。",
            input,
          ),
        );
      return Response.json(result);
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
          OR: [{ preparationId: { not: prep.id } }, { preparationId: null }],
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
          stageStatus: z.enum(["待安排", "待完成", "等待结果"]).nullable(),
          outcome: z
            .enum(["", "未通过", "主动撤回", "录用已接受", "录用已拒绝"])
            .nullable(),
          missing: z.array(z.string()),
        })
        .parse(
          await generate(
            "根据用户明确表达生成投递进度更新草稿，返回 {id,stage,stageStatus,outcome,missing}。只选择提供的记录ID；同公司多岗位且无法确定则id=null并询问岗位。未要求变更的字段返回null。完成面试仅代表等待结果，不代表通过。",
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
      return Response.json({
        application: {
          ...existing,
          stage: result.stage ?? existing.stage,
          stageStatus: result.stageStatus ?? existing.stageStatus,
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
      if (!process.env.SEARCH_API_KEY)
        throw Error(
          "联网搜索尚未配置。可先手动准备问题，配置后再调研真实来源。",
        );
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", `${prep.company} ${prep.role} 招聘 面试 面经`);
      url.searchParams.set("count", "8");
      url.searchParams.set("search_lang", "zh-hans");
      const res = await fetch(url, {
        headers: {
          "X-Subscription-Token": process.env.SEARCH_API_KEY,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw Error("搜索服务失败，请稍后重试");
      const data = await res.json();
      const sources = (data.web?.results || [])
        .filter((x: { url: string }) => /^https?:\/\//.test(x.url))
        .map(
          (
            x: {
              title: string;
              url: string;
              description: string;
              age?: string;
            },
            i: number,
          ) => ({
            id: `source-${i}`,
            title: x.title,
            url: x.url,
            description: x.description,
            published: x.age || "未知",
            retrievedAt: new Date().toISOString(),
            kind: "仅搜索摘要，未核实全文",
          }),
        );
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
            { company: prep.company, role: prep.role, jd: prep.jd, sources },
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
