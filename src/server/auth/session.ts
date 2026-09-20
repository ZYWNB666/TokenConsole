import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

import { SESSION_COOKIE } from "@/lib/auth-cookies";
import { shouldSecureCookie } from "@/server/http";

/**
 * Encrypted BFF session cookie.
 *
 * Format: `v1.<iv>.<ciphertext>.<auth-tag>` — AES-256-GCM over the JSON
 * session payload, with the cookie name plus protocol version as additional
 * authenticated data (AAD). The key comes from the server-only
 * AUTH_SESSION_SECRET environment variable (>= 32 random bytes, see README).
 *
 * There is deliberately no fallback to an unencrypted format: any tampered
 * byte, unknown version, wrong key, malformed field or expired session
 * yields `null` (no session) — never a partial one.
 */

const PROTOCOL_VERSION = "v1";
const AAD = `${SESSION_COOKIE}:${PROTOCOL_VERSION}`;
const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
/** Stay well below the ~4 KB per-cookie browser limit. */
const MAX_COOKIE_VALUE_BYTES = 3600;
const MIN_SECRET_BYTES = 32;

export type SessionPayload = {
  /** Upstream access token (bearer for BFF → New API calls). */
  at: string;
  /** Access token expiry, unix seconds. */
  ae: number;
  /** Upstream refresh token (rotated by the fork on each refresh). */
  rt: string;
  /** Upstream login session id, sent as X-Auth-Session on refresh/logout. */
  sid: string;
  /** Upstream login session expiry, unix seconds — the cookie's own TTL. */
  exp: number;
};

export type SessionFailureCode = "SESSION_SECRET_INVALID" | "SESSION_TOO_LARGE";

export class SessionFailure extends Error {
  readonly code: SessionFailureCode;

  constructor(code: SessionFailureCode, message: string) {
    super(message);
    this.name = "SessionFailure";
    this.code = code;
  }
}

/**
 * Decodes a canonical Base64 string (strict charset, correct padding, and a
 * byte-exact round trip) or returns null. Non-canonical encodings are
 * rejected rather than leniently parsed.
 */
function strictBase64Bytes(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) return null;
  return decoded;
}

/**
 * Derives the AES-256 key from AUTH_SESSION_SECRET. Only two encodings are
 * accepted — exactly 64 hexadecimal characters (32 bytes) or canonical
 * Base64 decoding to at least 32 bytes (e.g. `openssl rand -base64 32`).
 * Anything else — including arbitrary text — fails closed via
 * SESSION_SECRET_INVALID in every environment.
 */
function deriveKey(): Buffer {
  const raw = process.env.AUTH_SESSION_SECRET;
  if (!raw) {
    throw new SessionFailure("SESSION_SECRET_INVALID", "AUTH_SESSION_SECRET is not configured");
  }
  let material: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    material = Buffer.from(raw, "hex");
  } else {
    material = strictBase64Bytes(raw);
  }
  if (material === null || material.length < MIN_SECRET_BYTES) {
    throw new SessionFailure(
      "SESSION_SECRET_INVALID",
      "AUTH_SESSION_SECRET must be 64 hex characters or canonical Base64 encoding at least 32 bytes",
    );
  }
  return createHash("sha256").update(material).digest();
}

function isValidPayloadShape(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.at === "string" && payload.at.length > 0 &&
    typeof payload.rt === "string" && payload.rt.length > 0 &&
    typeof payload.sid === "string" && payload.sid.length > 0 &&
    typeof payload.ae === "number" && Number.isFinite(payload.ae) &&
    typeof payload.exp === "number" && Number.isFinite(payload.exp)
  );
}

/** Encrypts and authenticates a session payload into the cookie value. */
export function sealSession(payload: SessionPayload): string {
  if (!isValidPayloadShape(payload)) {
    throw new SessionFailure("SESSION_TOO_LARGE", "session payload is malformed");
  }
  const key = deriveKey();
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(AAD, "utf8"));
  const plaintext = Buffer.from(JSON.stringify({ ...payload, v: 1 }), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const value = [
    PROTOCOL_VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
  if (Buffer.byteLength(value, "utf8") > MAX_COOKIE_VALUE_BYTES) {
    // Server-side only; the message deliberately carries no session values.
    throw new SessionFailure(
      "SESSION_TOO_LARGE",
      "session cookie exceeds the browser-safe size limit",
    );
  }
  return value;
}

/**
 * Verifies and decrypts a session cookie value. Every failure mode — missing
 * cookie, wrong version, tampering, wrong key, malformed fields, expiry —
 * returns null: the caller treats the request as unauthenticated.
 */
export function openSession(cookieValue: string | null | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4 || parts[0] !== PROTOCOL_VERSION) return null;
  let key: Buffer;
  try {
    key = deriveKey();
  } catch {
    // Without a valid key nothing can be trusted: fail closed as "no session".
    return null;
  }
  try {
    const iv = Buffer.from(parts[1] ?? "", "base64url");
    const ciphertext = Buffer.from(parts[2] ?? "", "base64url");
    const tag = Buffer.from(parts[3] ?? "", "base64url");
    if (iv.length !== GCM_IV_BYTES || tag.length !== GCM_TAG_BYTES || ciphertext.length === 0) {
      return null;
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(AAD, "utf8"));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const parsed: unknown = JSON.parse(plaintext);
    if (!isValidPayloadShape(parsed)) return null;
    if (parsed.exp <= Math.floor(Date.now() / 1000)) return null; // expired
    // Rebuild explicitly so the envelope's version marker never escapes.
    return { at: parsed.at, ae: parsed.ae, rt: parsed.rt, sid: parsed.sid, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** Cookie lifetime follows the upstream session expiry, capped at 30 days. */
function sessionMaxAge(expiresAt: number): number {
  const remaining = expiresAt - Math.floor(Date.now() / 1000);
  return Math.min(Math.max(remaining, 60), 30 * 24 * 60 * 60);
}

/**
 * The single HttpOnly session cookie (Path=/ so server components and the
 * BFF routes can both read it). No readable companion cookie exists. The
 * Secure attribute follows server/http.ts rules (an https public origin
 * implies Secure even behind an http proxy).
 */
export function buildSessionCookies(expiresAt: number, sealed: string, request: Request): string[] {
  return [
    [
      `${SESSION_COOKIE}=${sealed}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${sessionMaxAge(expiresAt)}`,
      shouldSecureCookie(request) ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; "),
  ];
}

export function buildClearSessionCookies(request: Request): string[] {
  return [
    [
      `${SESSION_COOKIE}=`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      shouldSecureCookie(request) ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; "),
  ];
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    const key = pair.slice(0, separator).trim();
    if (key !== name) continue;
    return pair.slice(separator + 1).trim() || null;
  }
  return null;
}

export function readSession(request: Request): SessionPayload | null {
  return openSession(readCookie(request, SESSION_COOKIE));
}
