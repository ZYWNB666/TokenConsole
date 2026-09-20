import { loginWithPassword, UpstreamFailure } from "@/server/adapters/new-api/auth";
import { buildSessionCookies, sealSession, SessionFailure } from "@/server/auth/session";
import { toAuthUser } from "@/server/auth/user-mapping";
import { checkSameOriginMutation, jsonError, jsonOk, readJsonBody } from "@/server/http";
import type { LoginResult } from "@/types/auth";

/**
 * POST /api/v1/auth/login — username/password sign-in against the New API
 * fork (with server-side password encryption when the fork enables it).
 * Never returns tokens to the browser; the session material lives only in
 * the encrypted HttpOnly BFF cookie. Uses one uniform failure message so
 * responses do not reveal whether the account exists.
 */

const INVALID_CREDENTIALS_MESSAGE = "Invalid username or password.";

export async function POST(request: Request): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "Sign-in is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }

  const body = await readJsonBody(request);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || username.length > 64 || !password || password.length > 128) {
    return jsonError(400, "invalid_request", "A username and password are required.");
  }

  try {
    const outcome = await loginWithPassword(username, password);
    if (outcome.kind === "verification_required") {
      const data: LoginResult = {
        status: "verification_required",
        flow_token: outcome.flowToken,
        methods: outcome.methods,
        expires_at: outcome.expiresAt,
      };
      return jsonOk(data);
    }
    const { bundle } = outcome;
    const sealed = sealSession({
      at: bundle.accessToken,
      ae: bundle.accessExpiresAt,
      rt: bundle.refreshToken,
      sid: bundle.sessionSid,
      exp: bundle.sessionExpiresAt,
    });
    const data: LoginResult = {
      status: "ok",
      user: toAuthUser(bundle.user),
    };
    return jsonOk(data, buildSessionCookies(bundle.sessionExpiresAt, sealed, request));
  } catch (error) {
    if (error instanceof SessionFailure) {
      // Fail closed: no secret or an oversized session means no session can
      // be issued. The server log carries no credential values.
      console.error(`[auth] session could not be issued: ${error.code}`);
      return jsonError(503, "sign_in_unavailable", "Sign-in is temporarily unavailable.");
    }
    if (error instanceof UpstreamFailure) {
      if (error.code === "INVALID_CREDENTIALS") {
        return jsonError(401, "invalid_credentials", INVALID_CREDENTIALS_MESSAGE);
      }
      if (error.code === "BACKEND_VERSION_MISMATCH") {
        return jsonError(
          503,
          "BACKEND_VERSION_MISMATCH",
          "The configured authentication backend does not implement the expected protocol.",
        );
      }
      if (error.code === "RATE_LIMITED") {
        return jsonError(429, "rate_limited", "Too many attempts. Please wait a moment and try again.");
      }
      return jsonError(503, "upstream_unavailable", "Authentication is temporarily unavailable.");
    }
    console.error("[auth] login failed with an unexpected error");
    return jsonError(500, "internal_error", "Sign-in failed. Please try again.");
  }
}
