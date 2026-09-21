import { mutationRoute, readRoute } from "@/server/route-helpers";
import {
  fetchLoginSessions,
  revokeOtherLoginSessions,
} from "@/server/adapters/new-api/account";

import type { SessionView } from "@/features/settings/types";

/**
 * GET  /api/v1/settings/sessions — the caller's login sessions.
 * POST /api/v1/settings/sessions — { action: "revoke-others" } revokes every
 * session except the current one.
 */

export async function GET(request: Request): Promise<Response> {
  return readRoute<{ sessions: SessionView[] }>(request, async (accessToken) => {
    const sessions = await fetchLoginSessions(accessToken);
    return {
      sessions: sessions.map((session) => ({
        sid: session.sid,
        current: session.current,
        loginMethod: session.loginMethod,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt,
        expiresAt: session.expiresAt,
      })),
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid request body.", request_id: "" } },
      { status: 400 },
    );
  }
  if (body.action !== "revoke-others") {
    return Response.json(
      { error: { code: "invalid_request", message: "Unknown action.", request_id: "" } },
      { status: 400 },
    );
  }
  return mutationRoute(request, async (accessToken) => {
    const revoked = await revokeOtherLoginSessions(accessToken);
    return { revoked };
  });
}
