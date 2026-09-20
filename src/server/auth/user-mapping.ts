import "server-only";

import type { UpstreamUser } from "@/server/adapters/new-api/auth";
import type { AuthUser, AuthUserRole } from "@/types/auth";

/**
 * Maps an upstream New API user onto the owned /api/v1/me DTO. This is the
 * only projection point: New API numeric roles become display roles, and
 * everything else the upstream carries (quota, group, aff, stripe_customer,
 * provider bindings, permission maps, …) is dropped here rather than being
 * filtered by every caller.
 *
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

export function toAuthUser(user: UpstreamUser): AuthUser {
  return {
    id: user.id,
    username: user.username,
    display_name: user.display_name || user.username,
    email: user.email,
    role: mapRole(user.role),
    capabilities: [...VERIFIED_CAPABILITIES],
  };
}
