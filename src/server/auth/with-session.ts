import "server-only";

import type { UpstreamUser } from "@/server/adapters/new-api/auth";
import { fetchSelf, refreshSession, UpstreamFailure } from "@/server/adapters/new-api/auth";
import {
  buildClearSessionCookies,
  buildSessionCookies,
  readSession,
  sealSession,
} from "@/server/auth/session";

/**
 * Authenticated BFF call with a single refresh-and-retry attempt.
 *
 * Flow: read the encrypted HttpOnly session cookie → call upstream with the
 * Bearer access token → on an auth failure (401), refresh exactly once
 * through the upstream refresh endpoint (refresh token + X-Auth-Session),
 * re-issue the session cookie with the rotated material, and retry the
 * original call once.
 *
 * Failure semantics:
 * - refresh rejected (AUTH_SESSION_INVALID) → clear the session, report 401
 * - refresh unavailable / rate limited (UPSTREAM_UNAVAILABLE, RATE_LIMITED)
 *   → keep the existing session so the user can retry later, report 503/429
 * - non-auth upstream failures never trigger a rotation attempt
 * No unbounded refresh loop is possible: at most one refresh per request.
 */
export type AuthenticatedCall =
  | { ok: true; user: UpstreamUser; setCookies: string[] }
  | { ok: false; status: 401 | 429 | 503; clearCookies: string[] };

export type AuthenticatedCallResult =
  | { ok: true; user: UpstreamUser }
  /** `auth: true` means the failure was an auth rejection (401) — a refresh may help. */
  | { ok: false; auth: boolean; status?: 429 | 503 };

/** Same contract as AuthenticatedCallResult, for any payload type. */
export type SessionDataCallResult<T> =
  | { ok: true; value: T }
  /** `status: 403` means the session is valid but lacks a privilege. */
  | { ok: false; auth: boolean; status?: 403 | 429 | 503 };

export type AuthenticatedDataCall<T> =
  | { ok: true; value: T; setCookies: string[] }
  | { ok: false; status: 401 | 403 | 429 | 503; clearCookies: string[] };

/**
 * Generalization of callAuthenticated for handlers that need more than the
 * user object (e.g. the overview endpoint's usage payloads). Identical
 * refresh-and-retry semantics: at most one upstream refresh per request.
 */
export async function callWithSession<T>(
  request: Request,
  call: (accessToken: string) => Promise<SessionDataCallResult<T>>,
): Promise<AuthenticatedDataCall<T>> {
  const session = readSession(request);
  if (!session) {
    return { ok: false, status: 401, clearCookies: buildClearSessionCookies(request) };
  }

  const first = await call(session.at);
  if (first.ok) {
    return { ok: true, value: first.value, setCookies: [] };
  }
  if (!first.auth) {
    return { ok: false, status: first.status ?? 503, clearCookies: [] };
  }
  if (!session.rt) {
    return { ok: false, status: 401, clearCookies: buildClearSessionCookies(request) };
  }

  try {
    const bundle = await refreshSession(session.rt, session.sid || undefined);
    const retry = await call(bundle.accessToken);
    if (retry.ok) {
      return {
        ok: true,
        value: retry.value,
        setCookies: buildSessionCookies(
          bundle.sessionExpiresAt,
          sealSession({
            at: bundle.accessToken,
            ae: bundle.accessExpiresAt,
            rt: bundle.refreshToken,
            sid: bundle.sessionSid,
            exp: bundle.sessionExpiresAt,
          }),
          request,
        ),
      };
    }
    if (!retry.auth) {
      return { ok: false, status: retry.status ?? 503, clearCookies: [] };
    }
    return { ok: false, status: 401, clearCookies: buildClearSessionCookies(request) };
  } catch (error) {
    if (error instanceof UpstreamFailure) {
      if (error.code === "AUTH_SESSION_INVALID") {
        return { ok: false, status: 401, clearCookies: buildClearSessionCookies(request) };
      }
      if (error.code === "RATE_LIMITED") {
        return { ok: false, status: 429, clearCookies: [] };
      }
    }
    return { ok: false, status: 503, clearCookies: [] };
  }
}

export async function callAuthenticated(
  request: Request,
  call: (accessToken: string) => Promise<AuthenticatedCallResult>,
): Promise<AuthenticatedCall> {
  const result = await callWithSession(request, async (accessToken) => {
    const inner = await call(accessToken);
    if (inner.ok) return { ok: true as const, value: inner.user };
    return { ok: false as const, auth: inner.auth, status: inner.status };
  });
  if (result.ok) {
    return { ok: true, user: result.value, setCookies: result.setCookies };
  }
  // The /me contract has no privileged calls; a 403 would be an availability
  // anomaly and is reported as 503 without touching the session.
  const status = result.status === 403 ? 503 : result.status;
  return { ok: false, status, clearCookies: result.clearCookies };
}

/** Convenience adapter for GET /api/user/self-style calls. */
export async function callWithSelf(accessToken: string): Promise<AuthenticatedCallResult> {
  const self = await fetchSelf(accessToken);
  if (self.ok) return { ok: true, user: self.user };
  if (self.status === 401) return { ok: false, auth: true };
  return { ok: false, auth: false, status: self.status === 429 ? 429 : 503 };
}
