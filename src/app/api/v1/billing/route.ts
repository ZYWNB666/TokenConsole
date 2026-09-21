import { readRoute } from "@/server/route-helpers";
import { fetchBillingSummary } from "@/server/adapters/new-api/billing";

import type { BillingView } from "@/features/billing/types";

/**
 * GET /api/v1/billing — balance, current-month spend and top-up history.
 * Real records only; payment initiation is not part of this endpoint.
 */
export async function GET(request: Request): Promise<Response> {
  return readRoute<BillingView>(request, async (accessToken) => {
    const now = new Date();
    const monthStart = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
    );
    const summary = await fetchBillingSummary(accessToken, monthStart);
    return {
      balanceUsd: summary.account.balanceUsd,
      usedUsd: summary.account.usedUsd,
      requestCount: summary.account.requestCount,
      monthSpendUsd: summary.monthSpendUsd,
      topups: summary.topups.map((topup) => ({
        id: topup.id,
        createdAt: topup.createdAt,
        amountUsd: topup.amountUsd,
        method: topup.method,
        status: topup.status,
        tradeNo: topup.tradeNo,
      })),
    };
  });
}
