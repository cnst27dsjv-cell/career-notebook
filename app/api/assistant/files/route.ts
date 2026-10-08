import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { db } from "@/lib/db";
import { failure, userFor } from "@/lib/http";
import { ensureExtractedFile, fileSummary } from "@/lib/assistant-files";
import { storage } from "@/lib/runtime-storage";
import { extractFileText, DOCUMENT_PARSER_VERSION } from "@/lib/extract";

const maximumSize = 10 * 1024 * 1024;
const supported = new Set([".pdf", ".docx", ".txt"]);

const mimeFor = (extension: string) =>
  extension === ".pdf"
    ? "application/pdf"
    : extension === ".docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "text/plain";

export async function GET(request: Request) {
  try {
    const user = await userFor(request);
    const resumes = await db.resume.findMany({
      where: { userId: user.id, archived: false },
      orderBy: [{ current: "desc" }, { createdAt: "desc" }],
    });
    const resumeIds = resumes.map((resume) => resume.fileId);
    const files = await db.fileAsset.findMany({
      where: {
        userId: user.id,
        OR: [
          { id: { in: resumeIds } },
          { purpose: "assistant-document", reusable: true },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    const byId = new Map(files.map((file) => [file.id, file]));
    return Response.json({
      resumes: resumes.flatMap((resume) => {
        const file = byId.get(resume.fileId);
        return file
          ? [
              {
                ...fileSummary(file),
                series: resume.series,
                number: resume.number,
                current: resume.current,
                target: resume.target,
              },
            ]
          : [];
      }),
      files: files
        .filter(
          (file) => file.purpose === "assistant-document" && file.reusable,
        )
        .map(fileSummary),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  let savedKey = "";
  try {
    const user = await userFor(request);
    if (request.headers.get("content-type")?.includes("application/json")) {
      const raw = await request.json();
      const fileId = String(raw.fileId || "");
      const file = await db.fileAsset.findFirst({
        where: {
          id: fileId,
          userId: user.id,
          purpose: { in: ["resume", "assistant-document"] },
        },
      });
      if (!file) throw Error("文件不存在");
      const ready = await ensureExtractedFile(file);
      return Response.json(fileSummary(ready));
    }

    if (Number(request.headers.get("content-length")) > 11 * 1024 * 1024)
      throw Error("文件不能超过 10 MB");
    const form = await request.formData();
    const upload = form.get("file");
    if (!(upload instanceof File) || !upload.size) throw Error("请选择文件");
    if (upload.size > maximumSize) throw Error("文件不能超过 10 MB");
    const extension = path.extname(upload.name).toLowerCase();
    if (!supported.has(extension))
      throw Error("支持 PDF、DOCX 或 TXT，旧版 DOC 请另存为 DOCX");
    const buffer = Buffer.from(await upload.arrayBuffer());
    if (extension === ".docx" && buffer.subarray(0, 2).toString() !== "PK")
      throw Error("DOCX 文件格式无效");
    const extractedText = await extractFileText(buffer, extension);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const reusable = form.get("reusable") === "true";
    const duplicate = await db.fileAsset.findFirst({
      where: {
        userId: user.id,
        hash,
        purpose: { in: ["resume", "assistant-document"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (duplicate) {
      const ready = await db.fileAsset.update({
        where: { id: duplicate.id },
        data: {
          reusable: reusable || duplicate.reusable,
          extractedText,
          extractionStatus: "ready",
          extractionError: "",
          parserVersion: DOCUMENT_PARSER_VERSION,
          extractedAt: new Date(),
        },
      });
      return Response.json(fileSummary(ready));
    }
    const key = randomUUID() + extension;
    await storage().put(key, buffer);
    savedKey = key;
    const created = await db.fileAsset.create({
      data: {
        userId: user.id,
        purpose: "assistant-document",
        name: upload.name,
        mime: mimeFor(extension),
        size: upload.size,
        key,
        hash,
        extractedText,
        extractionStatus: "ready",
        parserVersion: DOCUMENT_PARSER_VERSION,
        extractedAt: new Date(),
        reusable,
      },
    });
    savedKey = "";
    return Response.json(fileSummary(created));
  } catch (error) {
    if (savedKey)
      await storage()
        .delete(savedKey)
        .catch(() => {});
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await userFor(request);
    const id = new URL(request.url).searchParams.get("id") || "";
    const file = await db.fileAsset.findFirst({
      where: { id, userId: user.id, purpose: "assistant-document" },
    });
    if (!file) throw Error("文件不存在");
    const messages = await db.assistantMessage.findMany({
      where: { userId: user.id },
      select: { attachments: true },
    });
    const referenced = messages.some(
      (message) =>
        Array.isArray(message.attachments) &&
        message.attachments.some(
          (attachment) =>
            typeof attachment === "object" &&
            attachment !== null &&
            "id" in attachment &&
            attachment.id === id,
        ),
    );
    if (referenced) throw Error("文件已被对话引用，暂时不能删除");
    await db.fileAsset.delete({ where: { id } });
    await storage()
      .delete(file.key)
      .catch(() => {});
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
