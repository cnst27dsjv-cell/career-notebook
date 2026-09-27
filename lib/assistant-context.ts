import { db } from "./db";
import { suggestSlots } from "./rules";

export async function assistantContext(userId: string, input: string) {
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
  // Search the complete user's library before limiting; older relevant material remains eligible.
  const terms = [...new Set(input.match(/[\p{L}\p{N}]{2,20}/gu) || [])].slice(
    0,
    8,
  );
  const matched = applications.filter(
    (a) => input.includes(a.company) || input.includes(a.role),
  );
  const keywords = [...terms, ...matched.flatMap((a) => [a.company, a.role])];
  const materials = await db.material.findMany({
    where: {
      ...w,
      archived: false,
      ...(keywords.length
        ? {
            OR: keywords.flatMap((q) => [
              { title: { contains: q } },
              { content: { contains: q } },
              { roleScope: { contains: q } },
            ]),
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
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
      label: `资料：${m.title} · v${m.version}`,
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
    materials,
    sources,
    model: {
      nowBeijing: new Date().toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      }),
      timezone: "Asia/Shanghai",
      scope:
        "当前账号；简历仅元数据，未读取正文；资料为关键词命中的最多10条节选",
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
      materials: materials.map((m) => ({
        ...m,
        revisions: undefined,
        content: m.content.slice(0, 1800),
      })),
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
  return result;
}
export type AssistantContext = Awaited<ReturnType<typeof assistantContext>>;
