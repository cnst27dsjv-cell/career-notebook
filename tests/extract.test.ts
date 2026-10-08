import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { extractFileText } from "../lib/extract";

function docx(text: string) {
  const zip = new AdmZip();
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  );
  return zip.toBuffer();
}

function pdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length + 30} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

describe("assistant file extraction", () => {
  it("extracts and normalizes UTF-8 text", async () => {
    await expect(
      extractFileText(Buffer.from("经历一  \n\n\n经历二"), ".txt"),
    ).resolves.toBe("经历一\n\n经历二");
  });

  it("extracts DOCX text without a child process", async () => {
    await expect(
      extractFileText(docx("基金运营实习经历"), ".docx"),
    ).resolves.toBe("基金运营实习经历");
  });

  it("extracts the text layer from a PDF", async () => {
    await expect(
      extractFileText(pdf("Resume Experience"), ".pdf"),
    ).resolves.toContain("Resume Experience");
  });

  it("rejects files without readable text", async () => {
    await expect(extractFileText(Buffer.from("   \n"), ".txt")).rejects.toThrow(
      "未提取到文字",
    );
  });
});
