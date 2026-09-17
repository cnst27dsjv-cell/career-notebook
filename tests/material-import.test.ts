import { describe, expect, it } from "vitest";
import {
  importBatches,
  materialKindsForCategory,
  mergeClassifications,
  splitInterviewMaterial,
} from "../lib/material-import";

describe("面试资料导入", () => {
  const source = `私募基金运营：

面试官您好，我目前就读于某大学。

我有两段与基金运营相关的实习。

（一）个人认知与求职动机

1.为什么选择基金运营岗位？

我看重这份工作的准确性与协作要求。

2.请描述一次你处理工作失误的经历。

我先核对影响范围，再同步负责人并修正。

（二）岗位知识

净值核算需要保证数据准确、及时。`;

  it("保留岗位标题并将每道问题和回答放在同一片段", () => {
    const segments = splitInterviewMaterial(source);
    expect(segments.map((item) => item.content)).toEqual([
      "私募基金运营：\n\n面试官您好，我目前就读于某大学。\n\n我有两段与基金运营相关的实习。",
      "（一）个人认知与求职动机\n\n1.为什么选择基金运营岗位？\n\n我看重这份工作的准确性与协作要求。",
      "2.请描述一次你处理工作失误的经历。\n\n我先核对影响范围，再同步负责人并修正。",
      "（二）岗位知识\n\n净值核算需要保证数据准确、及时。",
    ]);
    expect(segments.every((item) => item.roleScope === "私募基金运营")).toBe(
      true,
    );
  });

  it("按字符数和片段数分批且不改变顺序", () => {
    const segments = splitInterviewMaterial(source);
    const batches = importBatches(segments, 65);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat().map((item) => item.sourceIndex)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("模型漏号、重复号和低置信度时保留原文并标为待确认", () => {
    const segments = splitInterviewMaterial(source);
    const result = mergeClassifications(segments, [
      {
        sourceIndex: 0,
        roleScope: "私募基金运营",
        category: "岗位特有",
        kind: "自我介绍",
        title: "基金运营自我介绍",
        confidence: 0.9,
      },
      {
        sourceIndex: 1,
        roleScope: "",
        category: "通用问题",
        kind: "个性问题",
        title: "求职动机",
        confidence: 0.5,
      },
      {
        sourceIndex: 2,
        roleScope: "",
        category: "通用问题",
        kind: "行为面试",
        title: "处理失误",
        confidence: 0.9,
      },
      {
        sourceIndex: 2,
        roleScope: "",
        category: "通用问题",
        kind: "行为面试",
        title: "重复项",
        confidence: 0.9,
      },
    ]);

    expect(result.coverage.complete).toBe(true);
    expect(result.coverage.pendingCount).toBe(3);
    expect(result.items.map((item) => item.content)).toEqual(
      segments.map((item) => item.content),
    );
  });

  it("一级与二级类目冲突时进入待确认", () => {
    const [segment] = splitInterviewMaterial(source);
    const result = mergeClassifications(
      [segment],
      [
        {
          sourceIndex: 0,
          roleScope: "私募基金运营",
          category: "通用问题",
          kind: "岗位相关专业问题与知识点",
          title: "冲突分类",
          confidence: 0.9,
        },
      ],
    );
    expect(result.items[0].category).toBe("待确认");
    expect(result.items[0].content).toBe(segment.content);
  });

  it("岗位特有包含其他，且不混入通用问题类目", () => {
    expect(materialKindsForCategory("岗位特有")).toContain("其他");
    expect(materialKindsForCategory("通用问题")).not.toContain("其他");
    expect(materialKindsForCategory("通用问题")).toContain("其他通用问题");
  });

  it("通用问题不保留岗位范围，求职动机允许归入岗位特有", () => {
    const segments = splitInterviewMaterial(source).slice(0, 2);
    const result = mergeClassifications(segments, [
      {
        sourceIndex: 0,
        roleScope: "私募基金运营",
        category: "岗位特有",
        kind: "求职动机",
        title: "选择基金运营的原因",
        confidence: 0.9,
      },
      {
        sourceIndex: 1,
        roleScope: "私募基金运营",
        category: "通用问题",
        kind: "个性问题",
        title: "个人特点",
        confidence: 0.9,
      },
    ]);
    expect(result.items[0].roleScope).toBe("私募基金运营");
    expect(result.items[1].roleScope).toBe("");
  });
});
