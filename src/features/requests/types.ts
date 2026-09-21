/** Request-log module DTOs for the owned /api/v1/requests contract. */

export type RequestLogStatus = "success" | "error";

export type RequestLogItem = {
  id: string;
  /** UTC ISO timestamp. */
  createdAt: string;
  modelId: string;
  tokenName: string;
  status: RequestLogStatus;
  /** Whole seconds, as recorded upstream. */
  latencySeconds: number;
  promptTokens: number;
  completionTokens: number;
  tokens: number;
  /** USD, 4-decimal precision. */
  costUsd: number;
  isStream: boolean;
  /** Error detail for failed requests; empty for successes. */
  content: string;
};

export type RequestLogPage = {
  items: RequestLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type RequestLogFilters = {
  /** Inclusive UTC ISO dates. */
  start: string | null;
  end: string | null;
  model: string;
  key: string;
  requestId: string;
};
