import "server-only";

/**
 * Shared HTTP plumbing for the New API fork adapters. One place for the
 * upstream fetch (Bearer access token, hard timeout, never forwarding client
 * headers), the envelope validation and the failure taxonomy, so each
 * adapter module only declares its endpoints and mappings.
 *
 * Failure codes match the auth adapter's semantics: network/timeout/5xx/
 * malformed → UPSTREAM_UNAVAILABLE; 429 → RATE_LIMITED; 401/403 →
 * AUTH_REJECTED (a session refresh may recover the call).
 */

const DEFAULT_TIMEOUT_MS = 8_000;

export type UpstreamFailureCode =
  | "UPSTREAM_UNAVAILABLE"
  | "RATE_LIMITED"
  | "AUTH_REJECTED"
  | "FORBIDDEN";

export class UpstreamHttpError extends Error {
  readonly code: UpstreamFailureCode;
  /** `auth: true` means a session refresh may recover the call. */
  readonly auth: boolean;

  constructor(code: UpstreamFailureCode, message: string) {
    super(message);
    this.name = "UpstreamHttpError";
    this.code = code;
    this.auth = code === "AUTH_REJECTED";
  }
}

/** Fork error codes that mean "the caller lacks the privilege for this". */
const PRIVILEGE_CODES = new Set(["AUTH_INSUFFICIENT_PRIVILEGE"]);

export function internalBase(): URL {
  const raw = process.env.NEW_API_INTERNAL_URL;
  if (!raw) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "NEW_API_INTERNAL_URL is not configured");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "NEW_API_INTERNAL_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "NEW_API_INTERNAL_URL must use http or https");
  }
  return url;
}

function timeoutMs(): number {
  const parsed = Number(process.env.NEW_API_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 60_000) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

export async function upstreamFetch(
  path: string,
  accessToken: string,
  init: { method?: string; body?: string; query?: Record<string, string> } = {},
): Promise<Response> {
  const base = internalBase();
  const url = new URL(path, base);
  if (init.query) {
    for (const [key, value] of Object.entries(init.query)) {
      url.searchParams.set(key, value);
    }
  }
  try {
    return await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch (error) {
    if (error instanceof UpstreamHttpError) throw error;
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request failed");
  }
}

export function toHttpFailure(status: number): UpstreamHttpError {
  if (status === 429) return new UpstreamHttpError("RATE_LIMITED", "upstream rate limit reached");
  if (status === 401) {
    return new UpstreamHttpError("AUTH_REJECTED", "upstream rejected the access token");
  }
  if (status === 403) {
    // The fork uses 403 for insufficient privilege; the session stays valid.
    return new UpstreamHttpError("FORBIDDEN", "the caller lacks the required privilege");
  }
  return new UpstreamHttpError("UPSTREAM_UNAVAILABLE", `upstream request failed with HTTP ${status}`);
}

type Envelope<TData> = { success: boolean; code?: string; data?: TData };

/**
 * Parses an upstream success envelope and returns its payload. An explicit
 * business rejection (success:false) with a known privilege code becomes
 * AUTH_REJECTED; anything else is an availability problem.
 */
export async function parseEnvelope<TData>(response: Response): Promise<TData> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  const candidate = parsed as Partial<Envelope<TData>>;
  if (typeof candidate.success !== "boolean") {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (candidate.success !== true) {
    if (candidate.code && PRIVILEGE_CODES.has(candidate.code)) {
      // A valid session that simply lacks the privilege — never a reason to
      // refresh, sign out, or report an outage.
      throw new UpstreamHttpError("FORBIDDEN", "the caller lacks the required privilege");
    }
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request was rejected");
  }
  if (candidate.data === undefined || candidate.data === null) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  return candidate.data;
}

/** Maps any thrown error to the session-call failure shape. */
export function toSessionFailure(error: unknown): {
  ok: false;
  auth: boolean;
  status?: 403 | 429 | 503;
} {
  if (error instanceof UpstreamHttpError) {
    if (error.auth) return { ok: false, auth: true };
    if (error.code === "FORBIDDEN") return { ok: false, auth: false, status: 403 };
    return { ok: false, auth: false, status: error.code === "RATE_LIMITED" ? 429 : 503 };
  }
  return { ok: false, auth: false, status: 503 };
}

/** Raw paginated page shape used by several fork list endpoints. */
export type UpstreamPage<TItem> = {
  page: number;
  page_size: number;
  total: number;
  items: TItem[];
};

export function isPage<TItem>(value: unknown): value is UpstreamPage<TItem> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<UpstreamPage<unknown>>;
  return typeof candidate.page === "number" && Array.isArray(candidate.items);
}
