import { expect, it } from "vitest";
import { applicationProgress } from "../lib/application-progress";
const base = {
  stage: "待投递",
  stageStatus: "待安排",
  outcome: "",
  appliedAt: null,
  history: [],
};
it("starts at pending without implying an application was submitted", () => {
  const p = applicationProgress(base);
  expect(p.steps[0]).toMatchObject({ current: true, state: "current" });
  expect(p.steps.slice(1).every((s) => s.state === "future")).toBe(true);
});
it("shows a completed assessment as the current stage while waiting for the next", () => {
  const p = applicationProgress({
    ...base,
    stage: "测评",
    stageStatus: "等待结果",
    appliedAt: "2026-10-17T18:00:00Z",
  });
  expect(p.steps[2]).toMatchObject({ current: true, state: "done" });
  expect(p.steps[1]).toMatchObject({ state: "done", date: "10/18" });
  expect(p.steps[3].state).toBe("future");
  expect(p.summary).toBe("测评 · 已完成 · 等待下一阶段");
});
it("does not invent completed assessments or exams for an interview entered directly", () => {
  const p = applicationProgress({
    ...base,
    stage: "面试",
    stageStatus: "待完成",
  });
  expect(p.steps[2].state).toBe("unrecorded");
  expect(p.steps[3].state).toBe("unrecorded");
  expect(p.steps[4]).toMatchObject({ current: true, state: "current" });
});
it("uses explicit history for completion and distinguishes a merely visited stage", () => {
  const p = applicationProgress({
    ...base,
    stage: "面试",
    history: [
      { at: "2026-10-01", from: "测评 · 等待结果", to: "笔试 · 待安排" },
      { at: "2026-10-02", from: "笔试 · 待安排", to: "面试 · 待安排" },
    ],
  });
  expect(p.steps[2].state).toBe("done");
  expect(p.steps[3].state).toBe("past");
  expect(p.steps[3].date).toBe("");
});
it("honors a current-stage correction instead of retaining a stale completed state", () => {
  const p = applicationProgress({
    ...base,
    stage: "测评",
    stageStatus: "待完成",
    history: [
      { at: "2026-10-01", from: "测评 · 等待结果", to: "面试 · 待安排" },
      { at: "2026-10-02", from: "面试 · 待安排", to: "测评 · 待完成" },
    ],
  });
  expect(p.steps[2].state).toBe("current");
  expect(p.steps[4].state).toBe("future");
});
it.each(["未通过", "主动撤回", "录用已接受", "录用已拒绝"])(
  "displays final result %s without continuing the timeline",
  (outcome) => {
    const p = applicationProgress({
      ...base,
      stage: outcome.startsWith("录用") ? "Offer" : "笔试",
      outcome,
    });
    expect(p.ended).toBe(true);
    expect(p.summary).toContain(outcome);
    if (outcome === "录用已接受") expect(p.steps[5].state).toBe("done");
  },
);
it("does not imply an offer has been accepted just because the stage is Offer", () => {
  const p = applicationProgress({
    ...base,
    stage: "Offer",
    stageStatus: "等待结果",
  });
  expect(p.ended).toBe(false);
  expect(p.steps[5].state).toBe("current");
  expect(p.summary).not.toContain("已接受");
});
