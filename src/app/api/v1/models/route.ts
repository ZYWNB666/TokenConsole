import { readRoute } from "@/server/route-helpers";
import { fetchAvailableModels } from "@/server/adapters/new-api/pricing";

import type { ModelView } from "@/features/models/types";

/**
 * GET /api/v1/models — the model catalogue available to the caller, with
 * public USD pricing per million tokens (or per call). Internal ratios,
 * vendors, groups and channel routing never leave the server.
 */
export async function GET(request: Request): Promise<Response> {
  return readRoute<{ models: ModelView[] }>(request, async (accessToken) => {
    const models = await fetchAvailableModels(accessToken);
    return {
      models: models.map((model) => ({
        modelId: model.modelId,
        description: model.description,
        inputUsdPerMillion: model.inputUsdPerMillion,
        outputUsdPerMillion: model.outputUsdPerMillion,
        pricePerCallUsd: model.pricePerCallUsd,
        endpoints: model.endpoints,
      })),
    };
  });
}
