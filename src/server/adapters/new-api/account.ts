import "server-only";

import {
  parseEnvelope,
  toHttpFailure,
  upstreamFetch,
  UpstreamHttpError,
} from "./internal";

/**
 * Server-only account adapter for the New API fork (commit 972aed19):
 * the caller's login sessions and profile updates. Password change is
 * deliberately not implemented — the fork requires an interactive
 * security-verification proof for it, which this BFF does not proxy.
 */

const SESSIONS_PATH = "/api/user/sessions";

export type UpstreamLoginSession = {
  sid: string;
  current: boolean;
  loginMethod: string;
  ip: string;
  userAgent: string;
  /** UTC ISO timestamps. */
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};

type UpstreamSessionRow = {
  sid?: unknown;
  current?: unknown;
  login_method?: unknown;
  ip?: unknown;
  user_agent?: unknown;
  created_at?: unknown;
  last_active_at?: unknown;
  expires_at?: unknown;
};

function toSession(row: UpstreamSessionRow): UpstreamLoginSession {
  if (
    typeof row.sid !== "string" || !row.sid ||
    typeof row.created_at !== "number" || !Number.isFinite(row.created_at) ||
    typeof row.last_active_at !== "number" || !Number.isFinite(row.last_active_at) ||
    typeof row.expires_at !== "number" || !Number.isFinite(row.expires_at)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream session row is malformed");
  }
  return {
    sid: row.sid,
    current: row.current === true,
    loginMethod: typeof row.login_method === "string" ? row.login_method : "",
    ip: typeof row.ip === "string" ? row.ip : "",
    userAgent: typeof row.user_agent === "string" ? row.user_agent : "",
    createdAt: new Date(row.created_at * 1000).toISOString(),
    lastActiveAt: new Date(row.last_active_at * 1000).toISOString(),
    expiresAt: new Date(row.expires_at * 1000).toISOString(),
  };
}

/** GET /api/user/sessions — all of the caller's login sessions. */
export async function fetchLoginSessions(accessToken: string): Promise<UpstreamLoginSession[]> {
  const response = await upstreamFetch(SESSIONS_PATH, accessToken);
  if (!response.ok) throw toHttpFailure(response.status);
  const rows = await parseEnvelope<unknown>(response);
  if (!Array.isArray(rows)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream sessions response is malformed");
  }
  return rows
    .filter((row): row is UpstreamSessionRow => Boolean(row && typeof row === "object"))
    .map(toSession);
}

async function confirmEmptyData(response: Response): Promise<void> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if ((parsed as { success?: unknown }).success !== true) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request was rejected");
  }
}

/** DELETE /api/user/sessions/:sid — revoke one login session. */
export async function revokeLoginSession(accessToken: string, sid: string): Promise<void> {
  const response = await upstreamFetch(`${SESSIONS_PATH}/${encodeURIComponent(sid)}`, accessToken, {
    method: "DELETE",
  });
  if (!response.ok) throw toHttpFailure(response.status);
  await confirmEmptyData(response);
}

/** POST /api/user/sessions/revoke-others — revoke every session but the current one. */
export async function revokeOtherLoginSessions(accessToken: string): Promise<number> {
  const response = await upstreamFetch(`${SESSIONS_PATH}/revoke-others`, accessToken, {
    method: "POST",
    body: "{}",
  });
  if (!response.ok) throw toHttpFailure(response.status);
  // The fork returns the number of revoked sessions (possibly without envelope data).
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { success?: unknown; data?: unknown };
    if (parsed?.success !== true) {
      throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request was rejected");
    }
    if (typeof parsed.data === "number") return parsed.data;
    if (parsed.data && typeof parsed.data === "object" && typeof (parsed.data as { revoked?: unknown }).revoked === "number") {
      return (parsed.data as { revoked: number }).revoked;
    }
    return 0;
  } catch (error) {
    if (error instanceof UpstreamHttpError) throw error;
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
}

/** PUT /api/user/self — update the caller's display name. */
export async function updateDisplayName(accessToken: string, displayName: string): Promise<void> {
  const response = await upstreamFetch("/api/user/self", accessToken, {
    method: "PUT",
    body: JSON.stringify({ display_name: displayName }),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  // The fork replies {success:true} with or without a data payload.
  await confirmEmptyData(response);
}
