import { mutationRoute, readRoute } from "@/server/route-helpers";
import {
  createApiKey,
  fetchApiKeys,
  revealApiKey,
} from "@/server/adapters/new-api/tokens";

import type { ApiKeyView } from "@/features/api-keys/types";

/**
 * API-key routes.
 *
 * GET  /api/v1/keys        — the caller's keys (masked values only).
 * POST /api/v1/keys        — create a key and return its full value exactly
 *                            once, like a create-only response; the value is
 *                            never stored or listed again.
 */

function toView(row: Awaited<ReturnType<typeof fetchApiKeys>>[number]): ApiKeyView {
  return {
    id: row.id,
    name: row.name,
    maskedKey: row.maskedKey,
    status: row.status,
    createdAt: row.createdAt,
    accessedAt: row.accessedAt,
    expiresAt: row.expiresAt,
    remainQuotaUsd: row.remainQuotaUsd,
    unlimitedQuota: row.unlimitedQuota,
    usedQuotaUsd: row.usedQuotaUsd,
    modelLimits: row.modelLimits,
  };
}

export async function GET(request: Request): Promise<Response> {
  return readRoute(request, async (accessToken) => {
    const keys = await fetchApiKeys(accessToken);
    return { keys: keys.map(toView) };
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: { name?: unknown; expiresInDays?: unknown; quotaUsd?: unknown; modelLimits?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid request body.", request_id: "" } },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 50) {
    return Response.json(
      { error: { code: "invalid_request", message: "Key name must be 1–50 characters.", request_id: "" } },
      { status: 400 },
    );
  }
  let expiresInDays: number | null = null;
  if (body.expiresInDays !== undefined && body.expiresInDays !== null) {
    if (typeof body.expiresInDays !== "number" || !Number.isInteger(body.expiresInDays) || body.expiresInDays < 1 || body.expiresInDays > 3650) {
      return Response.json(
        { error: { code: "invalid_request", message: "Invalid expiry.", request_id: "" } },
        { status: 400 },
      );
    }
    expiresInDays = body.expiresInDays;
  }
  let quotaUsd: number | null = null;
  if (body.quotaUsd !== undefined && body.quotaUsd !== null) {
    if (typeof body.quotaUsd !== "number" || !Number.isFinite(body.quotaUsd) || body.quotaUsd < 0 || body.quotaUsd > 1_000_000) {
      return Response.json(
        { error: { code: "invalid_request", message: "Invalid quota.", request_id: "" } },
        { status: 400 },
      );
    }
    quotaUsd = body.quotaUsd;
  }
  const modelLimits: string[] = [];
  if (body.modelLimits !== undefined) {
    if (!Array.isArray(body.modelLimits)) {
      return Response.json(
        { error: { code: "invalid_request", message: "modelLimits must be an array of model ids.", request_id: "" } },
        { status: 400 },
      );
    }
    for (const entry of body.modelLimits) {
      if (typeof entry !== "string" || entry.length > 200 || modelLimits.length >= 50) {
        return Response.json(
          { error: { code: "invalid_request", message: "modelLimits must be an array of model ids.", request_id: "" } },
          { status: 400 },
        );
      }
      const trimmed = entry.trim();
      if (trimmed) modelLimits.push(trimmed);
    }
  }

  return mutationRoute(request, async (accessToken) => {
    await createApiKey(accessToken, { name, expiresInDays, quotaUsd, modelLimits });
    // The fork does not return the key on creation — reveal it exactly once
    // so the dialog can show it; it is never persisted anywhere after that.
    // Pick the newest key with this name (names are not unique upstream).
    const keys = await fetchApiKeys(accessToken);
    const created = keys
      .filter((row) => row.name === name)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!created) {
      throw new Error("created key not found");
    }
    const key = await revealApiKey(accessToken, created.id);
    return { id: created.id, key, maskedKey: created.maskedKey };
  });
}
