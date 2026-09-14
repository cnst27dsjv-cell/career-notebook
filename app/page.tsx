import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Workspace from "@/components/workspace";
export default async function Page() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return <Workspace demo={session.user.email === "demo@career.local"} />;
}
