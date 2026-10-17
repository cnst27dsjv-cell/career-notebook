import { userFor, failure } from "@/lib/http";
import { handleInterview } from "@/lib/interview-service";
export async function POST(request: Request) {
  try {
    const user = await userFor(request);
    return Response.json(await handleInterview(user.id, await request.json()));
  } catch (error) {
    return failure(error);
  }
}
