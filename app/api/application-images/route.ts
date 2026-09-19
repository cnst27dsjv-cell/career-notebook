import { db } from "@/lib/db";
import { userFor, failure } from "@/lib/http";
import {
  APPLICATION_IMAGE_LIMIT,
  APPLICATION_IMAGES_TOTAL_SIZE,
  readApplicationImage,
} from "@/lib/application-images";
import { storage } from "@/lib/runtime-storage";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";

export async function POST(request: Request) {
  let savedKey = "";
  try {
    const user = await userFor(request);
    if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024)
      throw Error("图片不能超过 8 MB");
    const form = await request.formData();
    const applicationId = z.string().min(1).parse(form.get("applicationId"));
    const sortOrder = z.coerce
      .number()
      .int()
      .min(0)
      .max(99)
      .parse(form.get("sortOrder"));
    const clientId = z.string().min(1).max(100).parse(form.get("clientId"));
    const application = await db.application.findFirst({
      where: { id: applicationId, userId: user.id },
      select: { id: true },
    });
    if (!application) throw Error("投递记录不存在");
    const file = form.get("file");
    if (!(file instanceof File)) throw Error("请选择图片");
    const { buffer, extension, mime } = await readApplicationImage(file);
    const hash = createHash("sha256").update(buffer).digest("hex");
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${applicationId}))::text`;
      const duplicate = await tx.fileAsset.findFirst({
        where: {
          userId: user.id,
          applicationId,
          purpose: "application-image",
          hash,
        },
      });
      if (duplicate) return { asset: duplicate, duplicate: true };
      const existing = await tx.fileAsset.aggregate({
        where: {
          userId: user.id,
          applicationId,
          purpose: "application-image",
        },
        _count: true,
        _sum: { size: true },
      });
      if (existing._count >= APPLICATION_IMAGE_LIMIT)
        throw Error("一条投递最多保留 6 张招聘截图");
      if ((existing._sum.size || 0) + file.size > APPLICATION_IMAGES_TOTAL_SIZE)
        throw Error("招聘截图合计不能超过 24 MB");
      savedKey = randomUUID() + extension;
      await storage().put(savedKey, buffer);
      const asset = await tx.fileAsset.create({
        data: {
          userId: user.id,
          applicationId,
          purpose: "application-image",
          sortOrder,
          name: file.name,
          mime,
          size: file.size,
          key: savedKey,
          hash,
        },
      });
      return { asset, duplicate: false };
    });
    savedKey = "";
    return Response.json({
      ok: true,
      id: result.asset.id,
      clientId,
      duplicate: result.duplicate,
    });
  } catch (error) {
    if (savedKey)
      await storage()
        .delete(savedKey)
        .catch(() => {});
    return failure(error);
  }
}
