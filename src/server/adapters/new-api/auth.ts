import "server-only";

import { createPublicKey, publicEncrypt, constants as cryptoConstants } from "node:crypto";

/**
 * Server-only auth adapter for the New API fork (commit 972aed197).
 *
 * The browser never talks to New API; only these functions do, using
 * NEW_API_INTERNAL_URL (server environment variable, never NEXT_PUBLIC_*).
 * Everything New API returns is mapped to owned shapes before it leaves this
 * module; upstream errors and raw bodies never reach route handlers verbatim.
 *
 * Failure taxonomy (route handlers map each code to one HTTP behaviour):
 * - network error / timeout / HTTP 5xx / malformed success → UPSTREAM_UNAVAILABLE (503)
 * - HTTP 429 → RATE_LIMITED (429)
 * - encryption-key endpoint 404 (protocol missing) → BACKEND_VERSION_MISMATCH (503)
 * - refresh rejected (401/403/409 or explicit envelope refusal) → AUTH_SESSION_INVALID (401 + clear cookies)
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const ENCRYPTION_KEY_PATH = "/api/user/login/encryption-key";
const LOGIN_PATH = "/api/user/login";
const VERIFY_LOGIN_PATH = "/api/user/login/verify";
const REFRESH_PATH = "/api/user/auth/refresh";
const LOGOUT_PATH = "/api/user/auth/logout";
const SELF_PATH = "/api/user/self";
/** The fork's known dashboard roles: member, admin, root. */
const KNOWN_ROLES = new Set([1, 10, 100]);

/** Codes surfaced to route handlers; each maps to one owned HTTP response. */
export type UpstreamFailureCode =
  | "BACKEND_VERSION_MISMATCH"
  | "INVALID_CREDENTIALS"
  | "VERIFICATION_FAILED"
  | "AUTH_SESSION_INVALID"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE";

export class UpstreamFailure extends Error {
  readonly code: UpstreamFailureCode;

  constructor(code: UpstreamFailureCode, message: string) {
    super(message);
    this.name = "UpstreamFailure";
    this.code = code;
  }
}

/** The upstream user object as returned by login/verify/refresh/self. */
export type UpstreamUser = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: number;
};

export type UpstreamAuthBundle = {
  accessToken: string;
  accessExpiresAt: number;
  /** Rotated refresh token captured from the upstream Set-Cookie. */
  refreshToken: string;
  refreshMaxAge: number | null;
  sessionSid: string;
  sessionExpiresAt: number;
  user: UpstreamUser;
};

export type UpstreamLoginOutcome =
  | { kind: "authenticated"; bundle: UpstreamAuthBundle }
  | {
      kind: "verification_required";
      flowToken: string;
      methods: string[];
      expiresAt: number;
    };

function internalBase(): URL {
  const raw = process.env.NEW_API_INTERNAL_URL;
  if (!raw) {
    throw new UpstreamFailure(
      "UPSTREAM_UNAVAILABLE",
      "NEW_API_INTERNAL_URL is not configured",
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "NEW_API_INTERNAL_URL is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "NEW_API_INTERNAL_URL must use http or https");
  }
  return url;
}

function upstreamTimeoutMs(): number {
  const parsed = Number(process.env.NEW_API_TIMEOUT_MS);
  if (Number.isFinite(parsed) && parsed >= 100 && parsed <= 60_000) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Performs an upstream request with a hard timeout. Only explicitly provided
 * headers are sent — incoming client headers are never forwarded.
 */
async function upstreamFetch(
  path: string,
  init: { method: string; headers?: Record<string, string>; body?: string },
): Promise<Response> {
  const base = internalBase();
  try {
    return await fetch(new URL(path, base), {
      method: init.method,
      headers: init.headers,
      body: init.body,
      cache: "no-store",
      signal: AbortSignal.timeout(upstreamTimeoutMs()),
    });
  } catch (error) {
    if (error instanceof UpstreamFailure) throw error;
    // Network errors and timeouts are availability problems, never a
    // protocol mismatch or a credential rejection.
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream request failed");
  }
}

type UpstreamEnvelope<TData> = {
  success: boolean;
  message?: string;
  code?: string;
  data?: TData;
};

/**
 * Distinguishes an explicit upstream business rejection (valid JSON envelope
 * with success:false) from a malformed response (non-JSON, empty, non-object,
 * or a missing/non-boolean success flag). Malformed responses are always
 * availability problems — never credential rejections — and their bodies
 * never leave this module.
 */
type ParsedEnvelope<TData> =
  | { kind: "valid"; envelope: UpstreamEnvelope<TData> }
  | { kind: "malformed" };

async function parseEnvelope<TData>(response: Response): Promise<ParsedEnvelope<TData>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return { kind: "malformed" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { kind: "malformed" };
  }
  const candidate = parsed as Partial<UpstreamEnvelope<TData>>;
  if (typeof candidate.success !== "boolean") {
    return { kind: "malformed" };
  }
  return { kind: "valid", envelope: candidate as UpstreamEnvelope<TData> };
}

/**
 * New API session-rejection codes that justify clearing the local session
 * when a refresh is refused. Anything else — including unknown or missing
 * codes — is treated conservatively as an upstream availability problem.
 */
const SESSION_REJECTION_CODES = new Set([
  "AUTH_TOKEN_EXPIRED",
  "AUTH_SESSION_REVOKED",
  "AUTH_UNAUTHORIZED",
  "AUTH_SESSION_MISMATCH",
  "AUTH_REFRESH_RACE",
]);

const RATE_LIMIT_ENVELOPE_CODES = new Set(["AUTH_SESSION_ISSUANCE_LIMIT"]);

/** Classifies an explicit envelope rejection from the refresh endpoint. */
function classifyRefreshRejection(code: string | undefined): UpstreamFailureCode {
  if (code && SESSION_REJECTION_CODES.has(code)) return "AUTH_SESSION_INVALID";
  if (code && RATE_LIMIT_ENVELOPE_CODES.has(code)) return "RATE_LIMITED";
  return "UPSTREAM_UNAVAILABLE";
}

type UpstreamLoginData = {
  access_token?: unknown;
  token_type?: unknown;
  access_expires_at?: unknown;
  session?: { sid?: unknown; expires_at?: unknown } | null;
  user?: Record<string, unknown> | null;
  require_verification?: unknown;
  flow_token?: unknown;
  expires_at?: unknown;
  methods?: Array<{ method?: unknown } | string> | null;
};

/**
 * Strict validation of an upstream auth-success response. Every required
 * field must be present and valid — no defaults, no id=0, no invented
 * expiry. Any violation is a malformed success → UPSTREAM_UNAVAILABLE; the
 * offending field names stay server-side and never reach the browser.
 */
function bundleFromLoginData(
  response: Response,
  data: UpstreamLoginData,
): UpstreamAuthBundle {
  const now = Math.floor(Date.now() / 1000);
  const invalid: string[] = [];

  if (typeof data.access_token !== "string" || !data.access_token) invalid.push("access_token");
  if (
    typeof data.access_expires_at !== "number" ||
    !Number.isInteger(data.access_expires_at) ||
    data.access_expires_at <= now
  ) {
    invalid.push("access_expires_at");
  }

  const session = data.session ?? {};
  if (typeof session.sid !== "string" || !session.sid) invalid.push("session.sid");
  if (
    typeof session.expires_at !== "number" ||
    !Number.isInteger(session.expires_at) ||
    session.expires_at <= now
  ) {
    invalid.push("session.expires_at");
  }

  const user = data.user ?? {};
  if (!Number.isInteger(user.id) || (user.id as number) <= 0) invalid.push("user.id");
  if (typeof user.username !== "string" || !user.username) invalid.push("user.username");
  if (typeof user.role !== "number" || !KNOWN_ROLES.has(user.role)) invalid.push("user.role");

  const { token: refreshToken, maxAge } = readUpstreamRefreshCookie(response);
  if (!refreshToken) {
    // A login success without the rotated refresh cookie cannot become a
    // BFF session — refuse instead of inventing a partial one.
    console.error("[auth] upstream auth response malformed: new_api_refresh_cookie");
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream auth response is malformed");
  }

  if (invalid.length > 0) {
    // Server-side detail only; the browser sees a generic 503 message.
    console.error(`[auth] upstream auth response malformed: ${invalid.join(",")}`);
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream auth response is malformed");
  }

  return {
    accessToken: data.access_token as string,
    accessExpiresAt: data.access_expires_at as number,
    refreshToken,
    refreshMaxAge: maxAge,
    sessionSid: session.sid as string,
    sessionExpiresAt: session.expires_at as number,
    user: {
      id: user.id as number,
      username: user.username as string,
      display_name: typeof user.display_name === "string" ? user.display_name : "",
      email: typeof user.email === "string" ? user.email : "",
      role: user.role as number,
    },
  };
}

/** Extracts the rotated `new_api_refresh` cookie from upstream Set-Cookie. */
function readUpstreamRefreshCookie(response: Response): {
  token: string | null;
  maxAge: number | null;
} {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const [pair, ...attributes] = cookie.split(";");
    const [name, ...valueParts] = (pair ?? "").trim().split("=");
    if (name !== "new_api_refresh") continue;
    const value = valueParts.join("=");
    if (!value) return { token: null, maxAge: null };
    let maxAge: number | null = null;
    for (const attribute of attributes) {
      const [key, attrValue] = attribute.trim().split("=");
      if (key?.toLowerCase() === "max-age" && attrValue && Number.isFinite(Number(attrValue))) {
        maxAge = Number(attrValue);
      }
    }
    return { token: value, maxAge };
  }
  return { token: null, maxAge: null };
}

/**
 * Maps a login/verify response using the shared taxonomy. The fork reports
 * credential rejections as HTTP 200 + {success:false}; malformed responses
 * (non-JSON, missing success, success without data) are availability
 * problems, never credential rejections.
 */
async function parseLoginResponse(response: Response): Promise<UpstreamLoginOutcome> {
  if (response.status === 429) throw new UpstreamFailure("RATE_LIMITED", "upstream rate limit reached");
  if (response.status >= 500) throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream login failed");
  const parsed = await parseEnvelope<UpstreamLoginData>(response);
  if (parsed.kind === "malformed") {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream login response is malformed");
  }
  const envelope = parsed.envelope;
  if (envelope.success !== true) {
    throw new UpstreamFailure("INVALID_CREDENTIALS", "upstream rejected the credentials");
  }
  if (!envelope.data) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream login response is malformed");
  }
  const data = envelope.data;
  if (data.require_verification === true) {
    if (typeof data.flow_token !== "string" || !data.flow_token) {
      throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream challenge is malformed");
    }
    const methods = (data.methods ?? [])
      .map((entry) => (typeof entry === "string" ? entry : entry?.method))
      .filter((method): method is string => typeof method === "string");
    return {
      kind: "verification_required",
      flowToken: data.flow_token,
      methods: methods.length > 0 ? methods : ["2fa"],
      expiresAt: typeof data.expires_at === "number" ? data.expires_at : 0,
    };
  }
  return { kind: "authenticated", bundle: bundleFromLoginData(response, data) };
}

type EncryptionKey = {
  enabled: boolean;
  kid: string;
  publicKey: string;
};

async function fetchEncryptionKey(): Promise<EncryptionKey> {
  // Connection failures/timeouts surface as UPSTREAM_UNAVAILABLE from
  // upstreamFetch — only an explicit 404 (or an equally explicit protocol
  // refusal) is a version mismatch.
  const response = await upstreamFetch(ENCRYPTION_KEY_PATH, { method: "GET" });
  if (response.status === 404) {
    throw new UpstreamFailure(
      "BACKEND_VERSION_MISMATCH",
      "the configured backend does not implement the fork login protocol",
    );
  }
  if (response.status === 429) {
    throw new UpstreamFailure("RATE_LIMITED", "upstream rate limit reached");
  }
  if (response.status === 429) {
    throw new UpstreamFailure("RATE_LIMITED", "upstream rate limit reached");
  }
  if (!response.ok) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "encryption-key endpoint failed");
  }
  const parsed = await parseEnvelope<{ enabled?: unknown; kid?: unknown; public_key?: unknown }>(response);
  if (parsed.kind === "malformed" || parsed.envelope.success !== true || !parsed.envelope.data) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "encryption-key response is malformed");
  }
  const data = parsed.envelope.data;
  if (data.enabled !== true) return { enabled: false, kid: "", publicKey: "" };
  if (
    typeof data.kid !== "string" || !data.kid ||
    typeof data.public_key !== "string" || !data.public_key
  ) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "encryption-key response is incomplete");
  }
  return { enabled: true, kid: data.kid, publicKey: data.public_key };
}

/**
 * Encrypts the password exactly as the fork expects: RSA-OAEP with SHA-256
 * and an empty label, encoded as standard base64.
 */
function encryptPassword(password: string, publicKeyPem: string): string {
  const key = createPublicKey(publicKeyPem);
  const ciphertext = publicEncrypt(
    { key, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(password, "utf8"),
  );
  return ciphertext.toString("base64");
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<UpstreamLoginOutcome> {
  const key = await fetchEncryptionKey();
  let body: string;
  if (key.enabled) {
    // The fork rejects plaintext passwords when encryption is enabled — no
    // fallback to a cleartext request is allowed.
    body = JSON.stringify({
      username,
      password_encrypted: encryptPassword(password, key.publicKey),
      encryption_key_id: key.kid,
    });
  } else {
    body = JSON.stringify({ username, password });
  }
  const response = await upstreamFetch(LOGIN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  return parseLoginResponse(response);
}

export async function verifyLoginCode(
  flowToken: string,
  method: string,
  code: string,
): Promise<UpstreamLoginOutcome> {
  const response = await upstreamFetch(VERIFY_LOGIN_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flow_token: flowToken, method, code }),
  });
  if (response.status === 429) throw new UpstreamFailure("RATE_LIMITED", "upstream rate limit reached");
  if (response.status >= 500) throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream verification failed");
  const parsed = await parseEnvelope<UpstreamLoginData>(response);
  if (parsed.kind === "malformed") {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream verification response is malformed");
  }
  const envelope = parsed.envelope;
  if (envelope.success !== true) {
    throw new UpstreamFailure("VERIFICATION_FAILED", "upstream rejected the verification code");
  }
  if (!envelope.data) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream verification response is malformed");
  }
  if (envelope.data.require_verification === true) {
    throw new UpstreamFailure("VERIFICATION_FAILED", "upstream returned another challenge");
  }
  return { kind: "authenticated", bundle: bundleFromLoginData(response, envelope.data) };
}

export async function refreshSession(
  refreshToken: string,
  expectedSid?: string,
): Promise<UpstreamAuthBundle> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: `new_api_refresh=${refreshToken}`,
    Origin: internalBase().origin,
  };
  if (expectedSid) headers["X-Auth-Session"] = expectedSid;
  const response = await upstreamFetch(REFRESH_PATH, { method: "POST", headers, body: "{}" });
  if (response.status === 429) {
    throw new UpstreamFailure("RATE_LIMITED", "upstream rate limit reached");
  }
  if (response.status >= 500) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream refresh failed");
  }
  if (response.status === 401 || response.status === 403 || response.status === 409) {
    throw new UpstreamFailure("AUTH_SESSION_INVALID", "upstream refresh was rejected");
  }
  const parsed = await parseEnvelope<UpstreamLoginData>(response);
  if (parsed.kind === "malformed") {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream refresh response is malformed");
  }
  const envelope = parsed.envelope;
  if (envelope.success !== true) {
    // Only confirmed New API session-rejection codes may invalidate the
    // local session; unknown or missing codes stay availability problems.
    const code = typeof envelope.code === "string" ? envelope.code : undefined;
    throw new UpstreamFailure(
      classifyRefreshRejection(code),
      "upstream refresh was rejected",
    );
  }
  if (!envelope.data) {
    throw new UpstreamFailure("UPSTREAM_UNAVAILABLE", "upstream refresh response is malformed");
  }
  return bundleFromLoginData(response, envelope.data);
}

/**
 * Best-effort upstream logout. Never throws: the caller clears the local
 * session cookies regardless of the upstream outcome.
 */
export async function logoutUpstream(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  sid?: string | null;
}): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Origin: internalBase().origin,
    };
    if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;
    if (input.refreshToken) headers.Cookie = `new_api_refresh=${input.refreshToken}`;
    if (input.sid) headers["X-Auth-Session"] = input.sid;
    await upstreamFetch(LOGOUT_PATH, { method: "POST", headers, body: "{}" });
  } catch {
    // Upstream may already consider the session invalid — the local cookies
    // are cleared by the caller either way.
  }
}

export type SelfResult =
  | { ok: true; user: UpstreamUser; account?: UpstreamAccountFields }
  | { ok: false; status: 401 | 429 | 503; code: string };

/**
 * Raw account counters from the same /self payload (internal quota units —
 * converted to public money only inside user-mapping, never passed through).
 * Optional because older protocol responses and fixtures may omit them.
 */
export type UpstreamAccountFields = {
  quota: number;
  usedQuota: number;
  requestCount: number;
};

export async function fetchSelf(accessToken: string): Promise<SelfResult> {
  let response: Response;
  try {
    response = await upstreamFetch(SELF_PATH, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    return { ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }
  if (response.status === 429) {
    return { ok: false, status: 429, code: "RATE_LIMITED" };
  }
  if (response.status === 401 || response.status === 403) {
    const parsed = await parseEnvelope<Record<string, unknown>>(response);
    return {
      ok: false,
      status: 401,
      code:
        parsed.kind === "valid" && typeof parsed.envelope.code === "string"
          ? parsed.envelope.code
          : "AUTH_UNAUTHORIZED",
    };
  }
  if (response.status >= 500) {
    return { ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }
  const parsed = await parseEnvelope<Record<string, unknown>>(response);
  if (parsed.kind === "malformed") {
    return { ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }
  const envelope = parsed.envelope;
  if (envelope.success !== true || !envelope.data) {
    const code = typeof envelope.code === "string" ? envelope.code : undefined;
    if (code && SESSION_REJECTION_CODES.has(code)) {
      return { ok: false, status: 401, code };
    }
    return { ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }
  const user = envelope.data;
  if (
    !Number.isInteger(user.id) || (user.id as number) <= 0 ||
    typeof user.username !== "string" || !user.username ||
    typeof user.role !== "number" || !KNOWN_ROLES.has(user.role)
  ) {
    console.error("[auth] upstream self response malformed");
    return { ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" };
  }
  let account: UpstreamAccountFields | undefined;
  const quota = user.quota;
  const usedQuota = user.used_quota;
  const requestCount = user.request_count;
  if (
    typeof quota === "number" && Number.isFinite(quota) &&
    typeof usedQuota === "number" && Number.isFinite(usedQuota) &&
    typeof requestCount === "number" && Number.isInteger(requestCount) && requestCount >= 0
  ) {
    account = { quota, usedQuota, requestCount };
  }
    return {
    ok: true,
    user: {
      id: user.id as number,
      username: user.username as string,
      display_name: typeof user.display_name === "string" ? user.display_name : "",
      email: typeof user.email === "string" ? user.email : "",
      role: user.role as number,
    },
    account,
  };
}
