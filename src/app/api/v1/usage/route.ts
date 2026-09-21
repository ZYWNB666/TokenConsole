import { readRoute } from "@/server/route-helpers";
import { fetchApiKeys } from "@/server/adapters/new-api/tokens";
import { fetchUsageBuckets } from "@/server/adapters/new-api/usage";
import type { UpstreamUsageBucket } from "@/server/adapters/new-api/usage";

import type { UsageAnalysis } from "@/features/usage/types";

/**
 * GET /api/v1/usage?days=7|30|90|365 — usage analysis over a longer window:
 * totals with average per-minute rates, daily series, and breakdowns by
 * model and by API key. The fork caps /api/data/self at 31 days per call,
 * so wider windows are fetched as consecutive chunks and merged server-side.
 * Key ids are internal; the by-key breakdown carries key names only.
 */

const DAY_SECONDS = 86_400;
const ALLOWED_WINDOWS = [7, 30, 90, 365] as const;
const CHUNK_DAYS = 30;

function roundUsd(value: number): number {
  return Number(value.toFixed(4));
}

function isoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/** Fetches buckets over the window in fork-sized chunks. */
async function fetchWindowBuckets(
  accessToken: string,
  startSeconds: number,
  endSeconds: number,
): Promise<UpstreamUsageBucket[]> {
  const chunks: UpstreamUsageBucket[][] = [];
  let cursor = startSeconds;
  while (cursor <= endSeconds) {
    const chunkEnd = Math.min(cursor + (CHUNK_DAYS - 1) * DAY_SECONDS, endSeconds);
    chunks.push(await fetchUsageBuckets(accessToken, cursor, chunkEnd));
    cursor = chunkEnd + DAY_SECONDS;
  }
  return chunks.flat();
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = Number(url.searchParams.get("days") ?? 30);
  const days = (ALLOWED_WINDOWS as readonly number[]).includes(daysParam)
    ? (daysParam as (typeof ALLOWED_WINDOWS)[number])
    : 30;

  return readRoute<UsageAnalysis>(request, async (accessToken) => {
    const endSeconds = Math.floor(Date.now() / 1000);
    const startSeconds = endSeconds - (days - 1) * DAY_SECONDS;
    const [buckets, keys] = await Promise.all([
      fetchWindowBuckets(accessToken, startSeconds, endSeconds),
      fetchApiKeys(accessToken).catch(() => []),
    ]);
    const keyNames = new Map<number, string>(keys.map((key) => [key.id, key.name]));

    // Daily series (missing days as zeros).
    const byDate = new Map<string, { date: string; requests: number; tokens: number; costUsd: number }>();
    for (
      let day = new Date(`${isoDate(startSeconds)}T00:00:00Z`);
      day.toISOString().slice(0, 10) <= isoDate(endSeconds);
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      const date = day.toISOString().slice(0, 10);
      byDate.set(date, { date, requests: 0, tokens: 0, costUsd: 0 });
    }
    const byModel = new Map<string, { modelId: string; requests: number; tokens: number; costUsd: number }>();
    const byKey = new Map<number, { keyName: string; requests: number; tokens: number; costUsd: number }>();
    let totals = { requests: 0, tokens: 0, costUsd: 0 };
    for (const bucket of buckets) {
      const point = byDate.get(bucket.date);
      if (point) {
        point.requests += bucket.requests;
        point.tokens += bucket.tokens;
        point.costUsd += bucket.costUsd;
      }
      const model = byModel.get(bucket.modelId) ?? {
        modelId: bucket.modelId,
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
      model.requests += bucket.requests;
      model.tokens += bucket.tokens;
      model.costUsd += bucket.costUsd;
      byModel.set(bucket.modelId, model);
      const key = byKey.get(bucket.tokenId) ?? {
        // Empty name = the key no longer exists (deleted after use).
        keyName: keyNames.get(bucket.tokenId) ?? "",
        requests: 0,
        tokens: 0,
        costUsd: 0,
      };
      key.requests += bucket.requests;
      key.tokens += bucket.tokens;
      key.costUsd += bucket.costUsd;
      byKey.set(bucket.tokenId, key);
      totals = {
        requests: totals.requests + bucket.requests,
        tokens: totals.tokens + bucket.tokens,
        costUsd: totals.costUsd + bucket.costUsd,
      };
    }
    const minutes = Math.max(1, days * 24 * 60);

    return {
      rangeStart: isoDate(startSeconds),
      rangeEnd: isoDate(endSeconds),
      days,
      totals: {
        requests: totals.requests,
        tokens: totals.tokens,
        costUsd: roundUsd(totals.costUsd),
      },
      // Average rates over the window, matching the gateway dashboard's
      // RPM/TPM semantics (requests/tokens per minute).
      rpm: Number((totals.requests / minutes).toFixed(2)),
      tpm: Number((totals.tokens / minutes).toFixed(2)),
      series: [...byDate.values()].map((point) => ({
        ...point,
        costUsd: roundUsd(point.costUsd),
      })),
      byModel: [...byModel.values()]
        .map((model) => ({ ...model, costUsd: roundUsd(model.costUsd) }))
        .sort((a, b) => b.requests - a.requests),
      byKey: [...byKey.values()]
        .map((key) => ({ ...key, costUsd: roundUsd(key.costUsd) }))
        .sort((a, b) => b.requests - a.requests),
    };
  });
}
