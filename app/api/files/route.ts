import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { createHash, randomUUID } from "node:crypto";
import { storage } from "@/lib/runtime-storage";
import { extractDocument } from "@/lib/extract";
import path from "node:path";

export async function POST(r: Request) {
  let saved = "";
  try {
    const user = await userFor(r);
    if (Number(r.headers.get("content-length")) > 11 * 1024 * 1024)
      throw Error("文件不能超过 10 MB");
    const form = await r.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw Error("请选择文件");
    if (file.size > 10 * 1024 * 1024) throw Error("文件不能超过 10 MB");
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();
    if (![".pdf", ".docx"].includes(ext))
      throw Error("支持 PDF 或 DOCX，旧版 DOC 请另存为 DOCX");
    if (ext === ".pdf" && buffer.subarray(0, 5).toString() !== "%PDF-")
      throw Error("PDF 文件格式无效");
    if (ext === ".docx" && buffer.subarray(0, 2).toString() !== "PK")
      throw Error("DOCX 文件格式无效");
    const key = randomUUID() + ext;
    if (form.get("mode") === "import") {
      if (ext !== ".docx") throw Error("面试资料导入支持 DOCX，或直接粘贴文字");
      return Response.json({ text: await extractDocument(buffer), name: file.name });
    }
    await storage().put(key, buffer);
    saved = key;
    const series = String(form.get("series") || "").trim();
    if (!series) throw Error("请填写简历系列名称");
    const hash = createHash("sha256").update(buffer).digest("hex");
    const duplicate = await db.fileAsset.findFirst({
      where: { userId: user.id, hash },
    });
    if (duplicate && form.get("allowDuplicate") !== "true")
      throw Error("已上传过相同文件；如需作为新版本，请勾选允许重复文件");
    const resume = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id + series}))::text`;
      const asset = await tx.fileAsset.create({
        data: {
          userId: user.id,
          name: file.name,
          mime:
            ext === ".pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: file.size,
          key,
          hash,
        },
      });
      const latest = await tx.resume.findFirst({
        where: { userId: user.id, series },
        orderBy: { number: "desc" },
      });
      await tx.resume.updateMany({
        where: { userId: user.id, series },
        data: { current: false },
      });
      return tx.resume.create({
        data: {
          userId: user.id,
          series,
          number: (latest?.number || 0) + 1,
          fileId: asset.id,
          current: true,
          target: String(form.get("target") || ""),
          notes: String(form.get("notes") || ""),
        },
      });
    });
    saved = "";
    return Response.json({ ok: true, id: resume.id });
  } catch (e) {
    if (saved) await storage().delete(saved).catch(() => {});
    return failure(e);
  }
}
