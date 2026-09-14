import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
process.env.SEEDING = "true";
const { auth } = await import("../lib/auth");
const { db } = await import("../lib/db");
const password =
  process.env.DEMO_PASSWORD || randomBytes(24).toString("base64url");
if (!process.env.DEMO_PASSWORD)
  await appendFile(
    ".env",
    `\nLOCAL_DEMO="true"\nDEMO_PASSWORD="${password}"\n`,
  );
let user = await db.user.findUnique({ where: { email: "demo@career.local" } });
if (!user) {
  const result = await auth.api.signUpEmail({
    body: { email: "demo@career.local", password, name: "求职中的你" },
  });
  user = await db.user.findUnique({ where: { id: result.user.id } });
}
if (!user) throw Error("无法建立示例账号");
const userId = user.id;
if (await db.application.count({ where: { userId } })) {
  console.log("示例数据已存在，未覆盖");
  await db.$disconnect();
  process.exit(0);
}
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const time = (offset: number, hour: number) =>
  new Date(
    new Date(`${day}T00:00:00+08:00`).getTime() +
      offset * 86400000 +
      hour * 3600000,
  );
const companies = [
  ["字节跳动", "产品经理", "上海", "面试"],
  ["小红书", "社区运营", "上海", "测评"],
  ["腾讯", "产品策划", "深圳", "笔试"],
  ["网易", "用户体验设计", "杭州", "已投递"],
  ["美团", "商业分析", "北京", "待投递"],
  ["蚂蚁集团", "产品经理", "杭州", "面试"],
];
const apps = [];
for (const [company, role, city, stage] of companies)
  apps.push(
    await db.application.create({
      data: {
        userId,
        company,
        role,
        city,
        stage,
        stageStatus: stage === "已投递" ? "等待结果" : "待完成",
        appliedAt: stage === "待投递" ? null : time(-7, 12),
        notes: "示例记录，可编辑或替换。",
        history: [{ at: time(-7, 12).toISOString(), from: "新建", to: stage }],
      },
    }),
  );
const events = [
  {
    title: "字节跳动 · 产品经理一面",
    kind: "面试",
    start: time(0, 10),
    end: time(0, 11),
    applicationId: apps[0].id,
    location: "线上会议",
    notes: "提前 15 分钟检查设备，准备好自我介绍。",
  },
  {
    title: "小红书 · 完成在线测评",
    kind: "测评",
    start: time(0, 14),
    end: time(0, 15),
    deadline: time(1, 18),
    applicationId: apps[1].id,
  },
  {
    title: "腾讯 · 笔试专项准备",
    kind: "准备",
    start: time(0, 19),
    end: time(0, 20),
    applicationId: apps[2].id,
  },
  {
    title: "腾讯 · 校园招聘笔试",
    kind: "笔试",
    deadline: time(2, 20),
    applicationId: apps[2].id,
  },
  {
    title: "网易 · 补充作品集",
    kind: "投递",
    deadline: time(3, 18),
    applicationId: apps[3].id,
  },
  {
    title: "美团 · 产品岗位网申",
    kind: "投递",
    deadline: time(-1, 18),
    applicationId: apps[4].id,
  },
  {
    title: "蚂蚁集团 · 完善面试材料",
    kind: "准备",
    deadline: time(-2, 18),
    applicationId: apps[5].id,
  },
];
for (const event of events)
  await db.event.create({
    data: {
      ...event,
      userId,
      notes: ("notes" in event ? event.notes : "") || "示例日程",
    },
  });
const prep = await db.preparation.create({
  data: {
    userId,
    company: "字节跳动",
    role: "产品经理",
    round: "一面",
    applicationId: apps[0].id,
    jd: "关注用户需求，参与产品设计、数据分析与跨团队协作。",
  },
});
await db.material.create({
  data: {
    userId,
    preparationId: prep.id,
    kind: "自我介绍",
    title: "一分钟自我介绍 · 产品方向",
    content:
      "面试官您好，很高兴有机会参加这次面试。\n\n我希望从用户需求出发，理解问题，再用清晰的产品方案推动解决。在接下来的交流中，我想结合自己的项目经历，介绍我如何发现问题、分析信息，以及与团队合作。\n\n【示例模板，请补充你的真实教育背景与项目经历】",
    tags: "产品经理 自我介绍",
    source: "示例模板",
  },
});
await db.material.create({
  data: {
    userId,
    kind: "项目经历",
    title: "如何介绍一个最有成就感的项目？",
    content:
      "我会按背景、目标、我的行动、结果和反思来组织回答。\n\n【请用真实经历补充：当时解决的是什么问题？你具体做了什么？结果如何验证？】",
    tags: "产品经理 项目复盘 行为问题",
    source: "示例模板",
  },
});
await db.settings.upsert({ where: { userId }, create: { userId }, update: {} });
console.log("示例账号和示例数据已创建");
await db.$disconnect();
