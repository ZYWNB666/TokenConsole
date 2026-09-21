import { readRoute } from "@/server/route-helpers";
import { fetchRequestLogs } from "@/server/adapters/new-api/usage";

import type { RequestLogPage } from "@/features/requests/types";

/**
 * GET /api/v1/requests — the caller's request logs with filtering and
 * pagination. Query: start, end (ISO dates), model, key (token name),
 * requestId, page, pageSize. Channel ids and billing internals from the
 * upstream rows are dropped in the adapter; the error-detail content is
 * passed through for the detail view.
 */

const MAX_PAGE_SIZE = 50;

function parseIsoDate(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function cleanText(value: string | null, maxLength: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || undefined;
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const query = {
    startSeconds: parseIsoDate(url.searchParams.get("start")),
    endSeconds: (() => {
      // End date is inclusive: add one day minus a second.
      const end = parseIsoDate(url.searchParams.get("end"));
      return end === undefined ? undefined : end + 86_400 - 1;
    })(),
    modelName: cleanText(url.searchParams.get("model"), 100),
    tokenName: cleanText(url.searchParams.get("key"), 100),
    requestId: cleanText(url.searchParams.get("requestId"), 64),
    page: positiveInt(url.searchParams.get("page"), 1, 10_000),
    pageSize: positiveInt(url.searchParams.get("pageSize"), 20, MAX_PAGE_SIZE),
  };

  return readRoute<RequestLogPage>(request, async (accessToken) => {
    const result = await fetchRequestLogs(accessToken, query);
    return {
      items: result.items.map((log) => ({
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
        isStream: log.isStream,
        content: log.content,
      })),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  });
}
