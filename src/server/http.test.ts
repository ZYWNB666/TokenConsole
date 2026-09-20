import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as loginPost } from "@/app/api/v1/auth/login/route";
import { buildSessionCookies, sealSession } from "@/server/auth/session";
import {
  checkCrossOriginRead,
  checkSameOriginMutation,
  shouldSecureCookie,
} from "@/server/http";

/**
 * Origin policy tests for the cookie-writing guard: full-origin comparison
 * against a strictly validated AUTH_PUBLIC_ORIGIN, production fail-closed
 * behaviour, and the https-public-origin → Secure-cookie rule.
 */

const LOGIN_URL = "http://localhost:3100/api/v1/auth/login";

function loginRequest(origin?: string, referer?: string): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin !== undefined) headers.origin = origin;
  if (referer !== undefined) headers.referer = referer;
  return new Request(LOGIN_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ username: "ada", password: "pw" }),
  });
}

let originalNodeEnv: string | undefined;

/** NODE_ENV is typed read-only; tests mutate it through a mutable record view. */
function setNodeEnv(value: string | undefined): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  originalNodeEnv = process.env.NODE_ENV;
  delete process.env.AUTH_PUBLIC_ORIGIN;
  delete process.env.AUTH_COOKIE_SECURE;
});

afterEach(() => {
  setNodeEnv(originalNodeEnv);
  delete process.env.AUTH_PUBLIC_ORIGIN;
  delete process.env.AUTH_COOKIE_SECURE;
});

describe("AUTH_PUBLIC_ORIGIN validation", () => {
  it("rejects non-origin configurations without throwing", () => {
    const invalid = [
      "https://user:pass@console.example.com",
      "https://console.example.com/path",
      "https://console.example.com/?q=1",
      "https://console.example.com/#hash",
      "ftp://console.example.com",
      "not a url",
      "https://console.example.com:notaport",
    ];
    for (const value of invalid) {
      process.env.AUTH_PUBLIC_ORIGIN = value;
      expect(checkSameOriginMutation(loginRequest("https://console.example.com")), value).toEqual({
        ok: false,
        reason: "config_error",
      });
    }
  });

  it("accepts a pure origin with or without an explicit default port", () => {
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    expect(checkSameOriginMutation(loginRequest("https://console.example.com"))).toEqual({ ok: true });
    // The port is the scheme default, so the normalized origins match.
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com:443";
    expect(checkSameOriginMutation(loginRequest("https://console.example.com"))).toEqual({ ok: true });
  });
});

describe("full-origin comparison", () => {
  beforeEach(() => {
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    setNodeEnv("test");
  });

  it("accepts the exact same origin", () => {
    expect(checkSameOriginMutation(loginRequest("https://console.example.com"))).toEqual({ ok: true });
    expect(checkCrossOriginRead(loginRequest("https://console.example.com"))).toEqual({ ok: true });
  });

  it("rejects the same host over http, other ports and subdomains", () => {
    expect(checkSameOriginMutation(loginRequest("http://console.example.com"))).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(checkSameOriginMutation(loginRequest("https://console.example.com:8443"))).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(checkSameOriginMutation(loginRequest("https://evil.console.example.com"))).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(checkSameOriginMutation(loginRequest("https://example.com"))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("applies the same comparison to Referer fallbacks", () => {
    expect(
      checkSameOriginMutation(loginRequest(undefined, "https://console.example.com/login")),
    ).toEqual({ ok: true });
    expect(
      checkSameOriginMutation(loginRequest(undefined, "http://console.example.com/login")),
    ).toEqual({ ok: false, reason: "forbidden" });
  });
});

describe("environment fallbacks", () => {
  it("falls back to the request origin outside production", () => {
    setNodeEnv("development");
    expect(checkSameOriginMutation(loginRequest("http://localhost:3100"))).toEqual({ ok: true });
    expect(checkSameOriginMutation(loginRequest("http://other.host:3100"))).toEqual({
      ok: false,
      reason: "forbidden",
    });
  });

  it("fails closed in production without AUTH_PUBLIC_ORIGIN", async () => {
    setNodeEnv("production");
    expect(checkSameOriginMutation(loginRequest("http://localhost:3100"))).toEqual({
      ok: false,
      reason: "config_error",
    });
    expect(checkCrossOriginRead(loginRequest(undefined))).toEqual({
      ok: false,
      reason: "config_error",
    });

    // The login route surfaces this as a safe 503, not an unhandled 500.
    process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64");
    const response = await loginPost(loginRequest("http://localhost:3100"));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "origin_config_error",
    );
    delete process.env.AUTH_SESSION_SECRET;
  });

  it("fails closed in production with an invalid AUTH_PUBLIC_ORIGIN", () => {
    setNodeEnv("production");
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com/path";
    expect(checkSameOriginMutation(loginRequest("https://console.example.com"))).toEqual({
      ok: false,
      reason: "config_error",
    });
  });
});

describe("Secure cookie derivation", () => {
  it("marks cookies Secure when the public origin is https, even over an inner http request", () => {
    setNodeEnv("production");
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    const innerHttpRequest = new Request("http://internal:3000/api/v1/auth/login");
    expect(shouldSecureCookie(innerHttpRequest)).toBe(true);
  });

  it("does not let AUTH_COOKIE_SECURE=false drop Secure for https public origins in production", () => {
    setNodeEnv("production");
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    process.env.AUTH_COOKIE_SECURE = "false";
    const innerHttpRequest = new Request("http://internal:3000/api/v1/auth/login");
    expect(shouldSecureCookie(innerHttpRequest)).toBe(true);
  });

  it("honors the explicit override outside production and follows the request scheme otherwise", () => {
    setNodeEnv("development");
    expect(shouldSecureCookie(new Request("http://localhost:3100/x"))).toBe(false);
    expect(shouldSecureCookie(new Request("https://localhost:3100/x"))).toBe(true);
    process.env.AUTH_COOKIE_SECURE = "false";
    expect(shouldSecureCookie(new Request("https://localhost:3100/x"))).toBe(false);
    process.env.AUTH_COOKIE_SECURE = "true";
    expect(shouldSecureCookie(new Request("http://localhost:3100/x"))).toBe(true);
  });

  it("seals session cookies with Secure for an https public origin (integration through session.ts)", () => {
    setNodeEnv("production");
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64");
    const now = Math.floor(Date.now() / 1000);
    const sealed = sealSession({
      at: `at-${randomBytes(8).toString("hex")}`,
      ae: now + 900,
      rt: `rt-${randomBytes(8).toString("hex")}`,
      sid: `sid-${randomBytes(4).toString("hex")}`,
      exp: now + 3600,
    });
    // The request reaches the app over inner http behind the proxy.
    const cookie = buildSessionCookies(now + 3600, sealed, new Request("http://internal:3000/api/v1/auth/login"))[0];
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    delete process.env.AUTH_SESSION_SECRET;
  });
});
