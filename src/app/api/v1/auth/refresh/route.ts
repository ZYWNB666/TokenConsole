import { refreshSession, UpstreamFailure } from "@/server/adapters/new-api/auth";
import {
  buildClearSessionCookies,
  buildSessionCookies,
  readSession,
  sealSession,
  SessionFailure,
} from "@/server/auth/session";
import { toAuthUser } from "@/server/auth/user-mapping";
import { checkSameOriginMutation, jsonError, jsonOk, withCookies } from "@/server/http";
import type { LoginResult } from "@/types/auth";

/**
 * POST /api/v1/auth/refresh — rotates the BFF session through the upstream
 * refresh endpoint (refresh token + X-Auth-Session) and re-issues the
 * encrypted HttpOnly session cookie.
 *
 * Failure semantics: an explicit upstream rejection (401/403/409, or an
 * envelope refusal with a confirmed session-rejection code) clears the local
 * session and returns 401; rate limiting (429), malformed responses and
 * upstream outages keep the existing session so the user can retry later.
 */
export async function POST(request: Request): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "Session refresh is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }

  const session = readSession(request);
  if (!session?.rt) {
    return withCookies(
      jsonError(401, "unauthenticated", "Sign in to continue."),
      buildClearSessionCookies(request),
    );
  }

  try {
    const bundle = await refreshSession(session.rt, session.sid || undefined);
    const sealed = sealSession({
      at: bundle.accessToken,
      ae: bundle.accessExpiresAt,
      rt: bundle.refreshToken,
      sid: bundle.sessionSid,
      exp: bundle.sessionExpiresAt,
    });
    const data: LoginResult = { status: "ok", user: toAuthUser(bundle.user) };
    return jsonOk(data, buildSessionCookies(bundle.sessionExpiresAt, sealed, request));
  } catch (error) {
    if (error instanceof SessionFailure) {
      // Cannot seal a new session — keep the current one and let the user retry.
      console.error(`[auth] session could not be resealed: ${error.code}`);
      return jsonError(503, "session_unavailable", "Session refresh is temporarily unavailable.");
    }
    if (error instanceof UpstreamFailure) {
      if (error.code === "AUTH_SESSION_INVALID") {
        return withCookies(
          jsonError(401, "unauthenticated", "Your session has expired. Sign in again."),
          buildClearSessionCookies(request),
        );
      }
      if (error.code === "RATE_LIMITED") {
        return jsonError(429, "rate_limited", "Too many attempts. Please wait a moment and try again.");
      }
      return jsonError(503, "upstream_unavailable", "Session refresh is temporarily unavailable.");
    }
    console.error("[auth] refresh failed with an unexpected error");
    return jsonError(500, "internal_error", "Session refresh failed. Please try again.");
  }
}
