import { describe, it, expect } from "vitest";
import {
  allReminderTimes,
  reminderTimes,
  overlaps,
  suggestSlots,
  filterApplications,
} from "../lib/rules";
import {
  applicationStageForEventKind,
  automaticApplicationStageStatus,
  completedApplicationStageForEventKind,
  eventKindForApplicationStage,
} from "../lib/application-stage";
describe("日程与提醒规则", () => {
  it("合并相同提醒且跳过已过期时间", () => {
    const now = new Date("2026-09-14T00:00:00Z");
    const start = new Date("2026-09-15T00:00:00Z");
    expect(
      reminderTimes(start, start, [24, 2, 0.5], now).map((x) =>
        x.toISOString(),
      ),
    ).toEqual(["2026-09-14T22:00:00.000Z", "2026-09-14T23:30:00.000Z"]);
  });
  it("相邻端点不冲突，相交则冲突", () => {
    const d = (h: number) => new Date(2026, 8, 14, h);
    expect(overlaps(d(9), d(10), d(10), d(11))).toBe(false);
    expect(overlaps(d(9), d(11), d(10), d(12))).toBe(true);
  });
  it("推荐时段避开已有事件与缓冲且不超过截止", () => {
    const result = suggestSlots(
      [
        {
          start: new Date("2026-09-14T19:00:00+08:00"),
          end: new Date("2026-09-14T20:00:00+08:00"),
          status: "待完成",
        },
      ],
      60,
      new Date("2026-09-14T22:00:00+08:00"),
      { weekdays: [19, 22], weekends: [9, 18] },
      new Date("2026-09-14T18:00:00+08:00"),
    );
    expect(result).toEqual([
      "2026-09-14T12:30:00.000Z",
      "2026-09-14T13:00:00.000Z",
    ]);
  });
  it("无合适时段返回空列表", () =>
    expect(
      suggestSlots(
        [],
        90,
        new Date("2026-09-14T19:30:00+08:00"),
        { weekdays: [19, 22], weekends: [9, 18] },
        new Date("2026-09-14T18:00:00+08:00"),
      ),
    ).toEqual([]));
});
describe("多字段筛选", () => {
  const rows = [
    { company: "甲", role: "产品", city: "上海", stage: "面试" },
    { company: "乙", role: "产品", city: "杭州", stage: "面试" },
    { company: "丙", role: "设计", city: "杭州", stage: "已投递" },
    { company: "丁", role: "产品", city: "", stage: "已投递" },
  ];
  it("同字段 OR，跨字段 AND，关键词同时生效", () => {
    expect(
      filterApplications(
        rows,
        { city: ["上海", "杭州"], stage: ["面试"] },
        "产品",
      ),
    ).toHaveLength(2);
    expect(
      filterApplications(
        rows,
        { city: ["上海", "杭州"], stage: ["面试"] },
        "甲",
      ),
    ).toHaveLength(1);
  });
  it("支持未填写、清空和零结果", () => {
    expect(filterApplications(rows, { city: ["未填写"] }, "")[0].company).toBe(
      "丁",
    );
    expect(filterApplications(rows, {}, "")).toHaveLength(4);
    expect(filterApplications(rows, { city: ["深圳"] }, "")).toEqual([]);
  });
});

it("相对与指定时间提醒合并并保留未来时刻", () => {
  const now = new Date("2026-09-14T00:00:00Z");
  expect(
    allReminderTimes(
      new Date("2026-09-15T00:00:00Z"),
      null,
      [2],
      [new Date("2026-09-14T22:00:00Z"), new Date("2026-09-14T23:00:00Z")],
      now,
    ),
  ).toHaveLength(2);
});

describe("投递阶段与日程联动", () => {
  it("映射可安排阶段与日程类型", () => {
    expect(eventKindForApplicationStage("待投递")).toBe("投递");
    expect(eventKindForApplicationStage("面试")).toBe("面试");
    expect(eventKindForApplicationStage("已投递")).toBeNull();
    expect(applicationStageForEventKind("投递")).toBe("待投递");
    expect(completedApplicationStageForEventKind("投递")).toBe("已投递");
  });

  it("根据日程自动计算阶段状态", () => {
    expect(automaticApplicationStageStatus("测评")).toBe("待安排");
    expect(
      automaticApplicationStageStatus("测评", { hasPendingEvent: true }),
    ).toBe("待完成");
    expect(
      automaticApplicationStageStatus("面试", { keepWaiting: true }),
    ).toBe("等待结果");
    expect(automaticApplicationStageStatus("已投递")).toBe("等待结果");
    expect(automaticApplicationStageStatus("Offer")).toBe("等待结果");
  });
});
