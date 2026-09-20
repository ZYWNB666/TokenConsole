import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildClearSessionCookies,
  buildSessionCookies,
  openSession,
  sealSession,
  SessionFailure,
  type SessionPayload,
} from "@/server/auth/session";

/**
 * Session cookie crypto tests. Fixture values are generated at runtime —
 * no credential literals in source. The test secret is a fresh random
 * 32-byte key per run.
 */

const HTTP_REQUEST = new Request("http://localhost:3100/api/v1/me");
const HTTPS_REQUEST = new Request("https://console.example.com/api/v1/me");

function freshSecret(): string {
  return randomBytes(32).toString("base64");
}

function makePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    at: `at-${randomBytes(16).toString("hex")}`,
    ae: Math.floor(Date.now() / 1000) + 900,
    rt: `sid-${randomBytes(16).toString("hex")}`,
    sid: `sid-${randomBytes(8).toString("hex")}`,
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = freshSecret();
});

afterEach(() => {
  delete process.env.AUTH_SESSION_SECRET;
  delete process.env.AUTH_COOKIE_SECURE;
});

describe("sealed session format", () => {
  it("round-trips a payload through v1 AES-256-GCM", () => {
    const payload = makePayload();
    const sealed = sealSession(payload);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed.split(".")).toHaveLength(4);
    expect(openSession(sealed)).toEqual(payload);
  });

  it("contains no plaintext or simple encoding of the token material", () => {
    const payload = makePayload();
    const sealed = sealSession(payload);
    const lower = sealed.toLowerCase();

    for (const value of [payload.at, payload.rt, payload.sid]) {
      expect(sealed).not.toContain(value);
      expect(lower).not.toContain(value.toLowerCase());
      // Neither plain JSON nor base64/base64url of the payload may appear.
      const json = Buffer.from(JSON.stringify(payload)).toString("base64");
      const jsonUrl = Buffer.from(JSON.stringify(payload)).toString("base64url");
      expect(sealed).not.toContain(json);
      expect(sealed).not.toContain(jsonUrl);
      expect(sealed).not.toContain(json.slice(0, 16));
      expect(sealed).not.toContain(jsonUrl.slice(0, 16));
    }
    expect(openSession(sealed)).toEqual(payload); // sanity: it is still valid
  });

  it("rejects any single-byte tampering (auth tag + AAD binding)", () => {
    const sealed = sealSession(makePayload());
    for (const partIndex of [1, 2, 3]) {
      const parts = sealed.split(".");
      const original = parts[partIndex];
      // Flip one character in the middle of the segment.
      const middle = Math.floor(original.length / 2);
      const flipped = original.slice(0, middle) + (original[middle] === "A" ? "B" : "A") + original.slice(middle + 1);
      parts[partIndex] = flipped;
      expect(openSession(parts.join("."))).toBeNull();
    }
    // Truncating also fails.
    expect(openSession(sealed.slice(0, -2))).toBeNull();
  });

  it("rejects a cookie sealed with a different secret", () => {
    const sealed = sealSession(makePayload());
    process.env.AUTH_SESSION_SECRET = freshSecret();
    expect(openSession(sealed)).toBeNull();
  });

  it("treats an expired session as no session", () => {
    const expired = makePayload({ exp: Math.floor(Date.now() / 1000) - 60 });
    expect(openSession(sealSession(expired))).toBeNull();
    // And an exp exactly "now" is expired as well.
    const now = makePayload({ exp: Math.floor(Date.now() / 1000) });
    expect(openSession(sealSession(now))).toBeNull();
  });

  it("rejects unknown versions and malformed inputs without throwing", () => {
    expect(openSession(null)).toBeNull();
    expect(openSession("")).toBeNull();
    expect(openSession("v2.a.b.c")).toBeNull();
    expect(openSession("not-a-cookie")).toBeNull();
    expect(openSession("v1.###.###.###")).toBeNull();
    expect(openSession("v1....")).toBeNull();
  });

  it("fails closed when the secret is missing, weak or wrongly encoded", () => {
    const sealed = sealSession(makePayload()); // sealed while the secret was valid
    delete process.env.AUTH_SESSION_SECRET;
    expect(openSession(sealed)).toBeNull(); // the read path never throws
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);

    // Arbitrary 32-character plain text is no longer accepted (no UTF-8 fallback).
    process.env.AUTH_SESSION_SECRET = "x".repeat(32);
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);
    expect(openSession("v1.a.b.c")).toBeNull();

    // Odd-length or 65-character hex strings are rejected.
    process.env.AUTH_SESSION_SECRET = "a".repeat(63);
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);
    process.env.AUTH_SESSION_SECRET = "a".repeat(65);
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);

    // Base64 with illegal characters, broken padding or non-canonical form.
    process.env.AUTH_SESSION_SECRET = `${randomBytes(32).toString("base64")}!`;
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);
    process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64").slice(0, 43); // missing padding
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);
    process.env.AUTH_SESSION_SECRET = `${randomBytes(31).toString("base64")}=`; // padding tricks
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);

    // Decodes to fewer than 32 bytes.
    process.env.AUTH_SESSION_SECRET = randomBytes(16).toString("base64");
    expect(() => sealSession(makePayload())).toThrow(SessionFailure);
  });

  it("accepts the two documented encodings: 64 hex chars and canonical base64", () => {
    const payload = makePayload();
    process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("hex");
    expect(openSession(sealSession(payload))).toEqual(payload);

    process.env.AUTH_SESSION_SECRET = randomBytes(48).toString("base64"); // >32 bytes is fine
    expect(openSession(sealSession(payload))).toEqual(payload);
  });

  it("refuses to issue cookies beyond the browser-safe size limit", () => {
    const huge = makePayload({ rt: `x`.repeat(4_096) });
    expect(() => sealSession(huge)).toThrow(SessionFailure);
    try {
      sealSession(huge);
    } catch (error) {
      // The error message must not embed the oversized credential value.
      expect((error as Error).message).not.toContain("xxxx");
    }
  });

  it("requires every payload field — no defaults, no empty fallbacks", () => {
    expect(() => sealSession(makePayload({ at: "" }))).toThrow(SessionFailure);
    expect(() => sealSession(makePayload({ rt: "" }))).toThrow(SessionFailure);
    expect(() => sealSession(makePayload({ sid: "" }))).toThrow(SessionFailure);
    expect(() => sealSession({ at: "a", ae: 1, rt: "r", sid: "s", exp: Number.NaN })).toThrow(SessionFailure);
  });
});

describe("session cookie attributes", () => {
  it("is a single HttpOnly, SameSite=Lax, site-wide cookie", () => {
    const payload = makePayload();
    const cookies = buildSessionCookies(payload.exp, sealSession(payload), HTTP_REQUEST);
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0];
    expect(cookie).toContain("tc_session=v1.");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toMatch(/Max-Age=\d+/);
    // There is intentionally no readable companion cookie.
    expect(cookie).not.toContain("tc_session_hint");
  });

  it("adds Secure on https requests and respects the explicit override", () => {
    const payload = makePayload();
    const seal = sealSession(payload);
    expect(buildSessionCookies(payload.exp, seal, HTTPS_REQUEST)[0]).toContain("Secure");
    expect(buildSessionCookies(payload.exp, seal, HTTP_REQUEST)[0]).not.toContain("Secure");

    process.env.AUTH_COOKIE_SECURE = "true";
    expect(buildSessionCookies(payload.exp, seal, HTTP_REQUEST)[0]).toContain("Secure");
    process.env.AUTH_COOKIE_SECURE = "false";
    expect(buildSessionCookies(payload.exp, seal, HTTPS_REQUEST)[0]).not.toContain("Secure");
  });

  it("caps the cookie lifetime at 30 days", () => {
    const farFuture = makePayload({ exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 });
    const cookie = buildSessionCookies(farFuture.exp, sealSession(farFuture), HTTP_REQUEST)[0];
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie)?.[1]);
    expect(maxAge).toBe(30 * 24 * 60 * 60);
  });
});

describe("clearing the session", () => {
  it("expires the single cookie immediately", () => {
    const cookies = buildClearSessionCookies(HTTP_REQUEST);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("tc_session=");
    expect(cookies[0]).toContain("Max-Age=0");
    expect(cookies[0]).toContain("Expires=Thu, 01 Jan 1970");
    expect(cookies[0]).toContain("HttpOnly");
  });
});
