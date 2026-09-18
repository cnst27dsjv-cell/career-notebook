import { describe, expect, it } from "vitest";
import { fileStorage, type FileBucket } from "../lib/storage";

describe("private object storage", () => {
  it("round trips and deletes file bytes through a bucket", async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket: FileBucket = {
      async put(key, data) {
        objects.set(key, data);
      },
      async get(key) {
        const data = objects.get(key);
        return data
          ? {
              async arrayBuffer() {
                return Uint8Array.from(data).buffer;
              },
            }
          : null;
      },
      async delete(key) {
        objects.delete(key);
      },
    };
    const storage = fileStorage(bucket);
    await storage.put("test.pdf", Buffer.from("%PDF-test"));
    expect((await storage.get("test.pdf")).toString()).toBe("%PDF-test");
    await storage.delete("test.pdf");
    await expect(storage.get("test.pdf")).rejects.toThrow("文件不存在");
  });
  it("rejects keys that could escape the local storage directory", async () => {
    await expect(fileStorage().get("../.env")).rejects.toThrow("文件标识无效");
  });
});
