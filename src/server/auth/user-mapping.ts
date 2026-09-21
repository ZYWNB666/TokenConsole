import "server-only";

import { QUOTA_PER_UNIT_USD } from "@/server/adapters/new-api/usage";
import type { UpstreamAccountFields, UpstreamUser } from "@/server/adapters/new-api/auth";
import type { AuthAccount, AuthUser, AuthUserRole } from "@/types/auth";

/**
 * Maps an upstream New API user onto the owned /api/v1/me DTO. This is the
 * only projection point: New API numeric roles become display roles, and
 * everything else the upstream carries (group, aff, provider bindings,
 * permission maps, …) is dropped here rather than being filtered by every
 * caller.
 *
 * Account counters are the one deliberate exception: quota/used_quota are
 * converted from the fork's internal quota units into public USD values
 * here, so the raw integers and the unit ratio never cross this boundary.
 * Capabilities list only what TokenConsole itself has implemented and
 * verified. Organization management does not exist yet — until the owned
 * organization/member database lands, no user (regardless of upstream role)
 * is granted organization capabilities.
 */

function mapRole(role: number): AuthUserRole {
  if (role >= 100) return "owner";
  if (role >= 10) return "admin";
  return "member";
}

/** The only capability every signed-in console user verifiably has today. */
const VERIFIED_CAPABILITIES = ["console:access"] as const;

function mapAccount(account: UpstreamAccountFields): AuthAccount {
  return {
    balance_usd: Number((account.quota / QUOTA_PER_UNIT_USD).toFixed(2)),
    used_usd: Number((account.usedQuota / QUOTA_PER_UNIT_USD).toFixed(2)),
    request_count: account.requestCount,
  };
}

export function toAuthUser(user: UpstreamUser, account?: UpstreamAccountFields): AuthUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    email: user.email,
    role: mapRole(user.role),
    capabilities: [...VERIFIED_CAPABILITIES],
    ...(account ? { account: mapAccount(account) } : {}),
  };
}
