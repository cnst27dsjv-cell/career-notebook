import { db } from "@/lib/db";
import { createHash } from "node:crypto";
export async function GET(r: Request) {
  const token = new URL(r.url).searchParams.get("token");
  if (!token) return new Response("链接无效", { status: 400 });
  const result = await db.settings.updateMany({
    where: {
      verifyToken: createHash("sha256").update(token).digest("hex"),
      verifyExpires: { gt: new Date() },
    },
    data: { emailVerified: true, verifyToken: null, verifyExpires: null },
  });
  return new Response(
    result.count
      ? "邮箱验证成功，可以关闭本页并返回求职手账。"
      : "链接已失效，请重新发送验证邮件。",
    { headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
}
