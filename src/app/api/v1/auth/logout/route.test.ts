import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/auth/logout/route";
import { sealSession } from "@/server/auth/session";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/** Fixture values are generated at runtime — no credential literals in source. */

const ORIGIN = "http://localhost:3100";

let upstream: MockUpstream;

beforeEach(() => {
  process.env.AUTH_SESSION_SECRET = randomBytes(32).toString("base64");
  upstream = undefined as unknown as MockUpstream;
});

afterEach(async () => {
  delete process.env.NEW_API_INTERNAL_URL;
  delete process.env.AUTH_SESSION_SECRET;
  if (upstream) await upstream.close();
});

function sessionCookie(): { accessToken: string; refreshToken: string; sid: string; cookie: string } {
  const accessToken = `at-${randomUUID()}`;
  const refreshToken = `rt-${randomUUID()}`;
  const sid = `sid-${randomUUID().slice(0, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken,
    refreshToken,
    sid,
    cookie: `tc_session=${sealSession({ at: accessToken, ae: now + 900, rt: refreshToken, sid, exp: now + 3600 })}`,
  };
}

function logoutRequest(cookie: string | null): Request {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost:3100/api/v1/auth/logout", { method: "POST", headers });
}

describe("POST /api/v1/auth/logout", () => {
  it("calls the upstream logout with the session material and clears the cookie", async () => {
    const session = sessionCookie();
    const mock = await startMockUpstream([
      {
        method: "POST",
        path: "/api/user/auth/logout",
        status: 200,
        body: JSON.stringify({ success: true, message: "", data: { revoked_sid: session.sid } }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await POST(logoutRequest(session.cookie));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { data: { status: string } }).data.status).toBe("ok");

    const upstreamCall = mock.requests[0];
    expect(upstreamCall?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
    expect(upstreamCall?.headers.cookie).toBe(`new_api_refresh=${session.refreshToken}`);
    expect(upstreamCall?.headers["x-auth-session"]).toBe(session.sid);

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("tc_session=");
    expect(setCookies[0]).toContain("Max-Age=0");
    expect(setCookies[0]).toContain("HttpOnly");
  });

  it("still clears the local cookie when the upstream logout fails", async () => {
    const session = sessionCookie();
    const mock = await startMockUpstream([
      {
        method: "POST",
        path: "/api/user/auth/logout",
        status: 500,
        body: "boom: internal details",
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await POST(logoutRequest(session.cookie));
    expect(response.status).toBe(200);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("Max-Age=0");
  });

  it("succeeds without an upstream call when there is no session", async () => {
    const response = await POST(logoutRequest(null));
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toContain("Max-Age=0");
  });

  it("rejects cross-origin requests", async () => {
    const request = new Request("http://localhost:3100/api/v1/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
  });
});
