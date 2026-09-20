import { UpstreamFailure, verifyLoginCode } from "@/server/adapters/new-api/auth";
import { buildSessionCookies, sealSession, SessionFailure } from "@/server/auth/session";
import { toAuthUser } from "@/server/auth/user-mapping";
import { checkSameOriginMutation, jsonError, jsonOk, readJsonBody } from "@/server/http";
import type { LoginResult } from "@/types/auth";

/**
 * POST /api/v1/auth/verify — completes a login that requires a second factor.
 * The flow token lives only in the caller's component state; it is passed
 * through here and never persisted by the BFF.
 */

const SUPPORTED_METHODS = ["2fa"] as const;

export async function POST(request: Request): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "Verification is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }

  const body = await readJsonBody(request);
  const flowToken = typeof body?.flow_token === "string" ? body.flow_token : "";
  const method = typeof body?.method === "string" ? body.method : "2fa";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!flowToken || !code || code.length > 16) {
    return jsonError(400, "invalid_request", "A verification code is required.");
  }
  if (!SUPPORTED_METHODS.includes(method as (typeof SUPPORTED_METHODS)[number])) {
    return jsonError(400, "invalid_request", "Unsupported verification method.");
  }

  try {
    const outcome = await verifyLoginCode(flowToken, method, code);
    if (outcome.kind === "verification_required") {
      return jsonError(400, "verification_failed", "Verification is still required.");
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
      console.error(`[auth] session could not be issued: ${error.code}`);
      return jsonError(503, "sign_in_unavailable", "Verification is temporarily unavailable.");
    }
    if (error instanceof UpstreamFailure) {
      if (error.code === "VERIFICATION_FAILED") {
        return jsonError(401, "verification_failed", "That code didn't work. Check it and try again.");
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
      return jsonError(503, "upstream_unavailable", "Verification is temporarily unavailable.");
    }
    console.error("[auth] verification failed with an unexpected error");
    return jsonError(500, "internal_error", "Verification failed. Please try again.");
  }
}
