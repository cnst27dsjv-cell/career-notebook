// The browser grants access to a user-selected directory, never a server filesystem path.
export type LocalFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  requestPermission(options: { mode: "readwrite" }): Promise<string>;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
    abort?(): Promise<void>;
  }>;
};
export type LocalDirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
};
export type LocalNote = { path: string; handle?: LocalFileHandle; file?: File };
export async function readLocalNotes(
  root: LocalDirectoryHandle,
): Promise<LocalNote[]> {
  const notes: LocalNote[] = [];
  let visited = 0;
  async function walk(
    dir: LocalDirectoryHandle,
    prefix: string,
    depth: number,
  ) {
    if (depth > 15) throw Error("文件夹层级过深，请选择更具体的面试笔记文件夹");
    for await (const entry of dir.values()) {
      if (++visited > 5000) throw Error("文件夹过大，请选择面试笔记子文件夹");
      if (entry.name.startsWith(".")) continue;
      const path = prefix + entry.name;
      if (entry.kind === "directory") await walk(entry, path + "/", depth + 1);
      else if (/\.md$/i.test(entry.name)) {
        notes.push({ path, handle: entry });
        if (notes.length > 500)
          throw Error("超过500篇笔记，请选择更具体的子文件夹");
      }
    }
  }
  await walk(root, "", 0);
  return notes.sort((a, b) => a.path.localeCompare(b.path));
}
export async function readLocalNote(note: LocalNote) {
  const file = note.handle ? await note.handle.getFile() : note.file!;
  if (file.size > 400000) throw Error(`${note.path} 超过400KB，请先拆分笔记`);
  const content = await file.text();
  if (content.length > 100000)
    throw Error(`${note.path} 超过10万字，请先拆分笔记`);
  return content;
}
export async function writeLocalNote(
  handle: LocalFileHandle,
  original: string,
  content: string,
) {
  if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted")
    throw Error("未获得写入权限，原笔记未改动");
  if ((await (await handle.getFile()).text()) !== original)
    throw Error("本地笔记已修改，请重新预览后再写回，避免覆盖新内容");
  const writer = await handle.createWritable();
  try {
    await writer.write(content);
    await writer.close();
  } catch (e) {
    await writer.abort?.();
    throw e;
  }
}
