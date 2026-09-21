import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "@/app/api/v1/overview/route";
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
  const sid = `sid-${randomUUID().slice(0, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  const sealed = sealSession({
    at: accessToken,
    ae: now + 900,
    rt: `rt-${randomUUID()}`,
    sid,
    exp: now + 3600,
  });
  return { accessToken, cookie: `tc_session=${sealed}` };
}

function overviewRequest(cookie: string | null): Request {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return new Request("http://localhost:3100/api/v1/overview", { method: "GET", headers });
}

const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);

function selfBody(): string {
  return JSON.stringify({
    success: true,
    message: "",
    data: {
      id: 7,
      username: "ada",
      display_name: "Ada Lovelace",
      email: "ada@example.com",
      role: 1,
      quota: 2_500_000,
      used_quota: 750_000,
      request_count: 9,
    },
  });
}

function quotaDataBody(): string {
  return JSON.stringify({
    success: true,
    message: "",
    data: [
      { model_name: "gpt-test", created_at: now - DAY, token_id: 5, token_used: 1_000, count: 3, quota: 50_000 },
      { model_name: "gpt-test", created_at: now, token_id: 5, token_used: 2_000, count: 2, quota: 25_000 },
      { model_name: "claude-test", created_at: now, token_id: 6, token_used: 500, count: 1, quota: 5_000 },
    ],
  });
}

function logsBody(): string {
  return JSON.stringify({
    success: true,
    message: "",
    data: {
      page: 1,
      page_size: 50,
      total: 4,
      items: [
        {
          id: 11,
          type: 2,
          created_at: now,
          model_name: "gpt-test",
          token_name: "sk-proj",
          use_time: 2,
          prompt_tokens: 100,
          completion_tokens: 50,
          quota: 25_000,
          request_id: "req-1",
        },
        {
          id: 10,
          type: 5,
          created_at: now - 60,
          model_name: "claude-test",
          token_name: "sk-proj",
          use_time: 1,
          prompt_tokens: 40,
          completion_tokens: 0,
          quota: 0,
          request_id: "req-2",
        },
        // Non-request rows must be filtered out of the dashboard feed.
        { id: 9, type: 1, created_at: now - 120, content: "topup", quota: 100_000 },
        { id: 8, type: 3, created_at: now - 130, content: "manage", quota: 0 },
      ],
    },
  });
}

describe("GET /api/v1/overview", () => {
  it("composes real upstream data into the owned DTO", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/self", body: selfBody() },
      { method: "GET", path: "/api/data/self", body: quotaDataBody() },
      { method: "GET", path: "/api/log/self", body: logsBody() },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(overviewRequest(session.cookie));
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as { data: Record<string, unknown> };

    // Account in public USD units (500,000 quota = $1).
    expect(parsed.data.account).toEqual({
      balanceUsd: 5,
      usedUsd: 1.5,
      requestCount: 9,
    });

    // Metric totals: 6 requests, 3,500 tokens, $0.16 cost over the window.
    const metrics = parsed.data.metrics as Array<{ key: string; total: number }>;
    const byKey = Object.fromEntries(metrics.map((metric) => [metric.key, metric.total]));
    expect(byKey.requests).toBe(6);
    expect(byKey.tokens).toBe(3500);
    expect(byKey.cost).toBe(0.16);

    // Model usage is aggregated and shares sum to <= 1.
    const models = parsed.data.modelUsage as Array<{ modelId: string; requests: number }>;
    expect(models).toEqual([
      { modelId: "gpt-test", requests: 5, share: 5 / 6 },
      { modelId: "claude-test", requests: 1, share: 1 / 6 },
    ]);

    // Recent requests: consume + error rows only, newest first.
    const requests = parsed.data.recentRequests as Array<{
      id: string;
      status: string;
      tokens: number;
      costUsd: number;
    }>;
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ id: "req-1", status: "success", tokens: 150, costUsd: 0.05 });
    expect(requests[1]).toMatchObject({ id: "req-2", status: "error", tokens: 40, costUsd: 0 });

    // Internal upstream units and structures never reach the browser.
    for (const forbidden of ["quota", "channel", "2500000", "50000"]) {
      expect(body).not.toContain(forbidden);
    }
    expect(body).not.toContain(session.accessToken);

    // Every upstream call carried the session's Bearer token.
    for (const recorded of mock.requests) {
      expect(recorded.headers.authorization).toBe(`Bearer ${session.accessToken}`);
    }
  });

  it("reports 401 with cleared cookies without a session", async () => {
    const response = await GET(overviewRequest(null));
    expect(response.status).toBe(401);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies.some((cookie) => cookie.includes("tc_session="))).toBe(true);
  });

  it("keeps the session and reports 503 when the upstream is unavailable", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/self", status: 500, body: "{}" },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await GET(overviewRequest(session.cookie));
    expect(response.status).toBe(503);
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toHaveLength(0);
  });
});
