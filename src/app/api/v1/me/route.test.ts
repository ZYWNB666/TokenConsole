import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/me/route";
import { sealSession } from "@/server/auth/session";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/** Fixture values are generated at runtime — no credential literals in source. */

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

const SELF_USER = {
  id: 7,
  username: "ada",
  display_name: "Ada Lovelace",
  email: "ada@example.com",
  role: 1,
  // Account counters in internal quota units — converted to public USD by
  // the BFF (500,000 quota = $1): 5,000,000 → $10.00, 1,250,000 → $2.50.
  quota: 5_000_000,
  used_quota: 1_250_000,
  request_count: 42,
  // Fields that must never reach the browser, even converted:
  group: "vip",
  aff_code: "aff-secret",
  stripe_customer: "cus_secret",
  github_id: 12345,
};

function makeSession(): { accessToken: string; refreshToken: string; cookie: string } {
  const accessToken = `at-${randomUUID()}`;
  const refreshToken = `rt-${randomUUID()}`;
  const sid = `sid-${randomUUID().slice(0, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  const sealed = sealSession({
    at: accessToken,
    ae: now + 900,
    rt: refreshToken,
    sid,
    exp: now + 3600,
  });
  return { accessToken, refreshToken, cookie: `tc_session=${sealed}` };
}

function meRequest(cookie: string | null, headers: Record<string, string> = {}): Request {
  const requestHeaders: Record<string, string> = { ...headers };
  if (cookie) requestHeaders.cookie = cookie;
  return new Request("http://localhost:3100/api/v1/me", { method: "GET", headers: requestHeaders });
}

function selfBody(role = 1): string {
  return JSON.stringify({ success: true, message: "", data: { ...SELF_USER, role } });
}

function refreshSuccess(accessToken: string, refreshToken: string): {
  method: string;
  path: string;
  body: string;
  setCookie: string[];
} {
  const now = Math.floor(Date.now() / 1000);
  return {
    method: "POST",
    path: "/api/user/auth/refresh",
    body: JSON.stringify({
      success: true,
      message: "",
      data: {
        access_token: accessToken,
        token_type: "Bearer",
        access_expires_at: now + 900,
        session: { sid: `sid2-${randomUUID().slice(0, 8)}`, expires_at: now + 3600 },
        user: SELF_USER,
      },
    }),
    setCookie: [`new_api_refresh=${refreshToken}; Path=/api/user/auth; Max-Age=2592000; HttpOnly`],
  };
}

describe("GET /api/v1/me", () => {
  it("returns the allowlisted user and never leaks tokens or upstream fields", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/self", body: selfBody() },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(meRequest(session.cookie));
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as {
      data: Record<string, unknown> & {
        account?: { balance_usd: number; used_usd: number; request_count: number };
      };
    };
    expect(Object.keys(parsed.data).sort()).toEqual(
      ["account", "capabilities", "display_name", "email", "id", "role", "username"].sort(),
    );
    // Account counters arrive as public USD values, not internal quota units.
    expect(parsed.data.account).toEqual({
      balance_usd: 10,
      used_usd: 2.5,
      request_count: 42,
    });
    expect(body).not.toContain(session.accessToken);
    expect(body).not.toContain(session.refreshToken);
    expect(body).not.toContain("tc_session=");
    for (const forbidden of ["quota", "group", "aff", "stripe_customer", "github_id", "5000000", "1250000"]) {
      expect(body).not.toContain(forbidden);
    }
    expect(mock.requests[0]?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it("grants no organization capabilities even for upstream admins/owners", async () => {
    for (const role of [10, 100]) {
      const session = makeSession();
      const mock = await startMockUpstream([
        { method: "GET", path: "/api/user/self", body: selfBody(role) },
      ]);
      process.env.NEW_API_INTERNAL_URL = mock.url;
      upstream = mock;

      const response = await GET(meRequest(session.cookie));
      const parsed = (await response.json()) as { data: { role: string; capabilities: string[] } };
      expect(parsed.data.capabilities).toEqual(["console:access"]);
      expect(parsed.data.capabilities).not.toContain("org:manage");
      await upstream.close();
      upstream = undefined as unknown as MockUpstream;
    }
  });

  it("refreshes exactly once when the access token is expired, then retries", async () => {
    const session = makeSession();
    const newAccess = `at2-${randomUUID()}`;
    const newRefresh = `rt2-${randomUUID()}`;
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/self",
        replies: [
          {
            status: 401,
            body: JSON.stringify({ success: false, code: "AUTH_TOKEN_EXPIRED", message: "Unauthorized" }),
          },
          { status: 200, body: selfBody() },
        ],
      },
      refreshSuccess(newAccess, newRefresh),
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(meRequest(session.cookie));
    expect(response.status).toBe(200);

    const refreshCalls = mock.requests.filter((request) => request.url === "/api/user/auth/refresh");
    const selfCalls = mock.requests.filter((request) => request.url === "/api/user/self");
    expect(refreshCalls).toHaveLength(1);
    expect(selfCalls).toHaveLength(2);
    expect(selfCalls[1]?.headers.authorization).toBe(`Bearer ${newAccess}`);
    expect(refreshCalls[0]?.headers.cookie).toBe(`new_api_refresh=${session.refreshToken}`);

    // The rotated session is written back as a fresh encrypted HttpOnly cookie.
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("tc_session=v1.");
    expect(setCookies[0]).toContain("HttpOnly");
  });

  it("clears the session cookies and returns 401 when the refresh is rejected", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/self",
        status: 401,
        body: JSON.stringify({ success: false, code: "AUTH_TOKEN_EXPIRED", message: "Unauthorized" }),
      },
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 401,
        body: JSON.stringify({ success: false, code: "AUTH_SESSION_REVOKED", message: "Unauthorized" }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(meRequest(session.cookie));
    expect(response.status).toBe(401);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(setCookies[0]).toContain("tc_session=");
    expect(setCookies[0]).toContain("Max-Age=0");
  });

  it("keeps the session (no clear-cookie headers) when the upstream is unavailable", async () => {
    for (const [status, expected] of [[500, 503], [503, 503], [429, 429]] as const) {
      const session = makeSession();
      const mock = await startMockUpstream([
        {
          method: "GET",
          path: "/api/user/self",
          replies: [
            {
              status: 401,
              body: JSON.stringify({ success: false, code: "AUTH_TOKEN_EXPIRED", message: "Unauthorized" }),
            },
          ],
        },
        {
          method: "POST",
          path: "/api/user/auth/refresh",
          status,
          body: JSON.stringify({ success: false }),
        },
      ]);
      process.env.NEW_API_INTERNAL_URL = mock.url;
      upstream = mock;

      const response = await GET(meRequest(session.cookie));
      expect(response.status).toBe(expected);
      // Availability failures must not produce any Set-Cookie header.
      expect(response.headers.getSetCookie().length).toBe(0);

      await upstream.close();
      upstream = undefined as unknown as MockUpstream;
    }
  });

  it("keeps the session when the first self call is rate limited", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/self", status: 429, body: JSON.stringify({ success: false }) },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(meRequest(session.cookie));
    expect(response.status).toBe(429);
    expect(response.headers.getSetCookie().length).toBe(0);
    // No refresh was attempted for a non-auth failure.
    expect(mock.requests.filter((request) => request.url === "/api/user/auth/refresh")).toHaveLength(0);
  });

  it("returns 401 without any upstream call when there is no session cookie", async () => {
    const response = await GET(meRequest(null));
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("unauthenticated");
  });

  it("treats a tampered session cookie as unauthenticated", async () => {
    const session = makeSession();
    const tampered = `${session.cookie.slice(0, -3)}AAA`;
    const response = await GET(meRequest(tampered));
    expect(response.status).toBe(401);
  });

  it("rejects a present-but-mismatching origin", async () => {
    const session = makeSession();
    const response = await GET(meRequest(session.cookie, { origin: "https://evil.example" }));
    expect(response.status).toBe(403);
  });
});
