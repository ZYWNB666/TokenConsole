import { mutationRoute } from "@/server/route-helpers";
import { revealApiKey } from "@/server/adapters/new-api/tokens";

/**
 * POST /api/v1/keys/:id/reveal — return the full key value exactly once.
 * Rate limited upstream; the value is never cached or listed by the BFF.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const parsed = Number(id);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid key id.", request_id: "" } },
      { status: 400 },
    );
  }
  return mutationRoute(request, async (accessToken) => {
    const key = await revealApiKey(accessToken, parsed);
    return { key };
  });
}
