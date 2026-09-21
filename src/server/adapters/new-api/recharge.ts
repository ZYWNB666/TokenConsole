import "server-only";

import {
  parseEnvelope,
  toHttpFailure,
  upstreamFetch,
  UpstreamHttpError,
} from "./internal";

/**
 * Server-only recharge (top-up) adapter for the New API fork
 * (commit 972aed19).
 *
 * Real payment rails only: the epay online flow and Stripe Checkout. Creem
 * (product-based), Waffo and Waffo Pancake are not integrated and are
 * reported through the options payload so the UI can say so honestly.
 *
 * Two upstream envelope shapes are involved:
 * - /api/user/topup/info uses the standard {success, data} envelope;
 * - /api/user/pay, /api/user/stripe/pay and both /amount endpoints reply
 *   HTTP 200 with {message:"success"|"error", data, url?} — business
 *   rejections arrive as HTTP 200 + {message:"error", data:"<message>"}.
 *   Those messages are fork-internal Chinese strings; they are mapped here
 *   to safe public codes and NEVER passed through to the browser.
 */

const TOPUP_INFO_PATH = "/api/user/topup/info";
const EPAY_PAY_PATH = "/api/user/pay";
const STRIPE_PAY_PATH = "/api/user/stripe/pay";
const EPAY_AMOUNT_PATH = "/api/user/amount";
const STRIPE_AMOUNT_PATH = "/api/user/stripe/amount";

/** Whole-USD bounds accepted by this console (the fork caps Stripe at 10000). */
export const MIN_TOPUP_USD = 1;
export const MAX_TOPUP_USD = 10_000;

/** Which upstream payment rail a method uses. */
export type RechargeRail = "epay" | "stripe";

/** Fork rails this console does not integrate (kept out of the method list). */
const UNSUPPORTED_RAILS = new Set(["waffo", "waffo_pancake"]);

export type UpstreamRechargeMethod = {
  /** Opaque gateway method id (the fork's `type`, e.g. "alipay", "stripe"). */
  id: string;
  /** Display label from the gateway, e.g. "Alipay". */
  label: string;
  rail: RechargeRail;
  /** Minimum whole-USD top-up for this method. */
  minAmountUsd: number;
};

/** Why recharge is unavailable when there are no supported methods. */
export type RechargeUnavailableReason =
  | "compliance_required"
  | "not_configured"
  | "not_supported";

export type UpstreamRechargeOptions = {
  methods: UpstreamRechargeMethod[];
  reason: RechargeUnavailableReason | null;
  /** Gateway-configured preset amounts, ascending, whole USD. */
  presetAmountsUsd: number[];
  /** External manual top-up link the gateway admin may have configured. */
  manualTopUpUrl: string | null;
};

export type UpstreamRechargeOrder =
  | { kind: "redirect"; url: string }
  | { kind: "form"; action: string; fields: Record<string, string> };

/** Public codes for gateway business rejections (safe to expose). */
export type RechargeRejectionCode =
  | "invalid_amount"
  | "invalid_method"
  | "payment_not_configured"
  | "payment_unavailable";

type Rejected = { ok: false; code: RechargeRejectionCode };
type Succeeded<T> = { ok: true; value: T };

/**
 * Maps a fork business-rejection message to a public code. Substrings are
 * pinned to fork commit 972aed19 (controller/topup.go, controller/topup_stripe.go);
 * unknown messages degrade to a generic "payment unavailable", never a
 * passthrough.
 */
function mapRejection(message: string): RechargeRejectionCode {
  if (
    message.includes("不能小于") ||
    message.includes("不能大于") ||
    message.includes("数量无效") ||
    message.includes("金额过低") ||
    message.includes("充值额度") ||
    message.includes("可表示范围")
  ) {
    return "invalid_amount";
  }
  if (message.includes("支付方式不存在")) return "invalid_method";
  if (message.includes("未配置支付信息")) return "payment_not_configured";
  return "payment_unavailable";
}

/** A valid absolute http(s) URL without credentials, or null. */
function httpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url;
}

type MessageOutcome =
  | { kind: "success"; data: unknown; url: unknown }
  | { kind: "rejected"; reason: string };

/**
 * Parses the fork's {message, data, url?} payment envelope. Malformed bodies
 * are an availability problem (thrown); business rejections are returned so
 * the caller can decide the public response.
 */
async function parseMessageEnvelope(response: Response): Promise<MessageOutcome> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  const candidate = parsed as { message?: unknown; data?: unknown; url?: unknown };
  if (candidate.message !== "success" && candidate.message !== "error") {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (candidate.message === "error") {
    return { kind: "rejected", reason: typeof candidate.data === "string" ? candidate.data : "" };
  }
  return { kind: "success", data: candidate.data, url: candidate.url };
}

/** POSTs a payment call and splits business rejections from payloads. */
async function payCall<T>(
  path: string,
  accessToken: string,
  body: Record<string, unknown>,
  extract: (outcome: { data: unknown; url: unknown }) => T,
): Promise<Succeeded<T> | Rejected> {
  const response = await upstreamFetch(path, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const outcome = await parseMessageEnvelope(response);
  if (outcome.kind === "rejected") {
    return { ok: false, code: mapRejection(outcome.reason) };
  }
  return { ok: true, value: extract(outcome) };
}

type TopUpInfoRow = {
  pay_methods?: unknown;
  min_topup?: unknown;
  stripe_min_topup?: unknown;
  amount_options?: unknown;
  topup_link?: unknown;
  payment_compliance_confirmed?: unknown;
};

type PayMethodEntry = {
  name?: unknown;
  type?: unknown;
  min_topup?: unknown;
};

function toWholeUsd(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 1) {
    return Math.floor(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 1) return Math.floor(parsed);
  }
  return null;
}

/** GET /api/user/topup/info → sanitized recharge capabilities. */
export async function fetchRechargeOptions(
  accessToken: string,
): Promise<UpstreamRechargeOptions> {
  const response = await upstreamFetch(TOPUP_INFO_PATH, accessToken);
  if (!response.ok) throw toHttpFailure(response.status);
  const info = await parseEnvelope<TopUpInfoRow>(response);

  const defaultMin = toWholeUsd(info.min_topup) ?? MIN_TOPUP_USD;
  const stripeMin = toWholeUsd(info.stripe_min_topup) ?? MIN_TOPUP_USD;

  const methods: UpstreamRechargeMethod[] = [];
  let unsupportedSeen = false;
  if (Array.isArray(info.pay_methods)) {
    for (const entry of info.pay_methods as PayMethodEntry[]) {
      if (!entry || typeof entry !== "object") continue;
      const type = typeof entry.type === "string" ? entry.type.trim() : "";
      const label = typeof entry.name === "string" ? entry.name.trim() : "";
      if (!type || !label) continue;
      if (UNSUPPORTED_RAILS.has(type)) {
        unsupportedSeen = true;
        continue;
      }
      const rail: RechargeRail = type === "stripe" ? "stripe" : "epay";
      const fallbackMin = rail === "stripe" ? stripeMin : defaultMin;
      methods.push({
        id: type,
        label,
        rail,
        minAmountUsd: toWholeUsd(entry.min_topup) ?? fallbackMin,
      });
    }
  }

  const complianceConfirmed = info.payment_compliance_confirmed === true;
  const reason: RechargeUnavailableReason | null =
    methods.length > 0
      ? null
      : !complianceConfirmed
        ? "compliance_required"
        : unsupportedSeen
          ? "not_supported"
          : "not_configured";

  const presetAmountsUsd: number[] = [];
  if (Array.isArray(info.amount_options)) {
    for (const option of info.amount_options) {
      const usd = toWholeUsd(option);
      if (usd !== null && !presetAmountsUsd.includes(usd)) presetAmountsUsd.push(usd);
    }
    presetAmountsUsd.sort((a, b) => a - b);
  }

  const manualUrl = httpUrl(info.topup_link);

  return {
    methods,
    reason,
    // The gateway's preset list is a display hint; cap it so a misconfigured
    // options row cannot flood the card.
    presetAmountsUsd: presetAmountsUsd.slice(0, 12),
    manualTopUpUrl: manualUrl ? manualUrl.toString() : null,
  };
}

export type RechargeQuote =
  | { ok: true; payable: string }
  | Rejected;

/** The exact amount the checkout will charge, as the gateway reports it. */
export async function fetchRechargeQuote(
  accessToken: string,
  input: { amountUsd: number; rail: RechargeRail },
): Promise<RechargeQuote> {
  const result = await payCall(
    input.rail === "stripe" ? STRIPE_AMOUNT_PATH : EPAY_AMOUNT_PATH,
    accessToken,
    { amount: input.amountUsd },
    ({ data }) => {
      if (typeof data !== "string" || data.length === 0 || data.length > 32) {
        throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream quote response is malformed");
      }
      return data;
    },
  );
  return result.ok ? { ok: true, payable: result.value } : result;
}

export type RechargeOrder =
  | { ok: true; order: UpstreamRechargeOrder }
  | Rejected;

/**
 * Creates a real payment order. Epay returns a cashier form target (the
 * browser POSTs the signed fields); Stripe returns a checkout link, sent
 * back to the console when payment completes via success_url/cancel_url.
 */
export async function createRechargeOrder(
  accessToken: string,
  input: {
    amountUsd: number;
    rail: RechargeRail;
    /** Epay method id (rail "epay" only). */
    methodId: string;
    /** Console URL Stripe should return the customer to, when resolvable. */
    returnUrl?: string;
  },
): Promise<RechargeOrder> {
  if (input.rail === "stripe") {
    const body: Record<string, unknown> = {
      amount: input.amountUsd,
      payment_method: "stripe",
    };
    if (input.returnUrl) {
      body.success_url = input.returnUrl;
      body.cancel_url = input.returnUrl;
    }
    const result = await payCall(STRIPE_PAY_PATH, accessToken, body, ({ data }) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream stripe response is malformed");
      }
      const link = httpUrl((data as { pay_link?: unknown }).pay_link);
      if (!link) {
        throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream stripe pay link is malformed");
      }
      return { kind: "redirect", url: link.toString() } satisfies UpstreamRechargeOrder;
    });
    return result.ok ? { ok: true, order: result.value } : result;
  }
  const result = await payCall(
    EPAY_PAY_PATH,
    accessToken,
    { amount: input.amountUsd, payment_method: input.methodId },
    ({ data, url }) => {
      const action = httpUrl(url);
      if (!action) {
        throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream epay url is malformed");
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream epay params are malformed");
      }
      const fields: Record<string, string> = {};
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream epay params are malformed");
        }
        fields[key] = String(value);
      }
      return { kind: "form", action: action.toString(), fields } satisfies UpstreamRechargeOrder;
    },
  );
  return result.ok ? { ok: true, order: result.value } : result;
}
