/** Model-catalogue DTOs for the owned /api/v1/models contract. */

export type ModelView = {
  modelId: string;
  description: string;
  /** USD per 1M input tokens; null for per-call pricing. */
  inputUsdPerMillion: number | null;
  /** USD per 1M output tokens; null for per-call pricing. */
  outputUsdPerMillion: number | null;
  /** Fixed USD price per call, for per-call priced models. */
  pricePerCallUsd: number | null;
  /** Endpoint protocols, e.g. ["openai"]. */
  endpoints: string[];
};

export type ModelsData = {
  models: ModelView[];
};
