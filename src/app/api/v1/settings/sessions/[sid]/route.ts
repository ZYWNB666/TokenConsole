import { mutationRoute } from "@/server/route-helpers";
import { revokeLoginSession } from "@/server/adapters/new-api/account";

/**
 * DELETE /api/v1/settings/sessions/:sid — revoke one login session.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sid: string }> },
): Promise<Response> {
  const { sid } = await params;
  if (!sid || sid.length > 128) {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid session id.", request_id: "" } },
      { status: 400 },
    );
  }
  return mutationRoute(request, async (accessToken) => {
    await revokeLoginSession(accessToken, sid);
    return { revoked: true };
  });
}
