import type { Material, Prisma } from "@prisma/client";
import { materialFormat } from "./library-organization";

// Reuse keeps reviewed fields and source snapshots; document drafts belong only to their original document.
export function materialCopyFields(source: Material, preparationId: string) {
  const format = materialFormat(source);
  return {
    preparationId,
    title: source.title,
    category: source.category,
    kind: source.kind,
    roleScope: source.roleScope,
    content: source.content,
    tags: source.tags,
    parentId: source.id,
    source: `复用 ${source.id} v${source.version}`,
    format,
    structure: (format === "document"
      ? {}
      : source.structure) as Prisma.InputJsonValue,
    revisions: [],
  };
}
