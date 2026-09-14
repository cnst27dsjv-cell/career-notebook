import { auth } from "./auth";
import { ZodError } from "zod";
export async function userFor(request: Request) {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (
      origin &&
      ![
        process.env.APP_URL,
        "http://localhost:3040",
        "http://127.0.0.1:3040",
      ].includes(origin)
    )
      throw new Error("不允许的请求来源");
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new Error("请先登录");
  return session.user;
}
export function failure(error: unknown) {
  const raw = error instanceof Error ? error.message : "操作失败，请重试";
  const message =
    error instanceof ZodError
      ? error.issues.map((i) => i.message).join("；")
      : /Invalid `|PrismaClient|Raw query failed/.test(raw)
        ? "数据保存失败，请刷新后重试"
        : raw;
  return Response.json(
    { error: message },
    { status: message === "请先登录" ? 401 : 400 },
  );
}
