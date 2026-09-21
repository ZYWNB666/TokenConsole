import { fetchRechargeQuote } from "@/server/adapters/new-api/recharge";
import { jsonError } from "@/server/http";
import {
  readRechargeInput,
  rechargeRejection,
  resolveRechargeMethod,
} from "@/server/recharge";
import { mutationRoute } from "@/server/route-helpers";

/**
 * POST /api/v1/billing/recharge/quote — the exact amount the gateway's
 * checkout will charge for a top-up, as a plain string in the gateway's
 * charge currency. Read-only in effect, but POST keeps the parameters out of
 * URLs and reuses the mutation origin guard.
 */

export async function POST(request: Request): Promise<Response> {
  const input = await readRechargeInput(request);
  if (!input) {
    return jsonError(400, "invalid_request", "Invalid recharge request.");
  }
  return mutationRoute<{ payable: string } | Response>(request, async (accessToken) => {
    const resolved = await resolveRechargeMethod(accessToken, input.methodId, input.amountUsd);
    if (!resolved.ok) return resolved.response;
    const quote = await fetchRechargeQuote(accessToken, {
      amountUsd: input.amountUsd,
      rail: resolved.method.rail,
    });
    if (!quote.ok) return rechargeRejection(quote.code);
    return { payable: quote.payable };
  });
}
