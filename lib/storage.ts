import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** The cloud entry supplies a private R2 bucket; local development uses disk. */
export interface FileBucket {
  put(key: string, data: Uint8Array): Promise<unknown>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
  delete(key: string): Promise<unknown>;
}

export function fileStorage(bucket?: FileBucket) {
  const location = (key: string) => {
    if (!/^[a-zA-Z0-9-]+\.(pdf|docx|txt|png|jpe?g|webp)$/.test(key))
      throw new Error("文件标识无效");
    return path.resolve("storage", key);
  };
  return {
    async put(key: string, data: Buffer) {
      const target = location(key);
      if (bucket) {
        await bucket.put(key, data);
        return;
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, data, { mode: 0o600 });
    },
    async get(key: string) {
      const target = location(key);
      if (!bucket) return readFile(target);
      const object = await bucket.get(key);
      if (!object) throw new Error("文件不存在");
      return Buffer.from(await object.arrayBuffer());
    },
    async delete(key: string) {
      const target = location(key);
      if (bucket) await bucket.delete(key);
      else await unlink(target);
    },
  };
}
