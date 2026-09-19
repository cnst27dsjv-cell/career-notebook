import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import { storage } from "@/lib/runtime-storage";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await userFor(request);
    const { id } = await params;
    const asset = await db.fileAsset.findFirst({
      where: { id, userId: user.id, purpose: "application-image" },
    });
    if (!asset) throw Error("图片不存在");
    await storage().delete(asset.key);
    await db.fileAsset.delete({ where: { id: asset.id } });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
