import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as orgGet, PATCH as orgPatch } from "@/app/api/v1/org/members/route";
import { sealSession } from "@/server/auth/session";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/**
 * Organization member routes. The critical contract: a member's 403
 * (insufficient privilege upstream) must surface as `forbidden` WITHOUT
 * clearing the session — browsing the page must never sign anybody out.
 */

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

function makeSession(): { cookie: string } {
  const now = Math.floor(Date.now() / 1000);
  const sealed = sealSession({
    at: `at-${randomUUID()}`,
    ae: now + 900,
    rt: `rt-${randomUUID()}`,
    sid: `sid-${randomUUID().slice(0, 8)}`,
    exp: now + 3600,
  });
  return { cookie: `tc_session=${sealed}` };
}

describe("/api/v1/org/members", () => {
  it("returns members in public units for an admin", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/",
        body: JSON.stringify({
          success: true,
          data: {
            page: 1,
            page_size: 20,
            total: 2,
            items: [
              {
                id: 1,
                username: "root-admin",
                display_name: "Root User",
                email: "admin@example.com",
                role: 100,
                status: 1,
                created_at: "2026-05-21T08:45:31Z",
                quota: 99_000_000,
                used_quota: 1_250_000,
                request_count: 7,
              },
              {
                id: 3,
                username: "ada",
                display_name: "Ada Lovelace",
                email: "ada@example.com",
                role: 1,
                status: 1,
                created_at: "2026-09-20T10:00:00Z",
                quota: 2_500_000,
                used_quota: 750_000,
                request_count: 9,
              },
            ],
          },
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await orgGet(
      new Request("http://localhost:3100/api/v1/org/members?page=1&pageSize=20", {
        headers: { cookie: session.cookie },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as { data: { items: Array<Record<string, unknown>> } };
    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items[0]).toMatchObject({ username: "root-admin", role: "owner" });
    expect(parsed.data.items[1]).toMatchObject({
      username: "ada",
      role: "member",
      balanceUsd: 5,
      usedUsd: 1.5,
    });
    // Internal quota integers never reach the browser.
    expect(body).not.toContain("99000000");
    expect(body).not.toContain("quota");
  });

  it("answers 403 forbidden and KEEPS the session for a member", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/",
        status: 403,
        body: JSON.stringify({
          success: false,
          code: "AUTH_INSUFFICIENT_PRIVILEGE",
          message: "Unauthorized, insufficient privileges",
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await orgGet(
      new Request("http://localhost:3100/api/v1/org/members?page=1&pageSize=20", {
        headers: { cookie: session.cookie },
      }),
    );
    expect(response.status).toBe(403);
    const parsed = (await response.json()) as { error: { code: string } };
    expect(parsed.error.code).toBe("forbidden");
    // The defining assertion: no cookie clearing, no refresh attempt.
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(0);
    const refreshCalls = mock.requests.filter((r) => r.url.includes("/api/user/auth/refresh"));
    expect(refreshCalls).toHaveLength(0);
  });

  it("forwards role and status changes with numeric mapping", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "PUT", path: "/api/user/", body: JSON.stringify({ success: true, message: "" }) },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await orgPatch(
      new Request("http://localhost:3100/api/v1/org/members", {
        method: "PATCH",
        headers: { cookie: session.cookie, "Content-Type": "application/json", origin: "http://localhost:3100" },
        body: JSON.stringify({ id: 3, role: "admin", enabled: false }),
      }),
    );
    expect(response.status).toBe(200);
    expect(JSON.parse(mock.requests[0]?.body ?? "{}")).toEqual({ id: 3, role: 10, status: 2 });
  });
});
