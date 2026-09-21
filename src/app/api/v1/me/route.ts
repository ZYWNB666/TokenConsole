import { fetchSelf } from "@/server/adapters/new-api/auth";
import type { UpstreamAccountFields, UpstreamUser } from "@/server/adapters/new-api/auth";
import { toAuthUser } from "@/server/auth/user-mapping";
import { callWithSession } from "@/server/auth/with-session";
import { checkCrossOriginRead, jsonError, jsonOk, withCookies } from "@/server/http";

import type { AuthUser } from "@/types/auth";

type SelfPayload = { user: UpstreamUser; account?: UpstreamAccountFields };

/**
 * GET /api/v1/me — the authenticated caller's own user, in the owned DTO
 * shape (id, username, display_name, email, role, capabilities and, when the
 * upstream /self payload carries them, public account counters). The session
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

  const result = await callWithSession(request, async (accessToken) => {
    const self = await fetchSelf(accessToken);
    if (self.ok) {
      const value: SelfPayload = { user: self.user, account: self.account };
      return { ok: true as const, value };
    }
    if (self.status === 401) return { ok: false as const, auth: true };
    return { ok: false as const, auth: false, status: self.status === 429 ? 429 : 503 };
  });

  if (result.ok) {
    const payload: AuthUser = toAuthUser(result.value.user, result.value.account);
    return jsonOk(payload, result.setCookies);
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
