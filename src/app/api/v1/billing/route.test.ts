import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as billingGet } from "@/app/api/v1/billing/route";
import { sealSession } from "@/server/auth/session";
import { startMockUpstream, type MockUpstream } from "@/test/mock-upstream";

/**
 * Top-up history mapping: the credited USD per payment rail (the fork keeps
 * the credited USD in `amount` for epay-style rails and in `money` for
 * Stripe; `money` on the epay rail is the payable in the gateway's charge
 * currency and must never surface as USD).
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

const NOW = Math.floor(Date.now() / 1000);

function billingRoutes(rows: Array<Record<string, unknown>>): Parameters<typeof startMockUpstream>[0] {
  return [
    {
      method: "GET",
      path: "/api/user/self",
      body: JSON.stringify({
        success: true,
        message: "",
        data: {
          id: 3,
          username: "ada",
          display_name: "Ada Lovelace",
          email: "ada@example.com",
          role: 1,
          quota: 2_500_000,
          used_quota: 750_000,
          request_count: 9,
        },
      }),
    },
    {
      method: "GET",
      path: "/api/user/topup/self",
      body: JSON.stringify({
        success: true,
        message: "",
        data: { page: 1, page_size: 50, total: rows.length, items: rows },
      }),
    },
    {
      method: "GET",
      path: "/api/log/self/stat",
      body: JSON.stringify({
        success: true,
        message: "",
        data: { quota: 250_000, rpm: 0, tpm: 0 },
      }),
    },
  ];
}

describe("/api/v1/billing", () => {
  it("maps the credited USD per payment rail, never the epay payable", async () => {
    const session = makeSession();
    const mock = await startMockUpstream(
      billingRoutes([
        {
          id: 1,
          created_at: NOW - 300,
          amount: 10, // epay rail: credited USD
          money: 73, // epay rail: CNY payable — must not surface as USD
          payment_method: "alipay",
          payment_provider: "epay",
          status: "success",
          trade_no: "USR3NOepay",
        },
        {
          id: 2,
          created_at: NOW - 200,
          amount: 10, // stripe rail: requested units
          money: 9.5, // stripe rail: credited USD (group ratio applied)
          payment_method: "stripe",
          payment_provider: "stripe",
          status: "pending",
          trade_no: "ref_stripe",
        },
        {
          id: 3,
          created_at: NOW - 100,
          amount: 5_000_000, // creem rail: credited quota units
          money: 0,
          payment_method: "creem",
          payment_provider: "creem",
          status: "success",
          trade_no: "creem_1",
        },
      ]),
    );
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await billingGet(
      new Request("http://localhost:3100/api/v1/billing", {
        method: "GET",
        headers: { cookie: session.cookie },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    const parsed = JSON.parse(body) as {
      data: {
        balanceUsd: number;
        monthSpendUsd: number;
        topups: Array<{ id: number; amountUsd: number }>;
      };
    };
    expect(parsed.data.balanceUsd).toBe(5);
    expect(parsed.data.monthSpendUsd).toBe(0.5);
    // Newest first, credited USD per rail.
    const rows = parsed.data.topups.map(({ id, amountUsd }) => ({ id, amountUsd }));
    expect(rows).toEqual([
      { id: 3, amountUsd: 10 }, // creem: 5,000,000 quota / 500,000
      { id: 2, amountUsd: 9.5 }, // stripe: money is the credited USD
      { id: 1, amountUsd: 10 }, // epay: amount is the credited USD
    ]);
    // The epay payable (73 CNY) never surfaces as a USD figure.
    expect(body).not.toContain("73");
  });

  it("refuses a malformed top-up row instead of inventing an amount", async () => {
    const session = makeSession();
    const mock = await startMockUpstream(
      billingRoutes([
        {
          id: 1,
          created_at: NOW,
          payment_method: "alipay",
          payment_provider: "epay",
          status: "success",
          trade_no: "broken",
          // amount and money both missing
        },
      ]),
    );
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await billingGet(
      new Request("http://localhost:3100/api/v1/billing", {
        method: "GET",
        headers: { cookie: session.cookie },
      }),
    );
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("upstream_unavailable");
  });
});
