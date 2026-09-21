/** Billing DTOs for the owned /api/v1/billing contract. */

export type TopUpStatus = "completed" | "pending" | "unknown";

export type TopUpView = {
  id: number;
  /** UTC ISO timestamp. */
  createdAt: string;
  /** Credited amount in USD (what the balance gained, not what was paid). */
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

/** Recharge DTOs for the owned /api/v1/billing/recharge contract. */

export type RechargeMethodView = {
  /** Opaque gateway method id. */
  id: string;
  label: string;
  /** Minimum whole-USD top-up for this method. */
  minAmountUsd: number;
};

export type RechargeOptionsView = {
  /** False when the gateway exposes no supported payment method. */
  available: boolean;
  reason: "compliance_required" | "not_configured" | "not_supported" | null;
  methods: RechargeMethodView[];
  /** Gateway-configured preset amounts, whole USD. */
  presetAmountsUsd: number[];
  /** External manual top-up link, when the gateway admin configured one. */
  manualTopUpUrl: string | null;
};

export type RechargeOrderView =
  /** Open the URL directly (Stripe checkout). */
  | { kind: "redirect"; url: string }
  /** Submit the fields as a form POST to the cashier (epay). */
  | { kind: "form"; action: string; fields: Record<string, string> };
