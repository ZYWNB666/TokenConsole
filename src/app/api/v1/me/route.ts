import { callAuthenticated, callWithSelf } from "@/server/auth/with-session";
import { toAuthUser } from "@/server/auth/user-mapping";
import { checkCrossOriginRead, jsonError, jsonOk, withCookies } from "@/server/http";

/**
 * GET /api/v1/me — the authenticated caller's own user, in the owned DTO
 * shape (id, username, display_name, email, role, capabilities). The session
 * is validated by calling upstream with the Bearer access token; an expired
 * access token triggers exactly one refresh-and-retry. A rejected refresh
 * clears the session (401); upstream unavailability or rate limiting keeps
 * it (503/429) so the user can retry without signing in again.
 */
export async function GET(request: Request): Promise<Response> {
  const originCheck = checkCrossOriginRead(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "The console is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }

  const result = await callAuthenticated(request, callWithSelf);

  if (result.ok) {
    return jsonOk(toAuthUser(result.user), result.setCookies);
  }
  if (result.status === 429) {
    return jsonError(429, "rate_limited", "Too many requests. Please wait a moment and try again.");
  }
  if (result.status === 503) {
    return jsonError(503, "upstream_unavailable", "The console is temporarily unavailable.");
  }
  return withCookies(
    jsonError(401, "unauthenticated", "Sign in to continue."),
    result.clearCookies,
  );
}
