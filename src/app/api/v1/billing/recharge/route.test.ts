import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET as rechargeGet, POST as rechargePost } from "@/app/api/v1/billing/recharge/route";
import { POST as quotePost } from "@/app/api/v1/billing/recharge/quote/route";
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
  delete process.env.AUTH_PUBLIC_ORIGIN;
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

function topupInfoBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    success: true,
    message: "",
    data: {
      enable_online_topup: true,
      enable_stripe_topup: true,
      enable_creem_topup: false,
      enable_waffo_topup: false,
      payment_compliance_confirmed: true,
      pay_methods: [
        { name: "Alipay", type: "alipay", color: "#1677ff", min_topup: "5" },
        { name: "Stripe", type: "stripe", color: "#635BFF", min_topup: "2" },
      ],
      min_topup: 1,
      stripe_min_topup: 2,
      amount_options: [10, 50, 100, 500],
      topup_link: "",
      ...overrides,
    },
  });
}

describe("/api/v1/billing/recharge", () => {
  it("reports real gateway capabilities with sanitized methods", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/topup/info",
        body: topupInfoBody({ topup_link: "https://manual.example.com/topup" }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargeGet(request(session.cookie, "/api/v1/billing/recharge"));
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as {
      data: {
        available: boolean;
        reason: string | null;
        methods: Array<{ id: string; label: string; minAmountUsd: number }>;
        presetAmountsUsd: number[];
        manualTopUpUrl: string | null;
      };
    };
    expect(parsed.data.available).toBe(true);
    expect(parsed.data.reason).toBeNull();
    // The fork's internal color fields never cross the boundary.
    expect(parsed.data.methods).toEqual([
      { id: "alipay", label: "Alipay", minAmountUsd: 5 },
      { id: "stripe", label: "Stripe", minAmountUsd: 2 },
    ]);
    expect(parsed.data.presetAmountsUsd).toEqual([10, 50, 100, 500]);
    expect(parsed.data.manualTopUpUrl).toBe("https://manual.example.com/topup");
    expect(mock.requests[0]?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
  });

  it("drops a non-http manual top-up link", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/topup/info",
        body: topupInfoBody({ topup_link: "javascript:alert(1)" }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargeGet(request(session.cookie, "/api/v1/billing/recharge"));
    const parsed = (await response.json()) as { data: { manualTopUpUrl: string | null } };
    expect(parsed.data.manualTopUpUrl).toBeNull();
  });

  it("reports the compliance gate as the honest unavailable reason", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/topup/info",
        // The fork empties pay_methods when compliance is not confirmed.
        body: topupInfoBody({ payment_compliance_confirmed: false, pay_methods: [] }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargeGet(request(session.cookie, "/api/v1/billing/recharge"));
    const parsed = (await response.json()) as {
      data: { available: boolean; reason: string | null };
    };
    expect(parsed.data.available).toBe(false);
    expect(parsed.data.reason).toBe("compliance_required");
  });

  it("says not_configured when the gateway exposes no methods at all", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/topup/info",
        body: topupInfoBody({ pay_methods: [] }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargeGet(request(session.cookie, "/api/v1/billing/recharge"));
    const parsed = (await response.json()) as {
      data: { available: boolean; reason: string | null };
    };
    expect(parsed.data.available).toBe(false);
    expect(parsed.data.reason).toBe("not_configured");
  });

  it("says not_supported when only unsupported rails are configured", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      {
        method: "GET",
        path: "/api/user/topup/info",
        body: topupInfoBody({
          pay_methods: [{ name: "Waffo (Global Payment)", type: "waffo", min_topup: "1" }],
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargeGet(request(session.cookie, "/api/v1/billing/recharge"));
    const parsed = (await response.json()) as {
      data: { available: boolean; reason: string | null };
    };
    expect(parsed.data.available).toBe(false);
    expect(parsed.data.reason).toBe("not_supported");
  });

  it("creates an epay order and returns the cashier form target", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
      {
        method: "POST",
        path: "/api/user/pay",
        body: JSON.stringify({
          message: "success",
          data: { money: "73.00", out_trade_no: "USR3NOabc123", trade_no: "2026092100" },
          url: "https://pay.example.com/submit.php",
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargePost(
      request(session.cookie, "/api/v1/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 10, methodId: "alipay" }),
        origin: true,
      }),
    );
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as {
      data: { kind: string; action: string; fields: Record<string, string> };
    };
    expect(parsed.data.kind).toBe("form");
    expect(parsed.data.action).toBe("https://pay.example.com/submit.php");
    expect(parsed.data.fields).toEqual({
      money: "73.00",
      out_trade_no: "USR3NOabc123",
      trade_no: "2026092100",
    });
    const pay = mock.requests.find((r) => r.url === "/api/user/pay");
    expect(pay?.headers.authorization).toBe(`Bearer ${session.accessToken}`);
    expect(JSON.parse(pay?.body ?? "{}")).toEqual({ amount: 10, payment_method: "alipay" });
  });

  it("creates a stripe order with console return URLs", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
      {
        method: "POST",
        path: "/api/user/stripe/pay",
        body: JSON.stringify({
          message: "success",
          data: { pay_link: "https://checkout.example.com/c/pay/cs_test_123" },
        }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    process.env.AUTH_PUBLIC_ORIGIN = "https://console.example.com";
    upstream = mock;

    // The origin guard compares the browser Origin against AUTH_PUBLIC_ORIGIN.
    const response = await rechargePost(
      new Request("http://localhost:3100/api/v1/billing/recharge", {
        method: "POST",
        headers: {
          cookie: session.cookie,
          "Content-Type": "application/json",
          origin: "https://console.example.com",
        },
        body: JSON.stringify({ amountUsd: 25, methodId: "stripe" }),
      }),
    );
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { data: { kind: string; url: string } };
    expect(parsed.data).toEqual({
      kind: "redirect",
      url: "https://checkout.example.com/c/pay/cs_test_123",
    });
    const pay = mock.requests.find((r) => r.url === "/api/user/stripe/pay");
    expect(JSON.parse(pay?.body ?? "{}")).toEqual({
      amount: 25,
      payment_method: "stripe",
      success_url: "https://console.example.com/billing",
      cancel_url: "https://console.example.com/billing",
    });
  });

  it("maps a gateway business rejection to a safe code, never the raw message", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
      {
        method: "POST",
        path: "/api/user/pay",
        body: JSON.stringify({ message: "error", data: "当前管理员未配置支付信息" }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargePost(
      request(session.cookie, "/api/v1/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 10, methodId: "alipay" }),
        origin: true,
      }),
    );
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toContain("payment_not_configured");
    expect(body).not.toContain("未配置");
    expect(body).not.toContain("管理员");
  });

  it("validates the amount against the live method minimum before paying", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargePost(
      request(session.cookie, "/api/v1/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 3, methodId: "alipay" }), // min is 5
        origin: true,
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("invalid_amount");
    // No order was ever sent upstream.
    expect(mock.requests.some((r) => r.url === "/api/user/pay")).toBe(false);
  });

  it("rejects an unknown method id without an upstream pay call", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await rechargePost(
      request(session.cookie, "/api/v1/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 10, methodId: "wxpay" }),
        origin: true,
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("invalid_method");
  });

  it("rejects a non-integer or out-of-range amount as invalid_request", async () => {
    const session = makeSession();
    for (const amountUsd of [10.5, 0, -3, 10001]) {
      const response = await rechargePost(
        request(session.cookie, "/api/v1/billing/recharge", {
          method: "POST",
          body: JSON.stringify({ amountUsd, methodId: "alipay" }),
          origin: true,
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.text();
      expect(body).toContain("invalid_request");
    }
  });

  it("refuses a mutation without a same-origin header", async () => {
    const session = makeSession();
    const response = await rechargePost(
      request(session.cookie, "/api/v1/billing/recharge", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 10, methodId: "alipay" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(upstream === undefined || upstream.requests.length === 0).toBe(true);
  });

  it("quotes the payable amount from the gateway", async () => {
    const session = makeSession();
    const mock = await startMockUpstream([
      { method: "GET", path: "/api/user/topup/info", body: topupInfoBody() },
      {
        method: "POST",
        path: "/api/user/amount",
        body: JSON.stringify({ message: "success", data: "73.00" }),
      },
    ]);
    process.env.NEW_API_INTERNAL_URL = mock.url;
    upstream = mock;

    const response = await quotePost(
      request(session.cookie, "/api/v1/billing/recharge/quote", {
        method: "POST",
        body: JSON.stringify({ amountUsd: 10, methodId: "alipay" }),
        origin: true,
      }),
    );
    expect(response.status).toBe(200);
    const parsed = (await response.json()) as { data: { payable: string } };
    expect(parsed.data.payable).toBe("73.00");
    const quote = mock.requests.find((r) => r.url === "/api/user/amount");
    expect(JSON.parse(quote?.body ?? "{}")).toEqual({ amount: 10 });
  });
});
