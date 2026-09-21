import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as keysGet, POST as keysPost } from "@/app/api/v1/keys/route";
import { DELETE as keyDelete, PATCH as keyPatch } from "@/app/api/v1/keys/[id]/route";
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

function makeSession(): { accessToken: string; cookie: string } {
  const accessToken = `at-${randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const sealed = sealSession({
    at: accessToken,
    ae: now + 900,
    rt: `rt-${randomUUID()}`,
    sid: `sid-${randomUUID().slice(0, 8)}`,
    exp: now + 3600,
  });
  return { accessToken, cookie: `tc_session=${sealed}` };
}

function request(
  cookie: string,
  path: string,
  init: { method: string; body?: string; origin?: boolean } = { method: "GET" },
): Request {
  const headers: Record<string, string> = { cookie };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.origin) headers.origin = "http://localhost:3100";
  return new Request(`http://localhost:3100${path}`, {
    method: init.method,
    headers,
    body: init.body,
  });
}

const NOW = Math.floor(Date.now() / 1000);

function tokenRow(id: number, name: string, key = `k${id}abcdef123456`) {
  return {
    id,
    user_id: 3,
    key: `${key.slice(0, 4)}**********${key.slice(-4)}`,
    status: 1,
    name,
    created_time: NOW,
    accessed_time: NOW,
    expired_time: -1,
    remain_quota: 500_000,
    unlimited_quota: true,
    used_quota: 12_345,
    model_limits_enabled: false,
    model_limits: "",
  };
}

const FULL_KEY = "sk-full-key-value-123456";

describe("/api/v1/keys", () => {
  it("lists keys with masked values and public USD quota", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/token/",
        body: JSON.stringify({
          success: true,
          data: { page: 1, page_size: 100, total: 1, items: [tokenRow(5, "prod-key")] },
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await keysGet(request(session.cookie, "/api/v1/keys"));
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as { data: { keys: Array<Record<string, unknown>> } };
    expect(parsed.data.keys).toHaveLength(1);
    // The list carries the masked value only — never the full key.
    expect(parsed.data.keys[0]).toMatchObject({ id: 5, name: "prod-key", status: "active", unlimitedQuota: true });
    expect(body).not.toContain("k5abcdef123456");
    expect(mock.requests[0]?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it("creates a key and returns the full value exactly once", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "POST", path: "/api/token/", body: JSON.stringify({ success: true, message: "" }) },
      {
        method: "GET",
        path: "/api/token/",
        body: JSON.stringify({
          success: true,
          data: { page: 1, page_size: 100, total: 1, items: [tokenRow(9, "new-key")] },
        }),
      },
      { method: "POST", path: "/api/token/9/key", body: JSON.stringify({ success: true, data: { key: FULL_KEY } }) },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await keysPost(
      request(session.cookie, "/api/v1/keys", {
        method: "POST",
        body: JSON.stringify({ name: "new-key", expiresInDays: null, quotaUsd: null }),
        origin: true,
      }),
    );
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { data: { id: number; key: string } };
    expect(parsed.data).toEqual({ id: 9, key: FULL_KEY, maskedKey: "k9ab**********3456" });
    // Creation mints upstream; the reveal call carries the session token.
    const reveal = mock.requests.find((r) => r.url.startsWith("/api/token/9/key"));
    expect(reveal?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it("rejects a mutation without a same-origin header", async () => {
    const session = makeSession();
    const response = await keysPost(
      request(session.cookie, "/api/v1/keys", {
        method: "POST",
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(upstream === undefined || upstream.requests.length === 0).toBe(true);
  });

  it("toggles a key and deletes it through the id routes", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "PUT", path: "/api/token/", body: JSON.stringify({ success: true, message: "" }) },
      { method: "DELETE", path: "/api/token/5", body: JSON.stringify({ success: true, message: "" }) },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const patch = await keyPatch(
      request(session.cookie, "/api/v1/keys/5", {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
        origin: true,
      }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(patch.status).toBe(200);
    const put = mock.requests.find((r) => r.method === "PUT");
    expect(JSON.parse(put?.body ?? "{}")).toEqual({ id: 5, status: 2 });

    const remove = await keyDelete(
      request(session.cookie, "/api/v1/keys/5", { method: "DELETE", origin: true }),
      { params: Promise.resolve({ id: "5" }) },
    );
    expect(remove.status).toBe(200);
  });

  it("fully edits a key: name, expiry, quota and model limits together", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "PUT", path: "/api/token/", body: JSON.stringify({ success: true, message: "" }) },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const patch = await keyPatch(
      request(session.cookie, "/api/v1/keys/7", {
        method: "PATCH",
        body: JSON.stringify({
          name: "renamed-key",
          expiresInDays: 30,
          quotaUsd: 12.5,
          modelLimits: ["GLM-5.2", "GPT-5.5"],
        }),
        origin: true,
      }),
      { params: Promise.resolve({ id: "7" }) },
    );
    expect(patch.status).toBe(200);

    const put = mock.requests.find((r) => r.method === "PUT");
    const sent = JSON.parse(put?.body ?? "{}");
    // The fork replaces every editable field, so the payload must be complete:
    // USD quota converts to internal units (12.5 × 500,000).
    expect(sent).toMatchObject({
      id: 7,
      name: "renamed-key",
      unlimited_quota: false,
      remain_quota: 6_250_000,
      model_limits_enabled: true,
      model_limits: "GLM-5.2,GPT-5.5",
      group: "",
      allow_ips: "",
    });
    expect(typeof sent.expired_time).toBe("number");
    expect(sent.expired_time).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("reports 401 with cleared cookies without a session", async () => {
    const response = await keysGet(
      new Request("http://localhost:3100/api/v1/keys", { method: "GET" }),
    );
    expect(response.status).toBe(401);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((cookie) => cookie.includes("tc_session="))).toBe(true);
  });
});
