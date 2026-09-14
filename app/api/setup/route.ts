import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "@/lib/db";
import { failure } from "@/lib/http";
import { z } from "zod";
export async function POST(r: Request) {
  try {
    if (process.env.LOCAL_DEMO !== "true")
      return new Response(null, { status: 403 });
    if (
      !["http://localhost:3040", "http://127.0.0.1:3040"].includes(
        r.headers.get("origin") || "",
      )
    )
      return new Response(null, { status: 403 });
    const body = z
      .object({
        name: z.string().trim().min(1).max(40),
        email: z
          .email()
          .refine((e) => !e.endsWith("@career.local"), "请填写自己的邮箱"),
        password: z.string().min(10).max(128),
      })
      .parse(await r.json());
    const setupAuth = betterAuth({
      database: prismaAdapter(db, { provider: "postgresql" }),
      baseURL: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
      emailAndPassword: { enabled: true },
      trustedOrigins: ["http://localhost:3040", "http://127.0.0.1:3040"],
    });
    return await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('career-initial-account'))::text`;
        if (
          await tx.user.count({
            where: { email: { not: "demo@career.local" } },
          })
        )
          throw Error("已存在个人账号，请使用登录入口");
        return setupAuth.api.signUpEmail({
          body,
          headers: r.headers,
          asResponse: true,
        });
      },
      { timeout: 15000 },
    );
  } catch (e) {
    return failure(e);
  }
}
