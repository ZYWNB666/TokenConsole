import { createRechargeOrder, fetchRechargeOptions } from "@/server/adapters/new-api/recharge";
import { jsonError } from "@/server/http";
import {
  readRechargeInput,
  rechargeRejection,
  resolveRechargeMethod,
  stripeReturnUrl,
} from "@/server/recharge";
import { mutationRoute, readRoute } from "@/server/route-helpers";

import type { RechargeOrderView, RechargeOptionsView } from "@/features/billing/types";

/**
 * Recharge routes.
 *
 * GET  /api/v1/billing/recharge — real top-up capabilities from the gateway,
 *                              including the honest reason when recharge is
 *                              unavailable.
 * POST /api/v1/billing/recharge — create a real payment order. The method is
 *                              whitelisted server-side against the gateway's
 *                              live options; business rejections map to safe
 *                              public codes, never raw upstream messages.
 *                              This call has a financial side effect, so the
 *                              BFF never retries it.
 */

export async function GET(request: Request): Promise<Response> {
  return readRoute<RechargeOptionsView>(request, async (accessToken) => {
    const options = await fetchRechargeOptions(accessToken);
    return {
      available: options.methods.length > 0,
      reason: options.methods.length > 0 ? null : options.reason,
      methods: options.methods.map((method) => ({
        id: method.id,
        label: method.label,
        minAmountUsd: method.minAmountUsd,
      })),
      presetAmountsUsd: options.presetAmountsUsd,
      manualTopUpUrl: options.manualTopUpUrl,
    };
  });
}

export async function POST(request: Request): Promise<Response> {
  const input = await readRechargeInput(request);
  if (!input) {
    return jsonError(400, "invalid_request", "Invalid recharge request.");
  }
  return mutationRoute<RechargeOrderView | Response>(request, async (accessToken) => {
    const resolved = await resolveRechargeMethod(accessToken, input.methodId, input.amountUsd);
    if (!resolved.ok) return resolved.response;
    const order = await createRechargeOrder(accessToken, {
      amountUsd: input.amountUsd,
      rail: resolved.method.rail,
      methodId: input.methodId,
      returnUrl: resolved.method.rail === "stripe" ? stripeReturnUrl(request) : undefined,
    });
    if (!order.ok) return rechargeRejection(order.code);
    return order.order;
  });
}
