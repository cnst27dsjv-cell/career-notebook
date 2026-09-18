import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
export async function extractDocument(buffer: Buffer) {
  const directory = await mkdtemp(path.join(tmpdir(), "career-docx-"));
  try {
    const file = path.join(directory, "input.docx");
    await writeFile(file, buffer, { mode: 0o600 });
    const result = await promisify(execFile)(
      process.execPath,
      ["--max-old-space-size=256", path.resolve("scripts/extract.cjs"), file],
      { timeout: 30000, maxBuffer: 1000000 },
    );
    return result.stdout;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
