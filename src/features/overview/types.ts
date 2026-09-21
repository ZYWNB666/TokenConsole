/**
 * Overview dashboard DTOs for the owned /api/v1/overview contract
 * (see ../../docs/API_CONTRACT.md). Raw numbers and ISO dates only — the
 * browser formats money, dates and counts for the active locale, and no
 * upstream gateway structure (internal quota units, channel names, …)
 * ever crosses this boundary.
 */

export type OverviewMetricKey = "requests" | "cost" | "tokens";

/** 30-day total plus a last-7-days vs previous-7-days comparison. */
export type OverviewMetric = {
  key: OverviewMetricKey;
  /** Total over the reporting window. */
  total: number;
  /** Sum of the last 7 days of the window. */
  recent: number;
  /** Sum of the 7 days before that. */
  previous: number;
};

export type UsageSeriesPoint = {
  /** UTC ISO date, e.g. "2026-09-20". */
  date: string;
  requests: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
};

export type ModelUsageEntry = {
  modelId: string;
  requests: number;
  /** Share of the period's requests, 0–1. */
  share: number;
};

export type RecentRequestStatus = "success" | "error";

export type RecentRequest = {
  id: string;
  /** UTC ISO timestamp. */
  createdAt: string;
  modelId: string;
  tokenName: string;
  status: RecentRequestStatus;
  /** Whole seconds, as recorded upstream. */
  latencySeconds: number;
  promptTokens: number;
  completionTokens: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
};

export type OverviewAccount = {
  /** Remaining balance in USD, rounded to cents. */
  balanceUsd: number;
  /** Lifetime consumed spend in USD, rounded to cents. */
  usedUsd: number;
  /** Lifetime request count. */
  requestCount: number;
};

export type OverviewData = {
  /** Inclusive UTC ISO dates of the reporting window. */
  rangeStart: string;
  rangeEnd: string;
  account: OverviewAccount;
  metrics: OverviewMetric[];
  usageSeries: UsageSeriesPoint[];
  modelUsage: ModelUsageEntry[];
  recentRequests: RecentRequest[];
};
