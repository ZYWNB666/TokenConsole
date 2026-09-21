import { readRoute } from "@/server/route-helpers";
import { fetchLogStat } from "@/server/adapters/new-api/usage";

/**
 * GET /api/v1/requests/summary — spend total for the same filter as the
 * requests table (without pagination), mirroring the gateway's log-stats
 * strip. Query: start, end (ISO dates), model, key.
 */

const DAY_SECONDS = 86_400;

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const modelName = cleanText(url.searchParams.get("model"), 100);
  const tokenName = cleanText(url.searchParams.get("key"), 100);

  return readRoute<{ costUsd: number }>(request, async (accessToken) => {
    const now = Math.floor(Date.now() / 1000);
    const start = parseIsoDate(url.searchParams.get("start")) ?? now - 29 * DAY_SECONDS;
    const end = (() => {
      const end = parseIsoDate(url.searchParams.get("end"));
      return (end === undefined ? now : end + DAY_SECONDS - 1);
    })();
    const stat = await fetchLogStat(accessToken, start, end, {
      ...(modelName ? { modelName } : {}),
      ...(tokenName ? { tokenName } : {}),
    });
    return { costUsd: stat.costUsd };
  });
}
