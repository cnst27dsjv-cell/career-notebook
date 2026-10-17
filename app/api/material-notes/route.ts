import { userFor, failure } from "@/lib/http";
import { importMaterialNote } from "@/lib/material-notes";
export async function POST(request: Request) {
  try {
    const user = await userFor(request);
    return Response.json(
      await importMaterialNote(user.id, await request.json()),
    );
  } catch (e) {
    return failure(e);
  }
}
