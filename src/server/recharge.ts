import "server-only";

import { jsonError, readJsonBody, resolveAllowedOrigin } from "@/server/http";
import {
  MAX_TOPUP_USD,
  MIN_TOPUP_USD,
  type RechargeRejectionCode,
  type UpstreamRechargeMethod,
  fetchRechargeOptions,
} from "@/server/adapters/new-api/recharge";

/**
 * Shared validation and rejection mapping for the recharge routes. Public
 * error codes are safe by construction — the gateway's raw business messages
 * never leave the adapter.
 */

export type RechargeInput = {
  amountUsd: number;
  methodId: string;
};

/** Parses and validates the request body; null → reply 400 invalid_request. */
export async function readRechargeInput(
  request: Request,
): Promise<RechargeInput | null> {
  const body = await readJsonBody(request);
  if (!body) return null;
  const amountUsd = body.amountUsd;
  const methodId = body.methodId;
  if (
    typeof amountUsd !== "number" || !Number.isInteger(amountUsd) ||
    amountUsd < MIN_TOPUP_USD || amountUsd > MAX_TOPUP_USD
  ) {
    return null;
  }
  if (typeof methodId !== "string" || methodId.length === 0 || methodId.length > 40) {
    return null;
  }
  return { amountUsd, methodId };
}

const REJECTION_RESPONSES: Record<RechargeRejectionCode, { status: number; message: string }> = {
  invalid_amount: { status: 400, message: "The top-up amount is out of range for that method." },
  invalid_method: { status: 400, message: "That payment method is not available." },
  payment_not_configured: { status: 409, message: "Recharge is not configured on the gateway yet." },
  payment_unavailable: { status: 409, message: "The payment gateway could not start the checkout." },
};

export function rechargeRejection(code: RechargeRejectionCode): Response {
  const mapped = REJECTION_RESPONSES[code];
  return jsonError(mapped.status, code, mapped.message);
}

export type ResolvedRechargeMethod =
  | { ok: true; method: UpstreamRechargeMethod }
  | { ok: false; response: Response };

/**
 * Resolves the requested method against the gateway's live capabilities —
 * the server-side whitelist that keeps arbitrary method ids away from the
 * upstream pay endpoints — and enforces the method's own minimum amount.
 */
export async function resolveRechargeMethod(
  accessToken: string,
  methodId: string,
  amountUsd: number,
): Promise<ResolvedRechargeMethod> {
  const options = await fetchRechargeOptions(accessToken);
  const method = options.methods.find((entry) => entry.id === methodId);
  if (method) {
    if (amountUsd < method.minAmountUsd) {
      return { ok: false, response: rechargeRejection("invalid_amount") };
    }
    return { ok: true, method };
  }
  if (options.methods.length === 0) {
    return {
      ok: false,
      response: rechargeRejection(
        options.reason === "not_supported" ? "payment_unavailable" : "payment_not_configured",
      ),
    };
  }
  return { ok: false, response: rechargeRejection("invalid_method") };
}

/**
 * The console URL Stripe should return the customer to after checkout, when
 * the public origin is configured. Epay's return URL is hardcoded by the
 * fork to its own frontend and cannot be redirected.
 */
export function stripeReturnUrl(request: Request): string | undefined {
  const allowed = resolveAllowedOrigin(request);
  return allowed.kind === "origin" ? `${allowed.origin}/billing` : undefined;
}
