import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "@/app/api/v1/auth/login/route";
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

function envelope(data: unknown, success = true): string {
  return JSON.stringify({ success, message: "", data });
}

function loginRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3100/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function stubSuccessfulUpstreamLogin(refreshToken: string, role = 1): Promise<string> {
  const accessToken = `at-${randomUUID()}`;
  await withUpstream([
    { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
    {
      method: "POST",
      path: "/api/user/login",
      body: envelope(loginUpstreamData(accessToken, role)),
      setCookie: [
        `new_api_refresh=${refreshToken}; Path=/api/user/auth; Max-Age=2592000; HttpOnly; SameSite=Strict`,
      ],
    },
  ]);
  return accessToken;
}

function loginUpstreamData(accessToken: string, role: number): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    access_expires_at: now + 900,
    session: { sid: `sid-${randomUUID().slice(0, 8)}`, current: true, expires_at: now + 3600 },
    user: {
      id: 7,
      username: "ada",
      display_name: "Ada Lovelace",
      email: "ada@example.com",
      role,
      quota: 500,
      group: "vip",
      aff_code: "secret-aff",
      stripe_customer: "cus_secret",
    },
  };
}

/** Sets up the mock upstream and registers it for teardown. */
async function withUpstream(routes: Parameters<typeof startMockUpstream>[0]): Promise<void> {
  const mock = await startMockUpstream(routes);
  process.env.NEW_API_INTERNAL_URL = mock.url;
  upstream = mock;
}

describe("POST /api/v1/auth/login", () => {
  it("signs in, sets a single encrypted HttpOnly cookie and returns only the owned user DTO", async () => {
    const refreshToken = `rt-${randomUUID()}`;
    const accessToken = await stubSuccessfulUpstreamLogin(refreshToken, 100);

    const response = await POST(loginRequest({ username: "ada", password: "correct-password" }));
    expect(response.status).toBe(200);

    const body = await response.text();
    const parsed = JSON.parse(body) as { data: { status: string; user: Record<string, unknown> } };
    expect(parsed.data.status).toBe("ok");
    expect(Object.keys(parsed.data.user).sort()).toEqual(
      ["capabilities", "display_name", "email", "id", "role", "username"].sort(),
    );
    // No organization capabilities are claimed for any role (incl. root).
    expect(parsed.data.user.role).toBe("owner");
    expect(parsed.data.user.capabilities).toEqual(["console:access"]);

    // Tokens and the sealed session never appear in the JSON body.
    expect(body).not.toContain(accessToken);
    expect(body).not.toContain(refreshToken);
    expect(body).not.toContain("access_token");
    expect(body).not.toContain("new_api_refresh");

    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    const session = setCookies[0];
    expect(session).toContain("tc_session=v1.");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(session).toContain("Path=/");
    // The cookie value is opaque — no token material inside.
    expect(session).not.toContain(accessToken);
    expect(session).not.toContain(refreshToken);
    // There is no readable companion cookie.
    expect(setCookies.some((cookie) => cookie.startsWith("tc_session_hint"))).toBe(false);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns the challenge shape when the upstream requires verification", async () => {
    const flowToken = `flow-${randomUUID()}`;
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope({
          require_verification: true,
          flow_token: flowToken,
          expires_at: Math.floor(Date.now() / 1000) + 300,
          methods: [{ method: "2fa", available: true }],
        }),
      },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "correct-password" }));
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { data: { status: string; flow_token: string; methods: string[] } };
    expect(parsed.data).toEqual({
      status: "verification_required",
      flow_token: flowToken,
      methods: ["2fa"],
      expires_at: expect.any(Number),
    });
    // A challenge must not establish a session.
    expect(response.headers.getSetCookie().length).toBe(0);
  });

  it("uses one uniform error message for wrong credentials", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        status: 200,
        body: JSON.stringify({ success: false, message: "用户名或密码错误" }),
      },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "wrong" }));
    expect(response.status).toBe(401);
    const parsed = (await response.json()) as { error: { code: string; message: string } };
    expect(parsed.error.code).toBe("invalid_credentials");
    expect(parsed.error.message).toBe("Invalid username or password.");
  });

  it("propagates upstream rate limiting as 429 without touching cookies", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", status: 429, body: JSON.stringify({ success: false }) },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "pw" }));
    expect(response.status).toBe(429);
    expect(response.headers.getSetCookie().length).toBe(0);
  });

  it("sanitizes upstream outages — no upstream bodies, stacks or credentials", async () => {
    await withUpstream([
      {
        method: "GET",
        path: "/api/user/login/encryption-key",
        status: 500,
        body: "panic: goroutine 42 [running], secret=db/prod",
      },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "hunter2-secret" }));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("upstream_unavailable");
    expect(body).not.toContain("panic");
    expect(body).not.toContain("secret");
    expect(body).not.toContain("hunter2");
    expect(response.headers.getSetCookie().length).toBe(0);
  });

  it("reports BACKEND_VERSION_MISMATCH only for a real protocol gap", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", status: 404, body: "" },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "pw" }));
    expect(response.status).toBe(503);
    const parsed = (await response.json()) as { error: { code: string } };
    expect(parsed.error.code).toBe("BACKEND_VERSION_MISMATCH");
  });

  it("fails closed (503) when the session secret is missing or weak", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(loginUpstreamData(`at-${randomUUID()}`, 1)),
        setCookie: [`new_api_refresh=rt-${randomUUID()}; Path=/api/user/auth; Max-Age=2592000; HttpOnly`],
      },
    ]);

    delete process.env.AUTH_SESSION_SECRET;
    const noSecret = await POST(loginRequest({ username: "ada", password: "pw" }));
    expect(noSecret.status).toBe(503);
    expect(((await noSecret.json()) as { error: { code: string } }).error.code).toBe("sign_in_unavailable");
    expect(noSecret.headers.getSetCookie().length).toBe(0);

    process.env.AUTH_SESSION_SECRET = "short";
    const weakSecret = await POST(loginRequest({ username: "ada", password: "pw" }));
    expect(weakSecret.status).toBe(503);
  });

  it("refuses to issue an oversized session (no cookie, no leak)", async () => {
    const hugeRefresh = `rt-${"x".repeat(4_200)}`;
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(loginUpstreamData(`at-${randomUUID()}`, 1)),
        setCookie: [`new_api_refresh=${hugeRefresh}; Path=/api/user/auth; Max-Age=2592000; HttpOnly`],
      },
    ]);

    const response = await POST(loginRequest({ username: "ada", password: "pw" }));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("xxxx");
    expect(response.headers.getSetCookie().length).toBe(0);
  });

  it("enforces the origin policy for cookie-writing mutations", async () => {
    // Missing Origin and Referer → 403.
    const neither = await POST(loginRequest({ username: "ada", password: "pw" }, { origin: "" }));
    expect(neither.status).toBe(403);

    // Mismatching Origin → 403.
    const foreign = await POST(loginRequest({ username: "ada", password: "pw" }, { origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);

    // A same-origin Referer substitutes for a missing Origin.
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(loginUpstreamData(`at-${randomUUID()}`, 1)),
        setCookie: [`new_api_refresh=rt-${randomUUID()}; Path=/api/user/auth; Max-Age=2592000; HttpOnly`],
      },
    ]);
    const refererOnly = await POST(
      loginRequest({ username: "ada", password: "pw" }, { origin: "", referer: "http://localhost:3100/login" }),
    );
    expect(refererOnly.status).toBe(200);
  });

  it("rejects invalid or oversized bodies", async () => {
    const missing = await POST(loginRequest({ password: "pw" }));
    expect(missing.status).toBe(400);

    const oversized = await POST(loginRequest({ username: "a".repeat(100), password: "x".repeat(200) }));
    expect(oversized.status).toBe(400);

    const huge = new Request("http://localhost:3100/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: `{"username":"ada","password":"${"x".repeat(20_000)}"}`,
    });
    const tooLarge = await POST(huge);
    expect(tooLarge.status).toBe(400);

    // Multi-byte characters count as bytes, not JavaScript characters.
    const multibyte = new Request("http://localhost:3100/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: `{"username":"${"你".repeat(5_000)}","password":"pw"}`,
    });
    const tooLargeUtf8 = await POST(multibyte);
    expect(tooLargeUtf8.status).toBe(400);
  });
});
