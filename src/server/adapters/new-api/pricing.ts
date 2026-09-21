import "server-only";

import {
  parseEnvelope,
  toHttpFailure,
  upstreamFetch,
  UpstreamHttpError,
} from "./internal";

/**
 * Server-only model-catalogue adapter for the New API fork (commit 972aed19).
 *
 * Combines the fork's public pricing data with the models actually available
 * to the calling user. Ratio-based internal pricing converts to public USD
 * per million tokens here: the fork's ratio unit is $0.002 per 1K tokens, so
 * $/1M = ratio × 2. Per-call priced models (quota_type 1) carry model_price
 * in USD directly. Vendor names, channel routing and internal group ratios
 * never leave this module.
 */

const PRICING_PATH = "/api/pricing";
const USER_MODELS_PATH = "/api/user/models";

export type UpstreamModel = {
  modelId: string;
  description: string;
  /** USD per 1M input tokens; null for per-call pricing. */
  inputUsdPerMillion: number | null;
  /** USD per 1M output tokens; null for per-call pricing. */
  outputUsdPerMillion: number | null;
  /** Fixed USD price per call, for per-call priced models. */
  pricePerCallUsd: number | null;
  /** Endpoint protocols this model speaks (e.g. "openai"). */
  endpoints: string[];
};

type UpstreamPricingRow = {
  model_name?: unknown;
  description?: unknown;
  quota_type?: unknown;
  model_ratio?: unknown;
  model_price?: unknown;
  completion_ratio?: unknown;
  supported_endpoint_types?: unknown;
};

const RATIO_USD_PER_MILLION = 2;

function toModel(row: UpstreamPricingRow): UpstreamModel {
  if (
    typeof row.model_name !== "string" || !row.model_name ||
    typeof row.quota_type !== "number" || !Number.isFinite(row.quota_type) ||
    typeof row.model_ratio !== "number" || !Number.isFinite(row.model_ratio) ||
    typeof row.completion_ratio !== "number" || !Number.isFinite(row.completion_ratio)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream pricing row is malformed");
  }
  const modelPrice = typeof row.model_price === "number" ? row.model_price : null;
  const perCall = row.quota_type === 1 && modelPrice !== null && modelPrice > 0;
  const endpoints = Array.isArray(row.supported_endpoint_types)
    ? row.supported_endpoint_types.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    modelId: row.model_name,
    description: typeof row.description === "string" ? row.description : "",
    inputUsdPerMillion: perCall ? null : Number((row.model_ratio * RATIO_USD_PER_MILLION).toFixed(4)),
    outputUsdPerMillion: perCall
      ? null
      : Number((row.model_ratio * row.completion_ratio * RATIO_USD_PER_MILLION).toFixed(4)),
    pricePerCallUsd: perCall && modelPrice !== null ? Number(modelPrice.toFixed(4)) : null,
    endpoints,
  };
}

/**
 * GET /api/pricing + GET /api/user/models — the pricing catalogue
 * restricted to the models the calling user can actually route to.
 */
export async function fetchAvailableModels(accessToken: string): Promise<UpstreamModel[]> {
  const [pricingRes, modelsRes] = await Promise.all([
    upstreamFetch(PRICING_PATH, accessToken),
    upstreamFetch(USER_MODELS_PATH, accessToken),
  ]);
  if (!pricingRes.ok) throw toHttpFailure(pricingRes.status);
  if (!modelsRes.ok) throw toHttpFailure(modelsRes.status);
  const pricingRows = await parseEnvelope<unknown>(pricingRes);
  const available = await parseEnvelope<unknown>(modelsRes);
  if (!Array.isArray(pricingRows) || !Array.isArray(available)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream models response is malformed");
  }
  const availableIds = new Set(
    available.filter((entry): entry is string => typeof entry === "string")
  );
  if (availableIds.size === 0) return [];
  return pricingRows
    .filter((row): row is UpstreamPricingRow => Boolean(row && typeof row === "object"))
    .map(toModel)
    .filter((model) => availableIds.has(model.modelId))
    .sort((a, b) => a.modelId.localeCompare(b.modelId));
}
