import { userFor, failure } from "@/lib/http";
import { handleLibraryOrganizer } from "@/lib/library-organizer-service";
export async function POST(request: Request) {
  try {
    const user = await userFor(request);
    return Response.json(
      await handleLibraryOrganizer(user.id, await request.json()),
    );
  } catch (e) {
    return failure(e);
  }
}
