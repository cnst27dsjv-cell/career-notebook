import path from "node:path";
import type { FileAsset } from "@prisma/client";
import { db } from "./db";
import { DOCUMENT_PARSER_VERSION, extractFileText } from "./extract";
import { storage } from "./runtime-storage";

export type AssistantFileSummary = Pick<
  FileAsset,
  | "id"
  | "name"
  | "mime"
  | "size"
  | "purpose"
  | "reusable"
  | "extractionStatus"
  | "extractionError"
>;

export function fileSummary(file: AssistantFileSummary) {
  return {
    id: file.id,
    name: file.name,
    mime: file.mime,
    size: file.size,
    purpose: file.purpose,
    reusable: file.reusable,
    extractionStatus: file.extractionStatus,
    extractionError: file.extractionError,
  };
}

export async function ensureExtractedFile(file: FileAsset) {
  if (
    file.extractionStatus === "ready" &&
    file.parserVersion === DOCUMENT_PARSER_VERSION &&
    file.extractedText
  )
    return file;
  try {
    const buffer = await storage().get(file.key);
    const extractedText = await extractFileText(
      Buffer.from(buffer),
      path.extname(file.name).toLowerCase(),
    );
    return await db.fileAsset.update({
      where: { id: file.id },
      data: {
        extractedText,
        extractionStatus: "ready",
        extractionError: "",
        parserVersion: DOCUMENT_PARSER_VERSION,
        extractedAt: new Date(),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "文件解析失败，请重新上传";
    await db.fileAsset.update({
      where: { id: file.id },
      data: {
        extractedText: "",
        extractionStatus: "failed",
        extractionError: message.slice(0, 300),
        parserVersion: DOCUMENT_PARSER_VERSION,
        extractedAt: new Date(),
      },
    });
    throw Error(message);
  }
}

export function attachmentExcerpt(text: string, input: string, limit = 8000) {
  if (text.length <= limit) return { text, truncated: false };
  const terms = [...new Set(input.match(/[\p{L}\p{N}]{2,20}/gu) || [])].slice(
    0,
    8,
  );
  const positions = terms
    .map((term) => text.indexOf(term))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);
  const center = positions[0] ?? 0;
  const start = Math.max(0, Math.min(center - 1000, text.length - limit));
  return {
    text: `${start ? "…\n" : ""}${text.slice(start, start + limit)}${start + limit < text.length ? "\n…" : ""}`,
    truncated: true,
  };
}
