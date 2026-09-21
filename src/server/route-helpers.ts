import "server-only";

import { toSessionFailure } from "@/server/adapters/new-api/internal";
import { callWithSession } from "@/server/auth/with-session";
import {
  checkCrossOriginRead,
  checkSameOriginMutation,
  jsonError,
  jsonOk,
  withCookies,
} from "@/server/http";

/**
 * Shared plumbing for /api/v1 data routes: origin guard (strict for
 * mutations, read guard for GETs that may rotate cookies), session with one
 * refresh-and-retry, and the uniform failure mapping.
 *
 * Failure semantics: 403 = valid session without the required privilege
 * (org management as a member) — the session is never cleared; 401 = session
 * rejected, cookies cleared; 429/503 = retry later, session kept.
 *
 * A handler may also return a prebuilt Response instead of a JSON payload
 * (used for business rejections that are neither validation errors nor
 * outages, e.g. "payment provider not configured"): finish() passes it
 * through untouched while still applying rotated session cookies.
 */
export async function readRoute<T>(
  request: Request,
  fn: (accessToken: string) => Promise<T>,
): Promise<Response> {
  const originCheck = checkCrossOriginRead(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "The console is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }
  return finish(await call(request, fn));
}

export async function mutationRoute<T>(
  request: Request,
  fn: (accessToken: string) => Promise<T>,
): Promise<Response> {
  const originCheck = checkSameOriginMutation(request);
  if (!originCheck.ok) {
    return originCheck.reason === "config_error"
      ? jsonError(503, "origin_config_error", "The console is temporarily unavailable.")
      : jsonError(403, "origin_forbidden", "Request origin is not allowed.");
  }
  return finish(await call(request, fn));
}

async function call<T>(
  request: Request,
  fn: (accessToken: string) => Promise<T>,
): ReturnType<typeof callWithSession<T>> {
  return callWithSession(request, async (accessToken) => {
    try {
      return { ok: true as const, value: await fn(accessToken) };
    } catch (error) {
      return toSessionFailure(error);
    }
  });
}

function finish<T>(
  result: Awaited<ReturnType<typeof callWithSession<T>>>,
): Response {
  if (result.ok) {
    if (result.value instanceof Response) {
      return withCookies(result.value, result.setCookies);
    }
    return jsonOk(result.value, result.setCookies);
  }
  if (result.status === 403) {
    return jsonError(403, "forbidden", "You do not have permission to perform this action.");
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
