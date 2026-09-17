import { describe, expect, it } from "vitest";
import { isSubstantivePolish, polishSimilarity } from "../lib/polish";

describe("润色结果检查", () => {
  const original =
    "我选择聚宽投资，主要是两个原因。第一，聚宽是国内量化私募的头部机构，在策略、系统和合规运营方面都比较成熟。对于想做基金运营的人来说，在这样的平台能接触到比较规范的操作流程。第二，我之前在华泰资管和国君资管的实习，一直在做跟产品文档、合规材料、数据核验相关的工作。这些经验跟基金运营中对合规性、细致度的要求是比较匹配的。";

  it("拦截仅增加少量措辞的建议稿", () => {
    const minor = original.replace(
      "比较规范的操作流程。",
      "比较规范的操作流程，这对我积累专业经验很有帮助。",
    );
    expect(polishSimilarity(original, minor)).toBeGreaterThan(0.82);
    expect(isSubstantivePolish(original, minor)).toBe(false);
  });

  it("接受重新组织逻辑后的建议稿", () => {
    const revised =
      "我选择聚宽，核心是平台能力与个人经历都和基金运营岗位匹配。平台方面，聚宽在量化策略、系统建设和合规运营上较成熟，能让我系统接触规范的运营流程。个人方面，我在华泰资管和国君资管处理过产品文档、合规材料与数据核验，这些经历培养了基金运营需要的细致度和合规意识。";
    expect(isSubstantivePolish(original, revised)).toBe(true);
  });
});
