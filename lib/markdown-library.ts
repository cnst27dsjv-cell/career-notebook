import { z } from "zod";
export const noteInput = z.object({
  vault: z.string().trim().min(1).max(100),
  path: z.string().min(1).max(500),
  content: z.string().min(1).max(100000),
  version: z.number().int().positive().optional(),
});
export function noteSource(vault: string, path: string) {
  if (
    !vault.trim() ||
    !path.toLowerCase().endsWith(".md") ||
    path.includes("\\") ||
    path.split("/").some((p) => !p || p.startsWith("."))
  )
    throw Error("请选择笔记文件夹内的 Markdown 文件");
  return `Obsidian:${encodeURIComponent(vault)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
export function noteTitle(path: string) {
  return path.split("/").pop()!.replace(/\.md$/i, "").slice(0, 200);
}
// Display only: the encoded source remains the stable import identifier.
export function displayNoteSource(source: string) {
  if (!source.startsWith("Obsidian:")) return source;
  return source
    .split("/")
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join("/");
}
export function planNoteImport(
  input: unknown,
  old: {
    id: string;
    content: string;
    version: number;
    archived: boolean;
  } | null,
) {
  const note = noteInput.parse(input);
  const source = noteSource(note.vault, note.path);
  if (old?.archived)
    throw Error("此笔记已在资料库归档，请先恢复或另存为新笔记");
  if (old?.content === note.content)
    return { mode: "unchanged" as const, content: note.content, source };
  if (old && note.version !== old.version)
    throw Error("笔记已更新，请重新核对网站原文后再导入");
  return {
    mode: old ? ("update" as const) : ("create" as const),
    content: note.content,
    source,
  };
}
