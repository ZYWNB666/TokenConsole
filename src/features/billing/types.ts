/** Billing DTOs for the owned /api/v1/billing contract. */

export type TopUpStatus = "completed" | "pending" | "unknown";

export type TopUpView = {
  id: number;
  /** UTC ISO timestamp. */
  createdAt: string;
  /** Top-up amount in USD. */
  amountUsd: number;
  /** Payment method label. */
  method: string;
  status: TopUpStatus;
  /** Order reference for support. */
  tradeNo: string;
};

export type BillingView = {
  balanceUsd: number;
  usedUsd: number;
  requestCount: number;
  /** Spend in the current calendar month, USD. */
  monthSpendUsd: number;
  topups: TopUpView[];
};
