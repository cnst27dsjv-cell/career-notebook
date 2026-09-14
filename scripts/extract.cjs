const fs = require("node:fs");
const AdmZip = require("adm-zip");
const mammoth = require("mammoth");
(async () => {
  const buffer = fs.readFileSync(process.argv[2]);
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (
    entries.length > 2000 ||
    entries.reduce((n, e) => n + e.header.size, 0) > 50 * 1024 * 1024
  )
    throw Error("文档解压后过大，请拆分");
  if (!zip.getEntry("word/document.xml")) throw Error("不是有效的 DOCX 文档");
  const r = await mammoth.extractRawText(
    { buffer },
    { externalFileAccess: false },
  );
  if (!r.value.trim()) throw Error("未提取到文字，图片或扫描件请先转成文字");
  if (r.value.length > 100000) throw Error("文档超过 100,000 字符，请拆分");
  process.stdout.write(r.value);
})().catch((e) => {
  process.stderr.write(e.message);
  process.exit(1);
});
