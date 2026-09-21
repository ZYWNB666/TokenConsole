import "server-only";

import {
  isPage,
  parseEnvelope,
  toHttpFailure,
  upstreamFetch,
  UpstreamHttpError,
} from "./internal";
import { quotaToUsd } from "./usage";

/**
 * Server-only API-key adapter for the New API fork (commit 972aed19).
 *
 * Wraps the fork's token management endpoints for the caller's own keys.
 * The fork masks key values in list responses and never returns a key on
 * creation; the full key is available only through the explicit,
 * rate-limited reveal endpoint, which this adapter maps to a show-once
 * response. Internal quota integers convert to USD here.
 */

const TOKENS_PATH = "/api/token";
/** Fork group routes end in a slash: list and create live at /api/token/. */
const TOKENS_COLLECTION = `${TOKENS_PATH}/`;

export type UpstreamApiKey = {
  id: number;
  name: string;
  /** Masked key, e.g. "Z1G4**********BzxA" — display only, never a secret. */
  maskedKey: string;
  status: "active" | "disabled" | "expired" | "unknown";
  /** UTC ISO timestamps; null for "never". */
  createdAt: string;
  accessedAt: string;
  expiresAt: string | null;
  /** Remaining quota in USD; null when the key is unlimited. */
  remainQuotaUsd: number | null;
  unlimitedQuota: boolean;
  /** Consumed spend in USD, 4-decimal precision. */
  usedQuotaUsd: number;
  modelLimitsEnabled: boolean;
  /** Comma-separated model ids the key may call; empty means all. */
  modelLimits: string[];
};

export type NewApiKeyInput = {
  name: string;
  /** Days until expiry; null for a key that never expires. */
  expiresInDays: number | null;
  /** Quota cap in USD; null for an unlimited key. */
  quotaUsd: number | null;
  /** Model ids the key may call; empty means all models. */
  modelLimits: string[];
};

function mapStatus(status: number): UpstreamApiKey["status"] {
  if (status === 1) return "active";
  if (status === 2) return "disabled";
  if (status === 3) return "expired";
  return "unknown";
}

type UpstreamTokenRow = {
  id?: unknown;
  name?: unknown;
  key?: unknown;
  status?: unknown;
  created_time?: unknown;
  accessed_time?: unknown;
  expired_time?: unknown;
  remain_quota?: unknown;
  unlimited_quota?: unknown;
  used_quota?: unknown;
  model_limits_enabled?: unknown;
  model_limits?: unknown;
};

function toApiKey(row: UpstreamTokenRow): UpstreamApiKey {
  if (
    !Number.isInteger(row.id) || (row.id as number) <= 0 ||
    typeof row.name !== "string" || !row.name ||
    typeof row.key !== "string" || !row.key ||
    typeof row.status !== "number" ||
    typeof row.created_time !== "number" || !Number.isFinite(row.created_time) ||
    typeof row.accessed_time !== "number" || !Number.isFinite(row.accessed_time) ||
    typeof row.used_quota !== "number" || !Number.isFinite(row.used_quota) ||
    typeof row.unlimited_quota !== "boolean"
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream token row is malformed");
  }
  const remainQuota = row.remain_quota;
  if (typeof remainQuota !== "number" || !Number.isFinite(remainQuota)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream token row is malformed");
  }
  const expiredTime = row.expired_time;
  const modelLimits = row.model_limits;
  return {
    id: row.id as number,
    name: row.name,
    maskedKey: row.key,
    status: mapStatus(row.status),
    createdAt: new Date((row.created_time as number) * 1000).toISOString(),
    accessedAt: new Date((row.accessed_time as number) * 1000).toISOString(),
    expiresAt: typeof expiredTime === "number" && expiredTime > 0
      ? new Date(expiredTime * 1000).toISOString()
      : null,
    remainQuotaUsd: row.unlimited_quota ? null : quotaToUsd(remainQuota, 2),
    unlimitedQuota: row.unlimited_quota,
    usedQuotaUsd: quotaToUsd(row.used_quota, 4),
    modelLimitsEnabled: row.model_limits_enabled === true,
    modelLimits: typeof modelLimits === "string" && modelLimits
      ? modelLimits.split(",").map((entry) => entry.trim()).filter(Boolean)
      : [],
  };
}

/** GET /api/token/ — the caller's keys, newest first. */
export async function fetchApiKeys(accessToken: string): Promise<UpstreamApiKey[]> {
  const response = await upstreamFetch(TOKENS_COLLECTION, accessToken, {
    query: { p: "1", page_size: "100" },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const page = await parseEnvelope<unknown>(response);
  if (!isPage<UpstreamTokenRow>(page)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream tokens response is malformed");
  }
  return page.items.map(toApiKey);
}

/** POST /api/token/ — create a key. The fork does not return the key value. */
export async function createApiKey(accessToken: string, input: NewApiKeyInput): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const response = await upstreamFetch(TOKENS_COLLECTION, accessToken, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      expired_time: input.expiresInDays === null ? -1 : now + input.expiresInDays * 86_400,
      unlimited_quota: input.quotaUsd === null,
      remain_quota: input.quotaUsd === null ? 0 : Math.round(input.quotaUsd * 500_000),
      model_limits_enabled: input.modelLimits.length > 0,
      model_limits: input.modelLimits.join(","),
      allow_ips: "",
      group: "",
    }),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  // The fork returns {success:true} without data on creation.
  await parseEnvelopeAllowEmpty(response);
}

/** Accepts envelopes with or without a data payload (creation returns none). */
async function parseEnvelopeAllowEmpty(response: Response): Promise<void> {
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  const candidate = parsed as { success?: unknown };
  if (candidate.success !== true) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request was rejected");
  }
}

/** PUT /api/token/?status_only=true — enable or disable a key. */
export async function setApiKeyStatus(
  accessToken: string,
  id: number,
  enabled: boolean,
): Promise<void> {
  const response = await upstreamFetch(`${TOKENS_PATH}/?status_only=true`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ id, status: enabled ? 1 : 2 }),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  await parseEnvelopeAllowEmpty(response);
}

/**
 * PUT /api/token/ — full edit. The fork replaces every editable field with
 * the request body, so the caller must send the complete desired state
 * (this is also why the edit payload mirrors the creation payload).
 */
export async function updateApiKey(
  accessToken: string,
  id: number,
  input: NewApiKeyInput,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const response = await upstreamFetch(TOKENS_COLLECTION, accessToken, {
    method: "PUT",
    body: JSON.stringify({
      id,
      name: input.name,
      expired_time: input.expiresInDays === null ? -1 : now + input.expiresInDays * 86_400,
      unlimited_quota: input.quotaUsd === null,
      remain_quota: input.quotaUsd === null ? 0 : Math.round(input.quotaUsd * 500_000),
      model_limits_enabled: input.modelLimits.length > 0,
      model_limits: input.modelLimits.join(","),
      allow_ips: "",
      group: "",
    }),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  await parseEnvelopeAllowEmpty(response);
}

/** DELETE /api/token/:id — remove a key permanently. */
export async function deleteApiKey(accessToken: string, id: number): Promise<void> {
  const response = await upstreamFetch(`${TOKENS_PATH}/${id}`, accessToken, { method: "DELETE" });
  if (!response.ok) throw toHttpFailure(response.status);
  await parseEnvelopeAllowEmpty(response);
}

/** POST /api/token/:id/key — reveal the full key value (rate limited upstream). */
export async function revealApiKey(accessToken: string, id: number): Promise<string> {
  const response = await upstreamFetch(`${TOKENS_PATH}/${id}/key`, accessToken, { method: "POST" });
  if (!response.ok) throw toHttpFailure(response.status);
  const data = await parseEnvelope<{ key?: unknown }>(response);
  if (typeof data.key !== "string" || !data.key) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream key reveal is malformed");
  }
  // The fork stores key values without the public prefix; customers use
  // (and copy) the "sk-" form, so it is added here — once, at the boundary.
  return data.key.startsWith("sk-") ? data.key : `sk-${data.key}`;
}

/**
 * POST /api/token/ + POST /api/token/:id/key + DELETE /api/token/:id —
 * mints a short-lived key for the playground. The caller MUST delete it;
 * the full key never leaves the server process.
 */
export async function mintEphemeralKey(
  accessToken: string,
  name: string,
): Promise<{ id: number; key: string; delete: () => Promise<void> }> {
  await createApiKey(accessToken, { name, expiresInDays: null, quotaUsd: null, modelLimits: [] });
  // The just-created token is the newest one (created_time desc, id desc as
  // the tie-break) — creation does not return the id.
  const response = await upstreamFetch(TOKENS_COLLECTION, accessToken, {
    query: { p: "1", page_size: "100" },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const page = await parseEnvelope<unknown>(response);
  if (!isPage<UpstreamTokenRow>(page)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream tokens response is malformed");
  }
  const created = page.items
    .filter((row) => Number.isInteger(row.id))
    .sort(
      (a, b) =>
        (Number(b.created_time ?? 0) - Number(a.created_time ?? 0)) ||
        (Number(b.id ?? 0) - Number(a.id ?? 0)),
    )[0];
  if (!created || typeof created.id !== "number") {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "ephemeral key was not created");
  }
  const key = await revealApiKey(accessToken, created.id);
  return {
    id: created.id,
    key,
    delete: async () => {
      await deleteApiKey(accessToken, created.id as number);
    },
  };
}
