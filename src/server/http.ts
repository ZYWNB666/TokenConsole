import { randomUUID } from "node:crypto";

/**
 * Server-side HTTP helpers for the /api/v1 route handlers: a shared response
 * envelope, a byte-based request-body limit, and the origin guard for
 * cookie-writing mutations. No request credential ever flows into logs from
 * here.
 */

const NO_STORE = "no-store";

export function jsonOk(data: unknown, cookies: string[] = []): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": NO_STORE,
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(JSON.stringify({ data }), { status: 200, headers });
}

export function jsonError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, request_id: randomUUID() } }),
    { status, headers: { "Content-Type": "application/json", "Cache-Control": NO_STORE } },
  );
}

/** Returns a copy of the response with additional Set-Cookie headers. */
export function withCookies(response: Response, cookies: string[]): Response {
  if (cookies.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

export const MAX_JSON_BODY_BYTES = 8 * 1024;

/**
 * Parses a JSON request body with a hard cap on UTF-8 bytes (not JavaScript
 * character counts). Returns `null` when the body is missing, too large, or
 * not a JSON object.
 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BODY_BYTES) {
    return null;
  }
  let buffer: Buffer;
  try {
    buffer = Buffer.from(await request.arrayBuffer());
  } catch {
    return null;
  }
  if (buffer.byteLength > MAX_JSON_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(buffer.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The origin the console is legitimately served from, as configured through
 * AUTH_PUBLIC_ORIGIN. Only a pure origin is accepted: http(s) scheme, no
 * credentials, root path, no query, no fragment. The value is normalized to
 * a full origin (protocol + hostname + effective port) so comparisons use
 * `new URL(candidate).origin`.
 */
export type PublicOrigin = {
  origin: string;
  secure: boolean;
};

type PublicOriginSetting =
  | { state: "unset" }
  | { state: "invalid" }
  | { state: "valid"; value: PublicOrigin };

function parsePublicOrigin(): PublicOriginSetting {
  const raw = process.env.AUTH_PUBLIC_ORIGIN;
  if (raw === undefined || raw === "") return { state: "unset" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { state: "invalid" };
  }
  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isPureOrigin =
    url.username === "" &&
    url.password === "" &&
    (url.pathname === "/" || url.pathname === "") &&
    url.search === "" &&
    url.hash === "";
  if (!isHttp || !isPureOrigin) return { state: "invalid" };
  return { state: "valid", value: { origin: url.origin, secure: url.protocol === "https:" } };
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The origin requests must match. A present-but-invalid AUTH_PUBLIC_ORIGIN
 * fails closed in every environment — a broken explicit configuration must
 * never silently fall back to client-controlled values. A missing value is
 * only tolerated outside production, where local development falls back to
 * the request URL's own origin.
 */
export type AllowedOriginResult =
  | { kind: "origin"; origin: string }
  | { kind: "config_error" };

export function resolveAllowedOrigin(request: Request): AllowedOriginResult {
  const setting = parsePublicOrigin();
  if (setting.state === "invalid") return { kind: "config_error" };
  if (setting.state === "valid") return { kind: "origin", origin: setting.value.origin };
  if (isProduction()) return { kind: "config_error" };
  try {
    return { kind: "origin", origin: new URL(request.url).origin };
  } catch {
    return { kind: "config_error" };
  }
}

export type OriginCheck =
  | { ok: true }
  | { ok: false; reason: "forbidden" }
  | { ok: false; reason: "config_error" };

function matchesAllowedOrigin(request: Request, candidate: string): boolean {
  const allowed = resolveAllowedOrigin(request);
  if (allowed.kind === "config_error") return false;
  try {
    return new URL(candidate).origin === allowed.origin;
  } catch {
    return false;
  }
}

/**
 * Guard for cookie-writing mutations: a present Origin must match the
 * allowed origin exactly; a missing Origin requires a same-origin Referer;
 * both missing (or a literal "null" origin) is rejected. A missing or
 * invalid AUTH_PUBLIC_ORIGIN in production is a config error (fail closed)
 * rather than a silent Host fallback.
 */
export function checkSameOriginMutation(request: Request): OriginCheck {
  const allowed = resolveAllowedOrigin(request);
  if (allowed.kind === "config_error") return { ok: false, reason: "config_error" };
  const origin = request.headers.get("origin");
  if (origin) return matchesAllowedOrigin(request, origin)
    ? { ok: true }
    : { ok: false, reason: "forbidden" };
  const referer = request.headers.get("referer");
  if (referer) return matchesAllowedOrigin(request, referer)
    ? { ok: true }
    : { ok: false, reason: "forbidden" };
  return { ok: false, reason: "forbidden" };
}

/**
 * Softer rule for reads that may rotate cookies as a side effect (GET /me):
 * a present-but-mismatching Origin or Referer is rejected, but a request
 * without either header (same-origin GET fetches) is allowed — SameSite=Lax
 * already keeps cross-site requests from attaching the cookie. Production
 * still requires a valid AUTH_PUBLIC_ORIGIN.
 */
export function checkCrossOriginRead(request: Request): OriginCheck {
  const allowed = resolveAllowedOrigin(request);
  if (allowed.kind === "config_error") return { ok: false, reason: "config_error" };
  const origin = request.headers.get("origin");
  if (origin) return matchesAllowedOrigin(request, origin)
    ? { ok: true }
    : { ok: false, reason: "forbidden" };
  const referer = request.headers.get("referer");
  if (referer) return matchesAllowedOrigin(request, referer)
    ? { ok: true }
    : { ok: false, reason: "forbidden" };
  return { ok: true };
}

/**
 * Whether the session cookie should carry the Secure attribute. An https
 * AUTH_PUBLIC_ORIGIN always implies Secure — including when the request
 * reaches the app over plain http behind a reverse proxy — and in
 * production an AUTH_COOKIE_SECURE=false misconfiguration cannot silently
 * disable it. The explicit "true" override works everywhere.
 */
export function shouldSecureCookie(request: Request): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  const setting = parsePublicOrigin();
  if (setting.state === "valid" && setting.value.secure) return true;
  if (process.env.AUTH_COOKIE_SECURE === "false" && !isProduction()) return false;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}
