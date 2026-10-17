import { beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  prep: vi.fn(),
  materials: vi.fn(),
  resume: vi.fn(),
  file: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  generate: vi.fn(),
  search: vi.fn(),
}));
vi.mock("../lib/db", () => ({
  db: {
    preparation: { findFirst: f.prep },
    material: { findMany: f.materials },
    resume: { findFirst: f.resume },
    fileAsset: { findFirst: f.file },
    interview: { findFirst: f.find, create: f.create, updateMany: f.update },
  },
}));
vi.mock("../lib/model", () => ({ generate: f.generate }));
vi.mock("../lib/tavily", () => ({ searchTavily: f.search }));
vi.mock("../lib/assistant-files", () => ({ ensureExtractedFile: vi.fn() }));
import { handleInterview } from "../lib/interview-service";
let saved: any;
beforeEach(() => {
  vi.clearAllMocks();
  f.prep.mockResolvedValue({
    id: "p",
    company: "公司",
    role: "运营",
    round: "二面",
    jd: "私人JD",
    resumeId: null,
  });
  f.materials.mockResolvedValue([]);
  f.create.mockImplementation(
    async ({ data }) =>
      (saved = { id: "i", version: 1, turns: [], sources: [], ...data }),
  );
  f.find.mockImplementation(async ({ where }) =>
    where.userId === "u" ? saved : null,
  );
  f.update.mockImplementation(async ({ where, data }) => {
    if (where.version !== saved.version) return { count: 0 };
    saved = { ...saved, ...data, version: saved.version + 1 };
    return { count: 1 };
  });
  f.search.mockResolvedValue({
    searchedAt: "2026-10-12",
    sources: [
      {
        id: "web-1",
        label: "招聘",
        url: "https://example.com",
        snippet: "要求",
      },
    ],
  });
  f.generate.mockResolvedValue({
    questions: [{ question: "职责？", sourceIds: ["web-1"], basis: "摘要" }],
  });
});
it("research uses Tavily and retains sources if model generation fails", async () => {
  f.generate.mockRejectedValue(Error("模型不可用"));
  const result = await handleInterview("u", {
    action: "research",
    preparationId: "p",
  });
  expect(result.sources[0].description).toBe("要求");
  expect(result.state!.generationError).toContain("模型不可用");
  expect(saved.questions).toEqual([]);
  expect(f.search).toHaveBeenCalledWith("公司 运营 二面 招聘 面试 岗位要求");
});
it("search failure persists a recoverable session without pretending research succeeded", async () => {
  f.search.mockRejectedValue(Error("额度不足"));
  const r = await handleInterview("u", {
    action: "research",
    preparationId: "p",
  });
  expect(r.state!.researchError).toContain("额度不足");
  expect(r.sources).toEqual([]);
  expect(f.generate).not.toHaveBeenCalled();
});
it("explicit no-search generation uses selected library snapshots and no invented citations", async () => {
  f.materials.mockResolvedValue([
    { id: "m", title: "经历", content: "我的真实职责", version: 2 },
  ]);
  f.generate.mockResolvedValue({
    questions: [{ question: "解释职责", sourceIds: [], basis: "推测练习题" }],
  });
  const r = await handleInterview("u", {
    action: "research",
    preparationId: "p",
    search: false,
    materialIds: ["m"],
  });
  expect(r.state!.context!.materials[0].content).toBe("我的真实职责");
  expect(f.search).not.toHaveBeenCalled();
  expect(f.generate.mock.calls[0][1].context.round).toBe("二面");
});
it("rejects unowned selected materials before using a provider", async () => {
  await expect(
    handleInterview("u", {
      action: "research",
      preparationId: "p",
      materialIds: ["foreign"],
    }),
  ).rejects.toThrow("资料");
  expect(f.generate).not.toHaveBeenCalled();
});
it("rejects foreign sessions and stale writes", async () => {
  saved = {
    id: "i",
    userId: "u",
    version: 3,
    state: {},
    questions: [{}],
    turns: [],
    sources: [],
  };
  await expect(
    handleInterview("foreign", {
      action: "answer",
      id: "i",
      version: 3,
      index: 0,
      answer: "a",
    }),
  ).rejects.toThrow("会话");
  await expect(
    handleInterview("u", {
      action: "answer",
      id: "i",
      version: 2,
      index: 0,
      answer: "a",
    }),
  ).rejects.toThrow("更新");
});
it("editing an answer keeps history and invalidates a stale whole-session review", async () => {
  saved = {
    id: "i",
    userId: "u",
    version: 3,
    state: { review: "旧复盘", completedAt: "yesterday" },
    questions: [{}],
    turns: [{ answer: "原文", feedback: "旧反馈" }],
    sources: [],
  };
  const r = await handleInterview("u", {
    action: "answer",
    id: "i",
    version: 3,
    index: 0,
    answer: "新文",
  });
  expect(r.turns[0].history![0].answer).toBe("原文");
  expect(r.state!.review).toBeUndefined();
  expect(r.state!.reviewHistory![0].content).toBe("旧复盘");
});
it("a failed new generation never reattaches old questions to unrelated new sources", async () => {
  saved = {
    id: "i",
    userId: "u",
    version: 3,
    state: {
      started: false,
      context: {
        company: "公司",
        role: "运营",
        round: "一面",
        jd: "",
        materials: [],
      },
    },
    questions: [{ question: "旧问题", basis: "旧网页", sourceIds: ["web-1"] }],
    turns: [],
    sources: [{ id: "web-1", url: "https://old.example" }],
  };
  f.generate.mockRejectedValue(Error("模型不可用"));
  const r = await handleInterview("u", {
    action: "regenerate",
    id: "i",
    version: 3,
    search: true,
  });
  expect(r.sources[0].url).toBe("https://example.com");
  expect(r.questions).toEqual([]);
});
it("retrying generation after failed research keeps the previously saved research", async () => {
  saved = {
    id: "i",
    userId: "u",
    version: 3,
    state: {
      started: false,
      researchError: "搜索失败",
      context: {
        company: "公司",
        role: "运营",
        round: "一面",
        jd: "",
        materials: [],
      },
    },
    questions: [],
    turns: [],
    sources: [
      { id: "web-1", url: "https://old.example", description: "保留原摘要" },
    ],
  };
  const r = await handleInterview("u", {
    action: "regenerate",
    id: "i",
    version: 3,
    search: false,
  });
  expect(r.sources[0].description).toBe("保留原摘要");
  expect(r.questions[0].sourceIds).toEqual(["web-1"]);
});
it("interactive feedback uses the regular text model with personal context instead of the slow polish model",async()=>{
 saved={id:"i",userId:"u",version:1,state:{context:{company:"公司",role:"运营",round:"二面",jd:"",materials:[{id:"m",content:"真实职责"}]}},questions:[{question:"职责",sourceIds:[],basis:"推测"}],turns:[{answer:"核验材料"}],sources:[]};
 f.generate.mockResolvedValue({content:"建议稿",feedback:"补充依据"});
 const r=await handleInterview("u",{action:"feedback",id:"i",version:1,index:0});
 expect(r.turns[0].feedback).toBe("补充依据");expect(f.generate.mock.calls[0][1].context.materials[0].content).toBe("真实职责");expect(f.generate.mock.calls[0][2]).toBe("default");
});
