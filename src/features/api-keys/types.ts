/**
 * API-key module DTOs for the owned /api/v1/keys contract. Key values appear
 * only in the creation/reveal responses (show-once); every list shape
 * carries the masked value only.
 */

export type ApiKeyStatus = "active" | "disabled" | "expired" | "unknown";

export type ApiKeyView = {
  id: number;
  name: string;
  /** Masked value, e.g. "Z1G4**********BzxA" — display only. */
  maskedKey: string;
  status: ApiKeyStatus;
  /** UTC ISO timestamps; expiresAt null for a key that never expires. */
  createdAt: string;
  accessedAt: string;
  expiresAt: string | null;
  /** Remaining quota in USD; null when the key is unlimited. */
  remainQuotaUsd: number | null;
  unlimitedQuota: boolean;
  /** Consumed spend in USD, 4-decimal precision. */
  usedQuotaUsd: number;
  /** Model ids the key may call; empty means all models. */
  modelLimits: string[];
};

export type ApiKeysData = {
  keys: ApiKeyView[];
};

/** POST /api/v1/keys response — the full key value appears exactly once. */
export type CreatedKeyData = {
  id: number;
  key: string;
  maskedKey: string;
};
