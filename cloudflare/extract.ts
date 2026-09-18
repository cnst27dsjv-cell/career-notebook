import AdmZip from "adm-zip";
import mammoth from "mammoth";
export async function extractDocument(buffer: Buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (
    entries.length > 2000 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 10 * 1024 * 1024
  )
    throw new Error("文档解压后过大，请拆分后导入");
  if (!zip.getEntry("word/document.xml"))
    throw new Error("不是有效的 DOCX 文档");
  const result = await mammoth.extractRawText({
    buffer,
    externalFileAccess: false,
  } as Parameters<typeof mammoth.extractRawText>[0]);
  if (!result.value.trim())
    throw new Error("未提取到文字，图片或扫描件请先转成文字");
  if (result.value.length > 100000)
    throw new Error("文档超过 100,000 字符，请拆分");
  return result.value;
}
