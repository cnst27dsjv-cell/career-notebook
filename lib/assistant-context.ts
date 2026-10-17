import { db } from "./db";
import { suggestSlots } from "./rules";
import { libraryTerms, rankLibrary } from "./assistant-library";

export type AssistantContextFile = {
  id: string;
  name: string;
  text: string;
  truncated: boolean;
};

export async function assistantContext(
  userId: string,
  input: string,
  attachments: AssistantContextFile[] = [],
  previousMessages: string[] = [],
  referencedMaterialIds: string[] = [],
) {
  const w = { userId };
  const [applications, events, preparations, resumes, settings] =
    await Promise.all([
      db.application.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.event.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.preparation.findMany({ where: w, orderBy: { updatedAt: "desc" } }),
      db.resume.findMany({
        where: { ...w, archived: false },
        orderBy: { createdAt: "desc" },
      }),
      db.settings.findUnique({ where: w }),
    ]);
  const matched = applications.filter(
    (a) => input.includes(a.company) || input.includes(a.role),
  );
  const keywords = [
    ...new Set([
      ...libraryTerms(input),
      ...libraryTerms(previousMessages.slice(0, 3).join(" ")),
    ]),
  ];
  const candidates = keywords.length
    ? await db.material.findMany({
        where: {
          ...w,
          archived: false,
          OR: keywords.flatMap((q) => [
            { title: { contains: q, mode: "insensitive" as const } },
            { content: { contains: q, mode: "insensitive" as const } },
            { roleScope: { contains: q, mode: "insensitive" as const } },
            { tags: { contains: q, mode: "insensitive" as const } },
          ]),
        },
        select: {
          id: true,
          title: true,
          content: true,
          format: true,
          roleScope: true,
          tags: true,
          category: true,
          source: true,
          version: true,
        },
      })
    : [];
  const materials = rankLibrary(candidates, input, previousMessages);
  // Pending actions must retain their references even when the current topic changes.
  // Read metadata only; these records are not additional model reading evidence.
  const referenced = referencedMaterialIds.length
    ? await db.material.findMany({
        where: {
          ...w,
          archived: false,
          id: { in: referencedMaterialIds.slice(0, 5) },
        },
        select: {
          id: true,
          title: true,
          roleScope: true,
          tags: true,
          category: true,
          source: true,
          version: true,
        },
      })
    : [];
  const pendingMaterials = referenced
    .filter((m) => !materials.some((n) => n.id === m.id))
    .map((m) => ({ ...m, content: "", truncated: true }));
  const sources = [
    ...applications.map((a) => ({
      id: a.id,
      label: `投递：${a.company} · ${a.role} · ${a.batch}`,
    })),
    ...events.map((e) => ({ id: e.id, label: `日程：${e.title}` })),
    ...preparations.map((p) => ({
      id: p.id,
      label: `准备：${p.company} · ${p.role} · ${p.round}`,
    })),
    ...resumes.map((r) => ({
      id: r.id,
      label: `简历：${r.series} v${r.number}（仅元数据，未读正文）`,
    })),
    ...materials.map((m) => ({
      id: m.id,
      label: `资料：${m.title} · v${m.version}${m.truncated ? "（相关节选）" : "（正文）"}`,
    })),
    ...pendingMaterials.map((m) => ({
      id: m.id,
      label: `资料：${m.title} · v${m.version}（待确认方案引用，仅元数据）`,
    })),
    ...attachments.map((file) => ({
      id: file.id,
      label: `文件：${file.name}${file.truncated ? "（本次读取节选）" : ""}`,
    })),
  ];
  const slots = settings?.availabilityConfirmed
    ? suggestSlots(
        events,
        60,
        new Date(Date.now() + 7 * 86400000),
        settings.availability as { weekdays: number[]; weekends: number[] },
      )
    : [];
  const result = {
    applications,
    events,
    preparations,
    resumes,
    materials: [...materials, ...pendingMaterials],
    sources,
    model: {
      nowBeijing: new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      }),
      timezone: "Asia/Shanghai",
      scope:
        attachments.length > 0
          ? "当前账号；只读取本轮或当前对话明确附加的文件；其他简历仍仅有元数据；资料为自动检索的最多6篇正文或相关节选；仅限已导入当前账号的资料，不代表访问本机文件夹"
          : "当前账号；简历仅元数据，未读取正文；资料为自动检索的最多6篇正文或相关节选；仅限已导入当前账号的资料，不代表访问本机文件夹",
      attachments,
      applications: [
        ...matched,
        ...applications.filter((a) => !matched.includes(a)),
      ]
        .slice(0, 80)
        .map((a) => ({
          ...a,
          history: undefined,
          jd: matched.includes(a) ? a.jd.slice(0, 1800) : "",
          notes: matched.includes(a) ? a.notes.slice(0, 500) : "",
        })),
      events: events
        .filter(
          (e) =>
            e.status === "待完成" ||
            e.updatedAt.getTime() > Date.now() - 14 * 86400000,
        )
        .slice(0, 100),
      preparations: preparations
        .slice(0, 30)
        .map((p) => ({ ...p, jd: p.jd.slice(0, 1200) })),
      resumes: resumes.slice(0, 20),
      materials: [...materials],
      librarySearch: {
        matchedCount: materials.length,
        terms: keywords,
        scope:
          "当前账号未归档资料；优先相关的已整理条目（question/experience/knowledge），原始文档（document，或旧 Obsidian 导入）为补充。建议/点评不等于经历事实。关键词检索可能遗漏，请勿声称查阅全部笔记。待确认资料不等于已核实事实。",
      },
      availabilityConfirmed: settings?.availabilityConfirmed || false,
      availability: settings?.availability,
      oneHourSlots: slots,
      truncated:
        applications.length > 80 ||
        events.length > 100 ||
        preparations.length > 30 ||
        resumes.length > 20,
    },
  };
  // Bound actual model payload, not just the number of records.
  const lists = [
    result.model.materials,
    result.model.preparations,
    result.model.applications,
    result.model.events,
    result.model.resumes,
  ];
  while (JSON.stringify(result.model).length > 24000) {
    const list = [...lists]
      .sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)
      .find((a) => a.length > 1);
    if (!list) break;
    list.pop();
    result.model.truncated = true;
  }
  const included = new Set(result.model.materials.map((m) => m.id));
  const materialIds = new Set(materials.map((m) => m.id));
  result.sources = result.sources.flatMap((s) => {
    if (!materialIds.has(s.id) || included.has(s.id)) return [s];
    const reference = referenced.find((m) => m.id === s.id);
    return reference
      ? [
          {
            id: s.id,
            label: `资料：${reference.title} · v${reference.version}（待确认方案引用，仅元数据）`,
          },
        ]
      : [];
  });
  return result;
}
export type AssistantContext = Awaited<ReturnType<typeof assistantContext>>;
