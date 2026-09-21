import { mutationRoute } from "@/server/route-helpers";
import { updateDisplayName } from "@/server/adapters/new-api/account";

/**
 * PATCH /api/v1/settings/profile — update the caller's display name.
 */
export async function PATCH(request: Request): Promise<Response> {
  let body: { displayName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid request body.", request_id: "" } },
      { status: 400 },
    );
  }
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (displayName.length < 1 || displayName.length > 64) {
    return Response.json(
      { error: { code: "invalid_request", message: "Display name must be 1–64 characters.", request_id: "" } },
      { status: 400 },
    );
  }
  return mutationRoute(request, async (accessToken) => {
    await updateDisplayName(accessToken, displayName);
    return { updated: true };
  });
}
