/** Usage-analysis DTOs for the owned /api/v1/usage contract. */

export type UsageSeriesPoint = {
  /** UTC ISO date. */
  date: string;
  requests: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
};

export type UsageModelRow = {
  modelId: string;
  requests: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
};

export type UsageKeyRow = {
  /** Internal id is mapped to the key name server-side; never exposed. */
  keyName: string;
  requests: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
};

export type UsageAnalysis = {
  /** Inclusive UTC ISO dates of the window. */
  rangeStart: string;
  rangeEnd: string;
  days: number;
  totals: {
    requests: number;
    tokens: number;
    costUsd: number;
  };
  /** Average requests/tokens per minute over the window. */
  rpm: number;
  tpm: number;
  series: UsageSeriesPoint[];
  byModel: UsageModelRow[];
  byKey: UsageKeyRow[];
};
