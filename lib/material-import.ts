export const materialCategories = ["岗位特有", "通用问题", "待确认"] as const;
export const materialKinds = [
  "自我介绍",
  "求职动机",
  "岗位相关专业问题与知识点",
  "Case",
  "其他",
  "个性问题",
  "行为面试",
  "其他通用问题",
  "边界或分类待确认",
] as const;

export type MaterialCategory = (typeof materialCategories)[number];
export type MaterialKind = (typeof materialKinds)[number];

export type SourceSegment = {
  sourceIndex: number;
  roleScope: string;
  content: string;
};

export type MaterialClassification = {
  sourceIndex: number;
  roleScope: string;
  category: MaterialCategory;
  kind: MaterialKind;
  title: string;
  confidence: number;
};

export type ImportedMaterial = MaterialClassification & {
  content: string;
};

const kindsByCategory: Record<MaterialCategory, readonly MaterialKind[]> = {
  岗位特有: [
    "自我介绍",
    "求职动机",
    "岗位相关专业问题与知识点",
    "Case",
    "其他",
  ],
  通用问题: ["个性问题", "行为面试", "其他通用问题"],
  待确认: ["边界或分类待确认"],
};

export function materialKindsForCategory(category: string): readonly string[] {
  return (
    kindsByCategory[category as MaterialCategory] || kindsByCategory["待确认"]
  );
}

const roleHeading = (line: string) =>
  line.length <= 24 &&
  /[：:]$/.test(line) &&
  !/^[（(]/.test(line) &&
  !/^(?:\d+(?:秒|分钟)(?:版本?)?|详细版本.*)[：:]?$/.test(line) &&
  !/^(?:总述|已实现|痛点来源|目标用户|项目定位|核心功能|核心流程|核心解决)/.test(
    line,
  );

const sectionHeading = (line: string) =>
  line.length <= 60 &&
  (/^[（(][一二三四五六七八九十\d]+[)）]/.test(line) ||
    /^(?:\d+\s*[.、．]|[一二三四五六七八九十]+[、.．])[^。！？?]{0,45}$/.test(
      line,
    ) ||
    /^(?:\d+(?:分钟|秒)(?:版本?)?|详细版本.*)[：:]?$/.test(line));

const questionLine = (line: string) => {
  if (/^Q\d+\s*[:：]/i.test(line)) return true;
  if (/^(?:\d{1,3}\s*[.、．])/.test(line))
    return (
      /[？?]$/.test(line) ||
      /^(?:\d{1,3}\s*[.、．])(?:请|你|为什么|如何|谈谈|假设|如果|当)/.test(line)
    );
  if (line.length > 180) return false;
  return (
    /[？?]$/.test(line) ||
    /^(?:请|你为什么|为什么|如何|谈谈|假设|如果|当你|结合).{4,}/.test(line)
  );
};

export function splitInterviewMaterial(input: string): SourceSegment[] {
  const lines = input
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const result: Omit<SourceSegment, "sourceIndex">[] = [];
  let roleScope = "";
  let pending: string[] = [];
  let current: string[] = [];
  let currentIsQuestion = false;

  const flush = () => {
    const content = [...pending, ...current].join("\n\n").trim();
    if (content) result.push({ roleScope, content });
    pending = [];
    current = [];
    currentIsQuestion = false;
  };

  for (const line of lines) {
    if (roleHeading(line)) {
      flush();
      roleScope = line.replace(/[：:]$/, "").trim();
      pending = [line];
      continue;
    }
    if (questionLine(line)) {
      if (current.length) flush();
      current = [line];
      currentIsQuestion = true;
      continue;
    }
    if (sectionHeading(line)) {
      flush();
      pending = [line];
      continue;
    }
    current.push(line);
    if (!currentIsQuestion && current.join("\n\n").length >= 6000) flush();
  }
  flush();
  return result.map((segment, sourceIndex) => ({ sourceIndex, ...segment }));
}

export function importBatches(segments: SourceSegment[], maxChars = 5000) {
  const batches: SourceSegment[][] = [];
  let batch: SourceSegment[] = [];
  let chars = 0;
  for (const segment of segments) {
    if (
      batch.length &&
      (chars + segment.content.length > maxChars || batch.length >= 12)
    ) {
      batches.push(batch);
      batch = [];
      chars = 0;
    }
    batch.push(segment);
    chars += segment.content.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function fallback(segment: SourceSegment): ImportedMaterial {
  const first = segment.content.split("\n").find(Boolean) || "待确认资料";
  return {
    ...segment,
    category: "待确认",
    kind: "边界或分类待确认",
    title: first.slice(0, 80),
    confidence: 0,
  };
}

export function mergeClassifications(
  segments: SourceSegment[],
  classifications: MaterialClassification[],
) {
  const allowed = new Map<number, MaterialClassification>();
  const duplicates = new Set<number>();
  for (const item of classifications) {
    if (allowed.has(item.sourceIndex)) duplicates.add(item.sourceIndex);
    else allowed.set(item.sourceIndex, item);
  }
  const items = segments.map((segment) => {
    const classified = allowed.get(segment.sourceIndex);
    if (
      !classified ||
      duplicates.has(segment.sourceIndex) ||
      classified.confidence < 0.6 ||
      !kindsByCategory[classified.category].includes(classified.kind)
    )
      return fallback(segment);
    return {
      ...classified,
      roleScope:
        classified.category === "通用问题"
          ? ""
          : classified.roleScope.trim() || segment.roleScope,
      content: segment.content,
    };
  });
  const inputChars = segments.reduce(
    (sum, item) => sum + item.content.length,
    0,
  );
  const outputChars = items.reduce((sum, item) => sum + item.content.length, 0);
  return {
    items,
    coverage: {
      complete: inputChars === outputChars && items.length === segments.length,
      sourceCount: segments.length,
      classifiedCount: items.filter((item) => item.category !== "待确认")
        .length,
      pendingCount: items.filter((item) => item.category === "待确认").length,
      inputChars,
      outputChars,
    },
  };
}
