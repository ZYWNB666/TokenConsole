import { mutationRoute } from "@/server/route-helpers";
import {
  deleteApiKey,
  setApiKeyStatus,
  updateApiKey,
} from "@/server/adapters/new-api/tokens";

/**
 * PATCH  /api/v1/keys/:id — two shapes:
 *   { enabled: boolean }              → status toggle only
 *   { name, expiresInDays, quotaUsd, modelLimits } → full edit
 *       (name: 1–50 chars, expiresInDays: null or 1–3650 days,
 *        quotaUsd: null for unlimited or 0–1,000,000, modelLimits: model ids)
 * DELETE /api/v1/keys/:id — permanently delete a key.
 */

async function parseId(params: Promise<{ id: string }>): Promise<number | null> {
  const { id } = await params;
  const parsed = Number(id);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function invalid(message: string): Response {
  return Response.json(
    { error: { code: "invalid_request", message, request_id: "" } },
    { status: 400 },
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = await parseId(params);
  if (id === null) {
    return invalid("Invalid key id.");
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return invalid("Invalid request body.");
  }

  // Status-only toggle.
  if (typeof body.enabled === "boolean" && Object.keys(body).length === 1) {
    return mutationRoute(request, async (accessToken) => {
      await setApiKeyStatus(accessToken, id, body.enabled as boolean);
      return { updated: true };
    });
  }

  // Full edit: the fork replaces every editable field, so all of them are
  // required in one payload.
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 50) {
    return invalid("Key name must be 1–50 characters.");
  }
  let expiresInDays: number | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    if (
      typeof body.expiresInDays !== "number" ||
      !Number.isInteger(body.expiresInDays) ||
      body.expiresInDays < 1 ||
      body.expiresInDays > 3650
    ) {
      return invalid("Invalid expiry.");
    }
    expiresInDays = body.expiresInDays;
  }
  let quotaUsd: number | null = null;
  if (body.quotaUsd !== undefined && body.quotaUsd !== null) {
    if (
      typeof body.quotaUsd !== "number" ||
      !Number.isFinite(body.quotaUsd) ||
      body.quotaUsd < 0 ||
      body.quotaUsd > 1_000_000
    ) {
      return invalid("Invalid quota.");
    }
    quotaUsd = body.quotaUsd;
  }
  const modelLimits: string[] = [];
  if (body.modelLimits !== undefined) {
    if (!Array.isArray(body.modelLimits)) {
      return invalid("modelLimits must be an array of model ids.");
    }
    for (const entry of body.modelLimits) {
      if (typeof entry !== "string" || entry.length > 200 || modelLimits.length >= 50) {
        return invalid("modelLimits must be an array of model ids.");
      }
      const trimmed = entry.trim();
      if (trimmed) modelLimits.push(trimmed);
    }
  }

  return mutationRoute(request, async (accessToken) => {
    await updateApiKey(accessToken, id, { name, expiresInDays, quotaUsd, modelLimits });
    return { updated: true };
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const id = await parseId(params);
  if (id === null) {
    return invalid("Invalid key id.");
  }
  return mutationRoute(request, async (accessToken) => {
    await deleteApiKey(accessToken, id);
    return { deleted: true };
  });
}
