import path from "node:path";
import { z } from "zod";

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

const recognitionText = (maximum: number) =>
  z.preprocess(
    (value) => (value == null ? "" : value),
    z.string().trim().max(maximum),
  );
const recognitionScore = z.preprocess(
  (value) => (typeof value === "string" ? Number(value) : value),
  z.number().min(0).max(1).default(0),
);
const recognitionResult = z.object({
  fields: z
    .object({
      company: recognitionText(200),
      role: recognitionText(200),
      city: recognitionText(100),
      batch: recognitionText(100),
      url: recognitionText(2000).refine(
        (value) => !value || /^https?:\/\//.test(value),
        "识别出的职位链接格式不正确",
      ),
      jd: recognitionText(100000),
    })
    .refine((value) => Object.values(value).some(Boolean)),
  confidence: z.preprocess(
    (value) =>
      value && typeof value === "object" && !Array.isArray(value) ? value : {},
    z.object({
      company: recognitionScore,
      role: recognitionScore,
      city: recognitionScore,
      batch: recognitionScore,
      url: recognitionScore,
      jd: recognitionScore,
    }),
  ),
  notes: z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(/\n+/)
            .map((note) => note.trim())
            .filter(Boolean)
        : (value ?? []),
    z.array(z.string().trim().min(1).max(500)).max(12),
  ),
});

export function parseApplicationImageRecognition(value: unknown) {
  const parsed = recognitionResult.safeParse(value);
  if (!parsed.success)
    throw Error("图片已识别，但 AI 返回的字段不完整，请重新识别");
  return parsed.data;
}
