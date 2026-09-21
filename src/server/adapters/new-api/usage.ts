import "server-only";

import { isPage, parseEnvelope, toHttpFailure, upstreamFetch, UpstreamHttpError } from "./internal";

/**
 * Server-only usage adapter for the New API fork (commit 972aed19).
 *
 * Reads the caller's own account, aggregated usage and request logs with the
 * Bearer access token held in the encrypted BFF session. Internal quota
 * integers become USD values (QuotaPerUnit = 500,000 per $1, the fork's
 * compiled default) before anything leaves this module; raw upstream rows
 * (channel ids, `other` billing details, …) are never passed through.
 */

const SELF_PATH = "/api/user/self";
const QUOTA_DATA_PATH = "/api/data/self";
const LOGS_PATH = "/api/log/self";

/** Internal quota units per one US dollar (fork default: 500,000). */
export const QUOTA_PER_UNIT_USD = 500_000;

/** Fork log types that represent customer API requests. */
export const LOG_TYPE_CONSUME = 2;
export const LOG_TYPE_ERROR = 5;

/** The caller's account in public units. */
export type UpstreamAccount = {
  /** Remaining balance in USD, rounded to cents. */
  balanceUsd: number;
  /** Lifetime consumed spend in USD, rounded to cents. */
  usedUsd: number;
  /** Lifetime request count. */
  requestCount: number;
};

/** One aggregated usage bucket as reported by the fork. */
export type UpstreamUsageBucket = {
  /** UTC ISO date the bucket falls in, e.g. "2026-09-20". */
  date: string;
  modelId: string;
  /** Internal token (key) id — mapped to a name by the caller, never exposed. */
  tokenId: number;
  requests: number;
  tokens: number;
  /** Spend in USD for this bucket, 4-decimal precision. */
  costUsd: number;
};

/** One request log entry in public units. */
export type UpstreamRequestLog = {
  id: string;
  /** UTC ISO timestamp. */
  createdAt: string;
  modelId: string;
  tokenName: string;
  status: "success" | "error";
  /** Whole seconds, as recorded by the fork. */
  latencySeconds: number;
  promptTokens: number;
  completionTokens: number;
  tokens: number;
  /** Spend in USD, 4-decimal precision. */
  costUsd: number;
  /** Whether the request was streamed. */
  isStream: boolean;
  /** Error detail for failed requests; empty for successes. */
  content: string;
};

export function quotaToUsd(quota: number, fractionDigits: number): number {
  return Number((quota / QUOTA_PER_UNIT_USD).toFixed(fractionDigits));
}

function isoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** GET /api/user/self → account in public units. */
export async function fetchAccount(accessToken: string): Promise<UpstreamAccount> {
  const response = await upstreamFetch(SELF_PATH, accessToken);
  if (!response.ok) throw toHttpFailure(response.status);
  const data = await parseEnvelope<Record<string, unknown>>(response);
  const quota = data.quota;
  const usedQuota = data.used_quota;
  const requestCount = data.request_count;
  if (
    typeof quota !== "number" || !Number.isFinite(quota) ||
    typeof usedQuota !== "number" || !Number.isFinite(usedQuota) ||
    typeof requestCount !== "number" || !Number.isInteger(requestCount) || requestCount < 0
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream account response is malformed");
  }
  return {
    balanceUsd: quotaToUsd(quota, 2),
    usedUsd: quotaToUsd(usedQuota, 2),
    requestCount,
  };
}

type UpstreamQuotaDataRow = {
  model_name?: unknown;
  created_at?: unknown;
  token_used?: unknown;
  count?: unknown;
  quota?: unknown;
  token_id?: unknown;
};

/** GET /api/data/self (span capped at 31 days by the fork). */
export async function fetchUsageBuckets(
  accessToken: string,
  startSeconds: number,
  endSeconds: number,
): Promise<UpstreamUsageBucket[]> {
  const response = await upstreamFetch(QUOTA_DATA_PATH, accessToken, {
    query: {
      start_timestamp: String(startSeconds),
      end_timestamp: String(endSeconds),
    },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const rows = await parseEnvelope<unknown>(response);
  if (!Array.isArray(rows)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream usage response is malformed");
  }
  const buckets: UpstreamUsageBucket[] = [];
  for (const row of rows as UpstreamQuotaDataRow[]) {
    if (
      typeof row.model_name !== "string" || !row.model_name ||
      typeof row.created_at !== "number" || !Number.isFinite(row.created_at) ||
      typeof row.token_used !== "number" || !Number.isFinite(row.token_used) ||
      typeof row.count !== "number" || !Number.isFinite(row.count) ||
      typeof row.quota !== "number" || !Number.isFinite(row.quota) ||
      typeof row.token_id !== "number" || !Number.isFinite(row.token_id)
    ) {
      // One malformed row poisons aggregates — refuse rather than invent.
      throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream usage row is malformed");
    }
    buckets.push({
      date: isoDate(row.created_at),
      modelId: row.model_name,
      tokenId: row.token_id,
      requests: row.count,
      tokens: row.token_used,
      costUsd: quotaToUsd(row.quota, 4),
    });
  }
  return buckets;
}

type UpstreamLogRow = {
  id?: unknown;
  created_at?: unknown;
  type?: unknown;
  model_name?: unknown;
  token_name?: unknown;
  use_time?: unknown;
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  quota?: unknown;
  is_stream?: unknown;
  request_id?: unknown;
  content?: unknown;
};

function toRequestLog(row: UpstreamLogRow): UpstreamRequestLog {
  if (
    typeof row.created_at !== "number" || !Number.isFinite(row.created_at) ||
    typeof row.model_name !== "string" || !row.model_name ||
    typeof row.use_time !== "number" || !Number.isFinite(row.use_time) ||
    typeof row.prompt_tokens !== "number" || !Number.isFinite(row.prompt_tokens) ||
    typeof row.completion_tokens !== "number" || !Number.isFinite(row.completion_tokens) ||
    typeof row.quota !== "number" || !Number.isFinite(row.quota)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream log row is malformed");
  }
  return {
    id: typeof row.request_id === "string" && row.request_id
      ? row.request_id
      : String(row.id ?? row.created_at),
    createdAt: new Date(row.created_at * 1000).toISOString(),
    modelId: row.model_name,
    tokenName: typeof row.token_name === "string" ? row.token_name : "",
    status: row.type === LOG_TYPE_ERROR ? "error" : "success",
    latencySeconds: row.use_time,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    tokens: row.prompt_tokens + row.completion_tokens,
    costUsd: quotaToUsd(row.quota, 4),
    isStream: row.is_stream === true,
    // Customer-visible error detail for failed requests. The row's `other`
    // field (internal billing/admin data, channel ids) is never captured.
    content: typeof row.content === "string" ? row.content.slice(0, 2_000) : "",
  };
}

export type LogQuery = {
  startSeconds?: number;
  endSeconds?: number;
  modelName?: string;
  tokenName?: string;
  requestId?: string;
  page?: number;
  pageSize?: number;
};

/**
 * GET /api/log/self — the caller's request logs (consume and error types
 * only), newest first, with the fork's filtering and pagination.
 */
export async function fetchRequestLogs(
  accessToken: string,
  query: LogQuery,
): Promise<{ items: UpstreamRequestLog[]; total: number; page: number; pageSize: number }> {
  const response = await upstreamFetch(LOGS_PATH, accessToken, {
    query: {
      ...(query.startSeconds !== undefined ? { start_timestamp: String(query.startSeconds) } : {}),
      ...(query.endSeconds !== undefined ? { end_timestamp: String(query.endSeconds) } : {}),
      ...(query.modelName ? { model_name: query.modelName } : {}),
      ...(query.tokenName ? { token_name: query.tokenName } : {}),
      ...(query.requestId ? { request_id: query.requestId } : {}),
      p: String(query.page ?? 1),
      page_size: String(query.pageSize ?? 20),
    },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const page = await parseEnvelope<unknown>(response);
  if (!isPage<UpstreamLogRow>(page)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream logs response is malformed");
  }
  const items = page.items
    .filter((row) => row.type === LOG_TYPE_CONSUME || row.type === LOG_TYPE_ERROR)
    .map(toRequestLog);
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return { items, total: page.total, page: page.page, pageSize: page.page_size };
}

/**
 * GET /api/log/self — the caller's most recent request logs, newest first.
 * Non-request rows (topup, manage, system) share the feed; over-fetch so
 * filtering still leaves `limit` real requests.
 */
export async function fetchRecentRequestLogs(
  accessToken: string,
  limit: number,
): Promise<UpstreamRequestLog[]> {
  const fetchSize = Math.min(50, Math.max(limit * 3, 20));
  const { items } = await fetchRequestLogs(accessToken, { page: 1, pageSize: fetchSize });
  return items.slice(0, limit);
}

/** GET /api/log/self/stat — period totals in public units. */
export async function fetchLogStat(
  accessToken: string,
  startSeconds: number,
  endSeconds: number,
  filters: { modelName?: string; tokenName?: string } = {},
): Promise<{ costUsd: number; rpm: number; tpm: number }> {
  const response = await upstreamFetch(`${LOGS_PATH}/stat`, accessToken, {
    query: {
      start_timestamp: String(startSeconds),
      end_timestamp: String(endSeconds),
      ...(filters.modelName ? { model_name: filters.modelName } : {}),
      ...(filters.tokenName ? { token_name: filters.tokenName } : {}),
    },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const data = await parseEnvelope<Record<string, unknown>>(response);
  const quota = data.quota;
  const rpm = data.rpm;
  const tpm = data.tpm;
  if (
    typeof quota !== "number" || !Number.isFinite(quota) ||
    typeof rpm !== "number" || !Number.isFinite(rpm) ||
    typeof tpm !== "number" || !Number.isFinite(tpm)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream stat response is malformed");
  }
  return { costUsd: quotaToUsd(quota, 4), rpm, tpm };
}
