import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/auth/refresh/route";
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

function refreshRequest(cookie: string | null): Request {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost:3100/api/v1/auth/refresh", { method: "POST", headers });
}

function sessionCookie(): { refreshToken: string; sid: string; cookie: string } {
  const refreshToken = `rt-${randomUUID()}`;
  const sid = `sid-${randomUUID().slice(0, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  return {
    refreshToken,
    sid,
    cookie: `tc_session=${sealSession({ at: `at-${randomUUID()}`, ae: now + 900, rt: refreshToken, sid, exp: now + 3600 })}`,
  };
}

function refreshSuccessRoute(): { body: string; setCookie: string[] } {
  const now = Math.floor(Date.now() / 1000);
  return {
    body: JSON.stringify({
      success: true,
      message: "",
      data: {
        access_token: `at2-${randomUUID()}`,
        token_type: "Bearer",
        access_expires_at: now + 900,
        session: { sid: `sid2-${randomUUID().slice(0, 8)}`, expires_at: now + 3600 },
        user: { id: 7, username: "ada", display_name: "Ada", email: "ada@example.com", role: 1 },
      },
    }),
    setCookie: [`new_api_refresh=rt2-${randomUUID()}; Path=/api/user/auth; Max-Age=2592000; HttpOnly`],
  };
}

async function withRoutes(routes: Parameters<typeof startMockUpstream>[0]): Promise<void> {
  const mock = await startMockUpstream(routes);
  process.env.NEW_API_INTERNAL_URL = mock.url;
  upstream = mock;
}

describe("POST /api/v1/auth/refresh", () => {
  it("rotates the session and re-issues a single encrypted cookie", async () => {
    const session = sessionCookie();
    const success = refreshSuccessRoute();
    await withRoutes([
      { method: "POST", path: "/api/user/auth/refresh", body: success.body, setCookie: success.setCookie },
    ]);

    const response = await POST(refreshRequest(session.cookie));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(((JSON.parse(body) as { data: { status: string } }).data.status)).toBe("ok");
    // No token material in the JSON body.
    expect(body).not.toContain("access_token");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("tc_session=v1.");
    expect(setCookies[0]).toContain("HttpOnly");

    // The upstream call carried the refresh cookie and session id.
    const call = upstream.requests[0];
    expect(call?.headers.cookie).toBe(`new_api_refresh=${session.refreshToken}`);
    expect(call?.headers["x-auth-session"]).toBe(session.sid);
  });

  it("clears the cookie and returns 401 when the upstream rejects the refresh", async () => {
    const session = sessionCookie();
    await withRoutes([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 401,
        body: JSON.stringify({ success: false, code: "AUTH_SESSION_REVOKED", message: "Unauthorized" }),
      },
    ]);

    const response = await POST(refreshRequest(session.cookie));
    expect(response.status).toBe(401);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("Max-Age=0");
  });

  it("keeps the existing session on 429, 5xx and timeout", async () => {
    for (const [status, expected] of [[429, 429], [500, 503], [503, 503]] as const) {
      const session = sessionCookie();
      await withRoutes([
        { method: "POST", path: "/api/user/auth/refresh", status, body: JSON.stringify({ success: false }) },
      ]);

      const response = await POST(refreshRequest(session.cookie));
      expect(response.status).toBe(expected);
      // Availability failures must not produce any Set-Cookie header.
      expect(response.headers.getSetCookie().length).toBe(0);

      await upstream.close();
      upstream = undefined as unknown as MockUpstream;
    }
  });

  it("treats a malformed HTTP 200 as unavailable: 503, no Set-Cookie, session untouched", async () => {
    for (const body of ["not json", "", "[]", "{}", '{"success":true}']) {
      const session = sessionCookie();
      await withRoutes([
        { method: "POST", path: "/api/user/auth/refresh", status: 200, body },
      ]);

      const response = await POST(refreshRequest(session.cookie));
      expect(response.status, body).toBe(503);
      // No Set-Cookie at all — the original tc_session stays in the browser.
      expect(response.headers.getSetCookie().length, body).toBe(0);
      const parsed = (await response.json()) as { error: { code: string } };
      expect(parsed.error.code).toBe("upstream_unavailable");

      await upstream.close();
      upstream = undefined as unknown as MockUpstream;
    }
  });

  it("clears the session only for confirmed rejection codes in a 200 envelope", async () => {
    const session = sessionCookie();
    await withRoutes([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 200,
        body: JSON.stringify({ success: false, code: "AUTH_SESSION_REVOKED", message: "no" }),
      },
    ]);
    const revoked = await POST(refreshRequest(session.cookie));
    expect(revoked.status).toBe(401);
    expect(revoked.headers.getSetCookie()[0]).toContain("Max-Age=0");

    const session2 = sessionCookie();
    await withRoutes([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 200,
        body: JSON.stringify({ success: false, code: "MYSTERY_CODE", message: "no" }),
      },
    ]);
    const unknown = await POST(refreshRequest(session2.cookie));
    expect(unknown.status).toBe(503);
    expect(unknown.headers.getSetCookie().length).toBe(0);
  });

  it("returns 401 with a cleared cookie when there is no session", async () => {
    const response = await POST(refreshRequest(null));
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()[0]).toContain("Max-Age=0");
  });

  it("enforces the origin policy", async () => {
    const response = await POST(
      new Request("http://localhost:3100/api/v1/auth/refresh", {
        method: "POST",
        headers: { origin: "https://evil.example" },
      }),
    );
    expect(response.status).toBe(403);
  });
});
