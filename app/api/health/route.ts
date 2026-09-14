import { db } from "@/lib/db";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ service: "career-notebook", status: "ok" });
  } catch {
    return Response.json(
      { service: "career-notebook", status: "unavailable" },
      { status: 503 },
    );
  }
}
