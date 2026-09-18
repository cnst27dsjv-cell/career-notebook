import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { storage } from "@/lib/runtime-storage";
export async function GET(
  r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userFor(r);
    const { id } = await params;
    const f = await db.fileAsset.findFirst({ where: { id, userId: user.id } });
    if (!f) return new Response("文件不存在", { status: 404 });
    const data = await storage().get(f.key);
    return new Response(data, {
      headers: {
        "Content-Type": f.mime,
        "Content-Disposition": `${f.mime === "application/pdf" && new URL(r.url).searchParams.get("preview") === "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
