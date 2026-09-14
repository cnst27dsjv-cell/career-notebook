export const dynamic = "force-dynamic";
import Login from "@/components/login";
export default function Page() {
  return <Login demo={process.env.LOCAL_DEMO === "true"} />;
}
