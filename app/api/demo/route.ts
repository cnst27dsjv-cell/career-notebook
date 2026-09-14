import { auth } from "@/lib/auth";
export async function POST(r: Request) {
  if (process.env.LOCAL_DEMO !== "true" || !process.env.DEMO_PASSWORD)
    return Response.json({ error: "演示入口未开放" }, { status: 403 });
  const origin = r.headers.get("origin");
  if (
    origin &&
    !["http://localhost:3040", "http://127.0.0.1:3040"].includes(origin)
  )
    return new Response(null, { status: 403 });
  return auth.api.signInEmail({
    body: { email: "demo@career.local", password: process.env.DEMO_PASSWORD },
    asResponse: true,
  });
}
