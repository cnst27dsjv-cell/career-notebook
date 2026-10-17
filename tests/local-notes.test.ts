import { expect, it, vi } from "vitest";
import { writeLocalNote, readLocalNotes } from "../lib/local-notes";
it("does not overwrite a local note edited since preview", async () => {
  const writer = { write: vi.fn(), close: vi.fn() };
  const handle = {
    name: "a.md",
    kind: "file",
    getFile: async () => new File(["external edit"], "a.md"),
    requestPermission: async () => "granted",
    createWritable: async () => writer,
  } as any;
  await expect(writeLocalNote(handle, "original", "new")).rejects.toThrow(
    "已修改",
  );
  expect(writer.write).not.toHaveBeenCalled();
});
it("writes reviewed content only after permission and matching current contents", async () => {
  let saved = "original";
  const handle = {
    name: "a.md",
    kind: "file",
    getFile: async () => new File([saved], "a.md"),
    requestPermission: async () => "granted",
    createWritable: async () => ({
      write: async (v: string) => {
        saved = v;
      },
      close: async () => {},
    }),
  } as any;
  await writeLocalNote(handle, "original", "new");
  expect(saved).toBe("new");
});
it("lists Markdown files without reading unrelated contents or hidden configuration", async () => {
  const file = { kind: "file", name: "a.md", getFile: vi.fn() };
  const root = {
    name: "库",
    kind: "directory",
    async *values() {
      yield file;
      yield { kind: "file", name: "photo.png" };
      yield {
        kind: "directory",
        name: ".obsidian",
        values: () => {
          throw Error("must not read");
        },
      };
    },
  } as any;
  const files = await readLocalNotes(root);
  expect(files.map((f) => f.path)).toEqual(["a.md"]);
  expect(file.getFile).not.toHaveBeenCalled();
});
