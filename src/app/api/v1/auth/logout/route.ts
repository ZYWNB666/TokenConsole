import { logoutUpstream } from "@/server/adapters/new-api/auth";
import { buildClearSessionCookies, readSession } from "@/server/auth/session";
import { checkSameOriginMutation, jsonError, jsonOk } from "@/server/http";

/**
 * POST /api/v1/auth/logout — revokes the upstream login session on a
 * best-effort basis and always clears the TokenConsole session cookie, so
 * the browser ends up signed out even when upstream already considers the
 * session invalid. The response carries no session details.
 */
export async function POST(request: Request): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "Sign-out is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }

  const session = readSession(request);
  if (session) {
    await logoutUpstream({
      accessToken: session.at,
      refreshToken: session.rt,
      sid: session.sid || null,
    });
  }

  return jsonOk({ status: "ok" }, buildClearSessionCookies(request));
}
