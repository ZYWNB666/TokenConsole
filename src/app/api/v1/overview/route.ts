import { readRoute } from "@/server/route-helpers";
import {
  fetchAccount,
  fetchRecentRequestLogs,
  fetchUsageBuckets,
} from "@/server/adapters/new-api/usage";
import type { UpstreamUsageBucket } from "@/server/adapters/new-api/usage";

import type {
  ModelUsageEntry,
  OverviewData,
  OverviewMetric,
  RecentRequest,
  UsageSeriesPoint,
} from "@/features/overview/types";

/**
 * GET /api/v1/overview — the signed-in caller's real dashboard: account
 * balance, 30-day usage metrics/series/model breakdown and the most recent
 * requests, all read from the New API fork with the session's access token
 * (one refresh-and-retry at most). Money is converted to USD inside the
 * adapter; the browser only ever sees public units.
 */

const WINDOW_DAYS = 30;
const RECENT_REQUEST_LIMIT = 8;
const MODEL_USAGE_LIMIT = 5;
const DAY_SECONDS = 86_400;

function isoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function roundUsd(value: number): number {
  return Number(value.toFixed(4));
}

/** Builds a complete daily series: days without traffic appear as zeros. */
function buildSeries(buckets: UpstreamUsageBucket[], startDay: string, endDay: string): UsageSeriesPoint[] {
  const byDate = new Map<string, UsageSeriesPoint>();
  for (
    let day = new Date(`${startDay}T00:00:00Z`);
    day.toISOString().slice(0, 10) <= endDay;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const date = day.toISOString().slice(0, 10);
    byDate.set(date, { date, requests: 0, tokens: 0, costUsd: 0 });
  }
  for (const bucket of buckets) {
    const point = byDate.get(bucket.date);
    if (!point) continue;
    point.requests += bucket.requests;
    point.tokens += bucket.tokens;
    point.costUsd += bucket.costUsd;
  }
  return [...byDate.values()].map((point) => ({
    ...point,
    costUsd: roundUsd(point.costUsd),
  }));
}

function buildMetrics(series: UsageSeriesPoint[]): OverviewMetric[] {
  const total = (pick: (point: UsageSeriesPoint) => number) =>
    series.reduce((sum, point) => sum + pick(point), 0);
  const window = (from: number, to: number, pick: (point: UsageSeriesPoint) => number) =>
    series.slice(from, to).reduce((sum, point) => sum + pick(point), 0);
  const pickRequests = (point: UsageSeriesPoint) => point.requests;
  const pickTokens = (point: UsageSeriesPoint) => point.tokens;
  const pickCost = (point: UsageSeriesPoint) => point.costUsd;
  return [
    { key: "requests", total: total(pickRequests), recent: window(-7, series.length, pickRequests), previous: window(-14, -7, pickRequests) },
    { key: "cost", total: roundUsd(total(pickCost)), recent: roundUsd(window(-7, series.length, pickCost)), previous: roundUsd(window(-14, -7, pickCost)) },
    { key: "tokens", total: total(pickTokens), recent: window(-7, series.length, pickTokens), previous: window(-14, -7, pickTokens) },
  ];
}

function buildModelUsage(buckets: UpstreamUsageBucket[]): ModelUsageEntry[] {
  const byModel = new Map<string, number>();
  let totalRequests = 0;
  for (const bucket of buckets) {
    byModel.set(bucket.modelId, (byModel.get(bucket.modelId) ?? 0) + bucket.requests);
    totalRequests += bucket.requests;
  }
  if (totalRequests === 0) return [];
  return [...byModel.entries()]
    .map(([modelId, requests]) => ({ modelId, requests, share: requests / totalRequests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, MODEL_USAGE_LIMIT);
}

export async function GET(request: Request): Promise<Response> {
  const endSeconds = Math.floor(Date.now() / 1000);
  // Inclusive window: 30 calendar dates from rangeStart through today.
  const startSeconds = endSeconds - (WINDOW_DAYS - 1) * DAY_SECONDS;

  return readRoute<OverviewData>(request, async (accessToken) => {
    const [account, buckets, logs] = await Promise.all([
      fetchAccount(accessToken),
      fetchUsageBuckets(accessToken, startSeconds, endSeconds),
      fetchRecentRequestLogs(accessToken, RECENT_REQUEST_LIMIT),
    ]);
    const series = buildSeries(buckets, isoDate(startSeconds), isoDate(endSeconds));
    return {
      rangeStart: isoDate(startSeconds),
      rangeEnd: isoDate(endSeconds),
      account: {
        balanceUsd: account.balanceUsd,
        usedUsd: account.usedUsd,
        requestCount: account.requestCount,
      },
      metrics: buildMetrics(series),
      usageSeries: series,
      modelUsage: buildModelUsage(buckets),
      recentRequests: logs.map<RecentRequest>((log) => ({
        id: log.id,
        createdAt: log.createdAt,
        modelId: log.modelId,
        tokenName: log.tokenName,
        status: log.status,
        latencySeconds: log.latencySeconds,
        promptTokens: log.promptTokens,
        completionTokens: log.completionTokens,
        tokens: log.tokens,
        costUsd: log.costUsd,
      })),
    };
  });
}
