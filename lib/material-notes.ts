import { db } from "./db";
import {
  noteInput,
  noteSource,
  noteTitle,
  planNoteImport,
} from "./markdown-library";
import type { Prisma } from "@prisma/client";
export async function importMaterialNote(userId: string, input: unknown) {
  const note = noteInput.parse(input);
  const source = noteSource(note.vault, note.path);
  return db.$transaction(async (tx) => {
    // Serialize imports by account and source, including first import without an existing row.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId + source}))::text`;
    const old = await tx.material.findFirst({ where: { userId, source } });
    const plan = planNoteImport(note, old);
    if (plan.mode === "unchanged") return { mode: plan.mode, id: old!.id };
    if (old) {
      const result = await tx.material.updateMany({
        where: { id: old.id, userId, version: note.version },
        data: {
          content: plan.content,
          format: "document",
          structure: {},
          version: { increment: 1 },
          revisions: [
            ...(old.revisions as Prisma.JsonArray),
            {
              content: old.content,
              at: new Date().toISOString(),
              source: "Obsidian 导入更新",
            },
          ],
        },
      });
      if (!result.count) throw Error("资料已更新，请重新核对后导入");
      return { mode: "update", id: old.id };
    }
    const created = await tx.material.create({
      data: {
        userId,
        title: noteTitle(note.path),
        content: plan.content,
        format: "document",
        source,
        category: "待确认",
        kind: "边界或分类待确认",
        tags: "Obsidian 面试记录",
      },
    });
    return { mode: "create", id: created.id };
  });
}
