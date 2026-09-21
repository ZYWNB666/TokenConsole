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
 * Server-only organization adapter for the New API fork (commit 972aed19).
 *
 * Member management over the fork's admin user endpoints. These calls only
 * succeed for upstream admin/owner roles — the fork enforces the privilege
 * itself (members receive 403 AUTH_INSUFFICIENT_PRIVILEGE, mapped to
 * AUTH_REJECTED here so the BFF can answer with a clean 403). Usernames,
 * emails and quotas are exposed; auth bindings, remarks and credentials of
 * other members never cross this boundary.
 */

const USERS_PATH = "/api/user";
/** Fork group routes end in a slash: list and update live at /api/user/. */
const USERS_COLLECTION = `${USERS_PATH}/`;

export type UpstreamMember = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: "owner" | "admin" | "member";
  status: "active" | "banned" | "unknown";
  /** UTC ISO timestamp of registration. */
  createdAt: string;
  /** Remaining balance in USD. */
  balanceUsd: number;
  /** Consumed spend in USD. */
  usedUsd: number;
  requestCount: number;
};

type UpstreamUserRow = {
  id?: unknown;
  username?: unknown;
  display_name?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  created_at?: unknown;
  quota?: unknown;
  used_quota?: unknown;
  request_count?: unknown;
};

function mapRole(role: unknown): UpstreamMember["role"] {
  if (role === 100) return "owner";
  if (role === 10) return "admin";
  return "member";
}

function mapStatus(status: unknown): UpstreamMember["status"] {
  if (status === 1) return "active";
  if (status === 2) return "banned";
  return "unknown";
}

function toMember(row: UpstreamUserRow): UpstreamMember {
  if (
    !Number.isInteger(row.id) || (row.id as number) <= 0 ||
    typeof row.username !== "string" || !row.username ||
    typeof row.role !== "number" ||
    typeof row.quota !== "number" || !Number.isFinite(row.quota) ||
    typeof row.used_quota !== "number" || !Number.isFinite(row.used_quota) ||
    typeof row.request_count !== "number" || !Number.isFinite(row.request_count)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream member row is malformed");
  }
  return {
    id: row.id as number,
    username: row.username,
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    email: typeof row.email === "string" ? row.email : "",
    role: mapRole(row.role),
    status: mapStatus(row.status),
    createdAt: typeof row.created_at === "string" && row.created_at
      ? new Date(row.created_at).toISOString()
      : new Date(0).toISOString(),
    balanceUsd: quotaToUsd(row.quota, 2),
    usedUsd: quotaToUsd(row.used_quota, 2),
    requestCount: row.request_count,
  };
}

/** GET /api/user/ — members, paginated, optionally filtered by keyword. */
export async function fetchMembers(
  accessToken: string,
  page: number,
  pageSize: number,
): Promise<{ items: UpstreamMember[]; total: number; page: number; pageSize: number }> {
  const response = await upstreamFetch(USERS_COLLECTION, accessToken, {
    query: { p: String(page), page_size: String(pageSize) },
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const result = await parseEnvelope<unknown>(response);
  if (!isPage<UpstreamUserRow>(result)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream members response is malformed");
  }
  return {
    items: result.items.map(toMember),
    total: result.total,
    page: result.page,
    pageSize: result.page_size,
  };
}

/**
 * PUT /api/user/ — change a member's role or enabled status. The fork's own
 * admin-route authorization decides whether the caller may do this.
 */
export async function updateMember(
  accessToken: string,
  id: number,
  input: { role?: "member" | "admin"; enabled?: boolean },
): Promise<void> {
  const response = await upstreamFetch(USERS_COLLECTION, accessToken, {
    method: "PUT",
    body: JSON.stringify({
      id,
      ...(input.role ? { role: input.role === "admin" ? 10 : 1 } : {}),
      ...(input.enabled !== undefined ? { status: input.enabled ? 1 : 2 } : {}),
    }),
  });
  if (!response.ok) throw toHttpFailure(response.status);
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream response is malformed");
  }
  if (!parsed || typeof parsed !== "object" || (parsed as { success?: unknown }).success !== true) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream request was rejected");
  }
}
