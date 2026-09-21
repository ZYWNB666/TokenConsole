import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-fetch";

import type { ApiKeysData, CreatedKeyData } from "./types";

/** Browser client for the owned /api/v1/keys endpoints. */

export function fetchKeys() {
  return apiGet<ApiKeysData>("/api/v1/keys");
}

export function createKey(input: {
  name: string;
  expiresInDays: number | null;
  quotaUsd: number | null;
  modelLimits: string[];
}) {
  return apiPost<CreatedKeyData>("/api/v1/keys", input);
}

export function updateKey(
  id: number,
  input: { name: string; expiresInDays: number | null; quotaUsd: number | null; modelLimits: string[] },
) {
  return apiPatch<{ updated: boolean }>(`/api/v1/keys/${id}`, input);
}

export function revealKey(id: number) {
  return apiPost<{ key: string }>(`/api/v1/keys/${id}/reveal`);
}

export function setKeyEnabled(id: number, enabled: boolean) {
  return apiPatch<{ updated: boolean }>(`/api/v1/keys/${id}`, { enabled });
}

export function deleteKey(id: number) {
  return apiDelete<{ deleted: boolean }>(`/api/v1/keys/${id}`);
}
