import AdmZip from "adm-zip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const DOCUMENT_PARSER_VERSION = "2026-10-08";
const maximumTextLength = 100_000;

function normalize(text: string) {
  const value = text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!value) throw Error("未提取到文字，扫描件请改用截图识别或粘贴文字");
  if (value.length > maximumTextLength)
    throw Error("文档超过 100,000 字符，请拆分后上传");
  return value;
}

export async function extractDocument(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (
    entries.length > 2000 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 50 * 1024 * 1024
  )
    throw new Error("文档解压后过大，请拆分");
  if (!zip.getEntry("word/document.xml"))
    throw new Error("不是有效的 DOCX 文档");
  const result = await mammoth.extractRawText({
    buffer,
    externalFileAccess: false,
  } as Parameters<typeof mammoth.extractRawText>[0]);
  return normalize(result.value);
}

async function extractPdf(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() !== "%PDF-")
    throw Error("PDF 文件格式无效");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  if (pdf.numPages > 200) throw Error("PDF 超过 200 页，请拆分后上传");
  const result = await extractText(pdf, { mergePages: true });
  return normalize(String(result.text));
}

function extractPlainText(buffer: Buffer) {
  try {
    return normalize(new TextDecoder("utf-8", { fatal: true }).decode(buffer));
  } catch (error) {
    if (error instanceof TypeError) throw Error("TXT 文件必须使用 UTF-8 编码");
    throw error;
  }
}

export async function extractFileText(buffer: Buffer, extension: string) {
  if (extension === ".docx") return extractDocument(buffer);
  if (extension === ".pdf") return extractPdf(buffer);
  if (extension === ".txt") return extractPlainText(buffer);
  throw Error("支持 PDF、DOCX 或 TXT，旧版 DOC 请另存为 DOCX");
}
