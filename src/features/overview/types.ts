/**
 * Overview dashboard DTOs. These mirror the planned /api/v1/dashboard
 * contract (see ../../docs/API_CONTRACT.md): money is a pre-formatted USD
 * string, token/latency counts are integers, and the UI never sees upstream
 * gateway structures.
 */

export type TrendDirection = "up" | "down" | "flat";
export type TrendTone = "positive" | "negative" | "neutral";

export type MetricSummary = {
  label: string;
  value: string;
  trend: {
    direction: TrendDirection;
    tone: TrendTone;
    label: string;
  };
};

export type UsageMetricKey = "cost" | "requests" | "tokens";

export type UsageSeriesPoint = {
  /** Short display label, e.g. "Sep 20". */
  date: string;
  /** ISO date, e.g. "2026-09-20". */
  isoDate: string;
  cost: number;
  requests: number;
  tokens: number;
};

export type ModelUsageEntry = {
  modelId: string;
  requests: number;
  /** Share of total requests in the period, 0–1. */
  share: number;
};

export type ApiStatusRegion = {
  region: string;
  /** Pre-formatted availability, e.g. "99.99%". */
  availability: string;
  /** Short SLA note. */
  note: string;
};

export type RecentRequestStatus = "success" | "error" | "rate_limited";

export type RecentRequest = {
  id: string;
  /** Display timestamp, UTC, e.g. "Sep 20, 14:32". */
  time: string;
  modelId: string;
  project: string;
  status: RecentRequestStatus;
  latencyMs: number;
  tokens: number;
  /** Pre-formatted USD cost. */
  cost: string;
};

export type DashboardData = {
  /** Human-readable reporting range, e.g. "Last 30 days". */
  range: string;
  metrics: MetricSummary[];
  usageSeries: UsageSeriesPoint[];
  modelUsage: ModelUsageEntry[];
  apiStatus: ApiStatusRegion[];
  recentRequests: RecentRequest[];
};
