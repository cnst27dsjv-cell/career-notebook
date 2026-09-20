import path from "node:path";

export const APPLICATION_IMAGE_LIMIT = 6;
export const APPLICATION_IMAGE_SIZE = 8 * 1024 * 1024;
export const APPLICATION_IMAGES_TOTAL_SIZE = 24 * 1024 * 1024;
export const applicationImageTypes = ["image/png", "image/jpeg", "image/webp"];

const formats = {
  ".png": {
    mime: "image/png",
    valid: (data: Buffer) =>
      data.length >= 8 &&
      data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  ".jpg": {
    mime: "image/jpeg",
    valid: (data: Buffer) =>
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff,
  },
  ".jpeg": {
    mime: "image/jpeg",
    valid: (data: Buffer) =>
      data.length >= 3 &&
      data[0] === 0xff &&
      data[1] === 0xd8 &&
      data[2] === 0xff,
  },
  ".webp": {
    mime: "image/webp",
    valid: (data: Buffer) =>
      data.length >= 12 &&
      data.subarray(0, 4).toString() === "RIFF" &&
      data.subarray(8, 12).toString() === "WEBP",
  },
} as const;

export async function readApplicationImage(file: File) {
  if (!file.size) throw Error(`${file.name} 是空文件`);
  if (file.size > APPLICATION_IMAGE_SIZE)
    throw Error(`${file.name} 超过单张 8 MB 的限制`);
  const extension = path
    .extname(file.name)
    .toLowerCase() as keyof typeof formats;
  const format = formats[extension];
  if (!format || !applicationImageTypes.includes(file.type))
    throw Error(`${file.name} 仅支持 PNG、JPG、JPEG 或 WebP`);
  if (file.type !== format.mime)
    throw Error(`${file.name} 的扩展名与图片类型不一致`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!format.valid(buffer)) throw Error(`${file.name} 不是有效的图片文件`);
  return { buffer, extension, mime: format.mime };
}

export function validateApplicationImageBatch(files: File[]) {
  if (!files.length) throw Error("请先选择招聘截图");
  if (files.length > APPLICATION_IMAGE_LIMIT)
    throw Error("一次最多识别 6 张图片");
  if (
    files.reduce((sum, file) => sum + file.size, 0) >
    APPLICATION_IMAGES_TOTAL_SIZE
  )
    throw Error("图片合计不能超过 24 MB");
}

const recognitionFieldNames = [
  "company",
  "role",
  "city",
  "batch",
  "url",
  "jd",
] as const;
type RecognitionField = (typeof recognitionFieldNames)[number];

const asRecord = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function textFrom(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value))
    return value.map(textFrom).filter(Boolean).join("\n");
  const record = asRecord(value);
  return record
    ? Object.values(record).map(textFrom).filter(Boolean).join("\n")
    : "";
}

const firstText = (record: Record<string, unknown>, names: string[]) => {
  for (const name of names) {
    const text = textFrom(record[name]);
    if (text) return text;
  }
  return "";
};

const scoreFrom = (value: unknown) => {
  const raw =
    typeof value === "string"
      ? Number(value.trim().replace(/%$/, ""))
      : typeof value === "number"
        ? value
        : Number.NaN;
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(1, raw > 1 ? raw / 100 : raw);
};

function notesFrom(value: unknown): string[] {
  if (typeof value === "string") return value.split(/\n+/);
  if (Array.isArray(value)) return value.flatMap(notesFrom);
  const record = asRecord(value);
  return record ? Object.values(record).flatMap(notesFrom) : [];
}

export function parseApplicationImageText(value: unknown) {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const direct = [record.text, record.rawText, record.ocrText, record.content]
    .find((candidate) => typeof candidate === "string");
  const pages = Array.isArray(record.pages)
    ? record.pages
        .map((page) => {
          if (typeof page === "string") return page;
          if (!page || typeof page !== "object") return "";
          const item = page as Record<string, unknown>;
          return typeof item.text === "string"
            ? item.text
            : typeof item.content === "string"
              ? item.content
              : "";
        })
        .filter(Boolean)
        .join("\n\n")
    : "";
  const text = String(direct || pages).trim();
  if (!text) throw Error("图片中没有识别出可用文字，请检查清晰度后重试");
  if (text.length > 100000)
    throw Error("识别出的文字过长，请减少图片数量后重试");
  return text;
}

export function parseApplicationImageRecognition(value: unknown) {
  const root = asRecord(value) || {};
  const result =
    asRecord(root.result) || asRecord(root.data) || asRecord(root.output) || root;
  const source =
    asRecord(result.fields) ||
    asRecord(result.application) ||
    asRecord(result.job) ||
    result;
  const fields: Record<RecognitionField, string> = {
    company: firstText(source, ["company", "companyName", "employer", "公司"])
      .slice(0, 200),
    role: firstText(source, ["role", "position", "jobTitle", "岗位"]).slice(
      0,
      200,
    ),
    city: firstText(source, [
      "city",
      "location",
      "workLocation",
      "城市",
      "工作地点",
    ]).slice(0, 100),
    batch: firstText(source, [
      "batch",
      "recruitmentBatch",
      "hiringBatch",
      "招聘批次",
    ]).slice(0, 100),
    url: firstText(source, ["url", "jobUrl", "link", "职位链接"]).slice(
      0,
      2000,
    ),
    jd: firstText(source, [
      "jd",
      "jobDescription",
      "description",
      "岗位描述",
    ]).slice(0, 100000),
  };
  const notes = notesFrom(result.notes ?? root.notes)
    .map((note) => note.trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 12);
  if (fields.url && !/^https?:\/\//.test(fields.url)) {
    fields.url = "";
    notes.unshift("图片中的职位链接格式不完整，未自动填写");
  }
  if (!Object.values(fields).some(Boolean))
    throw Error("图片已识别，但 AI 返回的字段不完整，请重新识别");
  const confidenceValue = result.confidence ?? root.confidence;
  const confidenceRecord = asRecord(confidenceValue);
  const confidence = Object.fromEntries(
    recognitionFieldNames.map((name) => [
      name,
      scoreFrom(confidenceRecord ? confidenceRecord[name] : confidenceValue),
    ]),
  ) as Record<RecognitionField, number>;
  return { fields, confidence, notes: notes.slice(0, 12) };
}

export function applicationImageTextFallback(text: string) {
  return {
    fields: {
      company: "",
      role: "",
      city: "",
      batch: "",
      url: "",
      jd: text.trim().slice(0, 100000),
    },
    confidence: {
      company: 0,
      role: 0,
      city: 0,
      batch: 0,
      url: 0,
      jd: 0.5,
    },
    notes: ["已提取图片全文，但岗位字段需要人工确认"],
  };
}
