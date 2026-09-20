import { generateKeyPairSync, privateDecrypt, constants as cryptoConstants, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  fetchSelf,
  loginWithPassword,
  refreshSession,
  UpstreamFailure,
  verifyLoginCode,
  type UpstreamLoginOutcome,
} from "@/server/adapters/new-api/auth";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/** Fixture values are generated at runtime — no credential literals in source. */

let upstream: MockUpstream;

beforeEach(() => {
  upstream = undefined as unknown as MockUpstream;
});

afterEach(async () => {
  delete process.env.NEW_API_INTERNAL_URL;
  delete process.env.NEW_API_TIMEOUT_MS;
  if (upstream) await upstream.close();
});

async function withUpstream(
  routes: Parameters<typeof startMockUpstream>[0],
): Promise<MockUpstream> {
  const mock = await startMockUpstream(routes);
  process.env.NEW_API_INTERNAL_URL = mock.url;
  upstream = mock;
  return mock;
}

function envelope(data: unknown, success = true): string {
  return JSON.stringify({ success, message: "", data });
}

function selfUser(role = 1) {
  return {
    id: 7,
    username: "ada",
    display_name: "Ada Lovelace",
    email: "ada@example.com",
    role,
  };
}

function loginData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: `at-${randomUUID()}`,
    token_type: "Bearer",
    access_expires_at: now + 900,
    session: { sid: `sid-${randomUUID().slice(0, 8)}`, current: true, expires_at: now + 3600 },
    user: selfUser(),
    ...overrides,
  };
}

const REFRESH_COOKIE = (token: string) => [
  `new_api_refresh=${token}; Path=/api/user/auth; Max-Age=2592000; HttpOnly; SameSite=Strict`,
];

async function rejectionCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "RESOLVED";
  } catch (error) {
    if (error instanceof UpstreamFailure) return error.code;
    return `NON_UPSTREAM:${(error as Error).name}`;
  }
}

describe("failure taxonomy", () => {
  it("maps a connection failure to UPSTREAM_UNAVAILABLE, never a version mismatch", async () => {
    // Port 9 (discard) — nothing is listening there.
    process.env.NEW_API_INTERNAL_URL = "http://127.0.0.1:9";
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("maps an upstream timeout to UPSTREAM_UNAVAILABLE", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", delayMs: 1_200 },
    ]);
    process.env.NEW_API_TIMEOUT_MS = "300";
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("maps encryption-key 404 to BACKEND_VERSION_MISMATCH, but 5xx to UPSTREAM_UNAVAILABLE", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", status: 404, body: "" },
    ]);
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("BACKEND_VERSION_MISMATCH");

    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", status: 503, body: "unavailable" },
    ]);
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("maps login/verify 429 to RATE_LIMITED", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      { method: "POST", path: "/api/user/login", status: 429, body: JSON.stringify({ success: false }) },
    ]);
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("RATE_LIMITED");

    await withUpstream([
      {
        method: "POST",
        path: "/api/user/login/verify",
        status: 429,
        body: JSON.stringify({ success: false }),
      },
    ]);
    expect(await rejectionCode(verifyLoginCode("flow", "2fa", "123456"))).toBe("RATE_LIMITED");
  });

  it("maps refresh rejections, outages and rate limits distinctly", async () => {
    await withUpstream([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 409,
        body: JSON.stringify({ success: false, code: "AUTH_REFRESH_RACE" }),
      },
    ]);
    expect(await rejectionCode(refreshSession("stale", undefined))).toBe("AUTH_SESSION_INVALID");

    await withUpstream([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 429,
        body: JSON.stringify({ success: false }),
      },
    ]);
    expect(await rejectionCode(refreshSession("stale", undefined))).toBe("RATE_LIMITED");

    await withUpstream([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 500,
        body: "internal",
      },
    ]);
    expect(await rejectionCode(refreshSession("stale", undefined))).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("malformed HTTP 200 responses are availability problems, never rejections", () => {
  const malformedBodies = [
    "not json at all",
    "",
    "[]",
    "{}",
    '{"success":true}',
    "null",
    '"a string"',
  ];

  async function loginMalformed(body: string): Promise<string> {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      { method: "POST", path: "/api/user/login", status: 200, body },
    ]);
    return rejectionCode(loginWithPassword("ada", "pw"));
  }

  async function verifyMalformed(body: string): Promise<string> {
    await withUpstream([
      { method: "POST", path: "/api/user/login/verify", status: 200, body },
    ]);
    return rejectionCode(verifyLoginCode("flow", "2fa", "123456"));
  }

  async function refreshMalformed(body: string): Promise<string> {
    await withUpstream([
      { method: "POST", path: "/api/user/auth/refresh", status: 200, body },
    ]);
    return rejectionCode(refreshSession("rt", undefined));
  }

  it("login: every malformed shape maps to UPSTREAM_UNAVAILABLE", async () => {
    for (const body of malformedBodies) {
      expect(await loginMalformed(body), body).toBe("UPSTREAM_UNAVAILABLE");
    }
  });

  it("verify: every malformed shape maps to UPSTREAM_UNAVAILABLE", async () => {
    for (const body of malformedBodies) {
      expect(await verifyMalformed(body), body).toBe("UPSTREAM_UNAVAILABLE");
    }
  });

  it("refresh: every malformed shape maps to UPSTREAM_UNAVAILABLE", async () => {
    for (const body of malformedBodies) {
      expect(await refreshMalformed(body), body).toBe("UPSTREAM_UNAVAILABLE");
    }
  });

  it("refresh: only confirmed session-rejection codes clear the session", async () => {
    for (const code of ["AUTH_SESSION_REVOKED", "AUTH_TOKEN_EXPIRED", "AUTH_UNAUTHORIZED", "AUTH_SESSION_MISMATCH", "AUTH_REFRESH_RACE"]) {
      await withUpstream([
        {
          method: "POST",
          path: "/api/user/auth/refresh",
          status: 200,
          body: JSON.stringify({ success: false, code, message: "no" }),
        },
      ]);
      expect(await rejectionCode(refreshSession("rt", undefined)), code).toBe("AUTH_SESSION_INVALID");
    }
  });

  it("refresh: unknown, missing and non-session codes stay availability problems", async () => {
    for (const body of [
      JSON.stringify({ success: false, code: "SOMETHING_ELSE", message: "no" }),
      JSON.stringify({ success: false, message: "no" }),
      JSON.stringify({ success: false, code: "AUTH_SESSION_LIMIT", message: "no" }),
    ]) {
      await withUpstream([
        { method: "POST", path: "/api/user/auth/refresh", status: 200, body },
      ]);
      expect(await rejectionCode(refreshSession("rt", undefined)), body).toBe("UPSTREAM_UNAVAILABLE");
    }

    await withUpstream([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        status: 200,
        body: JSON.stringify({ success: false, code: "AUTH_SESSION_ISSUANCE_LIMIT", message: "no" }),
      },
    ]);
    expect(await rejectionCode(refreshSession("rt", undefined))).toBe("RATE_LIMITED");
  });

  it("login and verify keep explicit rejections distinct from malformed bodies", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        status: 200,
        body: JSON.stringify({ success: false, message: "用户名或密码错误" }),
      },
    ]);
    expect(await rejectionCode(loginWithPassword("ada", "pw"))).toBe("INVALID_CREDENTIALS");

    await withUpstream([
      {
        method: "POST",
        path: "/api/user/login/verify",
        status: 200,
        body: JSON.stringify({ success: false, message: "bad code" }),
      },
    ]);
    expect(await rejectionCode(verifyLoginCode("flow", "2fa", "000000"))).toBe("VERIFICATION_FAILED");
  });
});

describe("strict upstream auth-success validation", () => {
  async function loginOutcomeWith(data: Record<string, unknown>, setCookie?: string[]): Promise<unknown> {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(data),
        ...(setCookie ? { setCookie } : {}),
      },
    ]);
    return loginWithPassword("ada", "correct-password");
  }

  it("rejects a success response without an access token", async () => {
    const data = loginData();
    delete data.access_token;
    expect(await rejectionCode(loginOutcomeWith(data))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("rejects a success response without the rotated refresh cookie", async () => {
    expect(await rejectionCode(loginOutcomeWith(loginData()))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("rejects a missing or past session expiry — no invented 30-day fallback", async () => {
    const token = `rt-${randomUUID()}`;
    const past = loginData({
      session: { sid: `sid-${randomUUID().slice(0, 8)}`, expires_at: Math.floor(Date.now() / 1000) - 10 },
    });
    expect(await rejectionCode(loginOutcomeWith(past, REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");

    const missing = loginData({ session: { sid: `sid-${randomUUID().slice(0, 8)}` } });
    expect(await rejectionCode(loginOutcomeWith(missing, REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("rejects an invalid user id, empty username or unknown role", async () => {
    const token = `rt-${randomUUID()}`;
    expect(await rejectionCode(loginOutcomeWith(loginData({ user: { ...selfUser(), id: 0 } }), REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");
    expect(await rejectionCode(loginOutcomeWith(loginData({ user: { ...selfUser(), username: "" } }), REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");
    expect(await rejectionCode(loginOutcomeWith(loginData({ user: { ...selfUser(), role: 2 } }), REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("rejects a past access_expires_at", async () => {
    const token = `rt-${randomUUID()}`;
    const data = loginData({ access_expires_at: Math.floor(Date.now() / 1000) - 5 });
    expect(await rejectionCode(loginOutcomeWith(data, REFRESH_COOKIE(token)))).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("loginWithPassword", () => {
  it("maps a successful upstream login into an authenticated bundle", async () => {
    const accessToken = `at-${randomUUID()}`;
    const refreshToken = `rt-${randomUUID()}`;
    const sid = `sid-${randomUUID().slice(0, 8)}`;
    const mock = await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(loginData({ access_token: accessToken, session: { sid, current: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } })),
        setCookie: REFRESH_COOKIE(refreshToken),
      },
    ]);

    const outcome: UpstreamLoginOutcome = await loginWithPassword("ada", "correct-password");

    expect(outcome.kind).toBe("authenticated");
    if (outcome.kind !== "authenticated") return;
    expect(outcome.bundle.accessToken).toBe(accessToken);
    expect(outcome.bundle.refreshToken).toBe(refreshToken);
    expect(outcome.bundle.refreshMaxAge).toBe(2_592_000);
    expect(outcome.bundle.sessionSid).toBe(sid);
    expect(outcome.bundle.user.username).toBe("ada");

    const loginRequest = mock.requests.find((request) => request.url === "/api/user/login");
    expect(loginRequest?.body).toBe(JSON.stringify({ username: "ada", password: "correct-password" }));
  });

  it("encrypts the password with RSA-OAEP/SHA-256 when the fork enables encryption", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const kid = `kid-${randomUUID().slice(0, 12)}`;
    const refreshToken = `rt-${randomUUID()}`;
    const mock = await withUpstream([
      {
        method: "GET",
        path: "/api/user/login/encryption-key",
        body: envelope({ enabled: true, kid, public_key: publicKey }),
      },
      {
        method: "POST",
        path: "/api/user/login",
        body: envelope(loginData()),
        setCookie: REFRESH_COOKIE(refreshToken),
      },
    ]);

    const password = `pw-${randomUUID()}`;
    const outcome = await loginWithPassword("ada", password);
    expect(outcome.kind).toBe("authenticated");

    const loginBody = JSON.parse(
      mock.requests.find((request) => request.url === "/api/user/login")?.body ?? "{}",
    ) as Record<string, string>;
    expect(loginBody).not.toHaveProperty("password");
    expect(loginBody.encryption_key_id).toBe(kid);
    expect(typeof loginBody.password_encrypted).toBe("string");

    const decrypted = privateDecrypt(
      { key: privateKey, padding: cryptoConstants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(loginBody.password_encrypted, "base64"),
    );
    expect(decrypted.toString("utf8")).toBe(password);
  });

  it("maps a verification challenge", async () => {
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

    const outcome = await loginWithPassword("ada", "correct-password");
    expect(outcome).toEqual({
      kind: "verification_required",
      flowToken,
      methods: ["2fa"],
      expiresAt: expect.any(Number),
    });
  });

  it("collapses upstream credential rejections into INVALID_CREDENTIALS", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/login/encryption-key", body: envelope({ enabled: false }) },
      {
        method: "POST",
        path: "/api/user/login",
        status: 200,
        body: JSON.stringify({ success: false, message: "用户名或密码错误" }),
      },
    ]);
    expect(await rejectionCode(loginWithPassword("ada", "wrong"))).toBe("INVALID_CREDENTIALS");
  });
});

describe("verifyLoginCode", () => {
  it("completes a 2fa verification into a bundle", async () => {
    const refreshToken = `rt-${randomUUID()}`;
    const flowToken = `flow-${randomUUID()}`;
    const mock = await withUpstream([
      {
        method: "POST",
        path: "/api/user/login/verify",
        body: envelope(loginData()),
        setCookie: REFRESH_COOKIE(refreshToken),
      },
    ]);

    const outcome = await verifyLoginCode(flowToken, "2fa", "123456");
    expect(outcome.kind).toBe("authenticated");
    const sent = JSON.parse(mock.requests[0]?.body ?? "{}") as Record<string, string>;
    expect(sent).toEqual({ flow_token: flowToken, method: "2fa", code: "123456" });
  });

  it("maps a rejected code to VERIFICATION_FAILED", async () => {
    await withUpstream([
      {
        method: "POST",
        path: "/api/user/login/verify",
        status: 200,
        body: JSON.stringify({ success: false, code: "VERIFICATION_CODE_INVALID", message: "no" }),
      },
    ]);
    expect(await rejectionCode(verifyLoginCode("flow", "2fa", "000000"))).toBe("VERIFICATION_FAILED");
  });
});

describe("refreshSession", () => {
  it("returns a rotated bundle and sends the cookie + X-Auth-Session headers", async () => {
    const accessToken = `at2-${randomUUID()}`;
    const refreshToken = `rt2-${randomUUID()}`;
    const sid = `sid-${randomUUID().slice(0, 8)}`;
    const currentRefresh = `rt1-${randomUUID()}`;
    const mock = await withUpstream([
      {
        method: "POST",
        path: "/api/user/auth/refresh",
        body: envelope(loginData({ access_token: accessToken, session: { sid, current: true, expires_at: Math.floor(Date.now() / 1000) + 3600 } })),
        setCookie: REFRESH_COOKIE(refreshToken),
      },
    ]);

    const bundle = await refreshSession(currentRefresh, sid);
    expect(bundle.accessToken).toBe(accessToken);
    expect(bundle.refreshToken).toBe(refreshToken);

    const request = mock.requests[0];
    expect(request?.headers.cookie).toBe(`new_api_refresh=${currentRefresh}`);
    expect(request?.headers["x-auth-session"]).toBe(sid);
    expect(typeof request?.headers.origin).toBe("string");
  });
});

describe("fetchSelf", () => {
  it("returns the upstream user with a valid bearer token", async () => {
    const accessToken = `at-${randomUUID()}`;
    const mock = await withUpstream([
      {
        method: "GET",
        path: "/api/user/self",
        body: envelope({ ...selfUser(10), quota: 500, group: "vip" }),
      },
    ]);

    const result = await fetchSelf(accessToken);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.role).toBe(10);
    expect(mock.requests[0]?.headers.authorization).toBe(`Bearer ${accessToken}`);
  });

  it("classifies auth failures, rate limits and outages", async () => {
    await withUpstream([
      {
        method: "GET",
        path: "/api/user/self",
        status: 401,
        body: JSON.stringify({ success: false, code: "AUTH_TOKEN_EXPIRED", message: "Unauthorized" }),
      },
    ]);
    expect(await fetchSelf("expired")).toEqual({ ok: false, status: 401, code: "AUTH_TOKEN_EXPIRED" });

    await withUpstream([
      { method: "GET", path: "/api/user/self", status: 429, body: JSON.stringify({ success: false }) },
    ]);
    expect(await fetchSelf("limited")).toEqual({ ok: false, status: 429, code: "RATE_LIMITED" });

    await withUpstream([
      { method: "GET", path: "/api/user/self", status: 503, body: "down" },
    ]);
    expect(await fetchSelf("down")).toEqual({ ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" });
  });

  it("rejects a malformed self payload as unavailable", async () => {
    await withUpstream([
      { method: "GET", path: "/api/user/self", body: envelope({ id: 0, username: "" }) },
    ]);
    expect(await fetchSelf("token")).toEqual({ ok: false, status: 503, code: "UPSTREAM_UNAVAILABLE" });
  });
});
