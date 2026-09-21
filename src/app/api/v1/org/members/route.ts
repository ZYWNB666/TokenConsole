import { mutationRoute, readRoute } from "@/server/route-helpers";
import { fetchMembers, updateMember } from "@/server/adapters/new-api/org";

import type { MemberView } from "@/features/organization/types";

/**
 * Organization member routes (admin/owner only — the fork enforces the
 * privilege; members receive a clean 403 and keep their session).
 *
 * GET   /api/v1/org/members?page=&pageSize=
 * PATCH /api/v1/org/members — { id, role?, enabled? }
 */

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(Number(url.searchParams.get("page")) || 1, 1000));
  const pageSize = Math.max(1, Math.min(Number(url.searchParams.get("pageSize")) || 20, 100));

  return readRoute<{ items: MemberView[]; total: number; page: number; pageSize: number }>(
    request,
    async (accessToken) => {
      const result = await fetchMembers(accessToken, page, pageSize);
      return {
        items: result.items.map((member) => ({
          id: member.id,
          username: member.username,
          displayName: member.displayName,
          email: member.email,
          role: member.role,
          status: member.status,
          createdAt: member.createdAt,
          balanceUsd: member.balanceUsd,
          usedUsd: member.usedUsd,
          requestCount: member.requestCount,
        })),
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      };
    },
  );
}

export async function PATCH(request: Request): Promise<Response> {
  let body: { id?: unknown; role?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid request body.", request_id: "" } },
      { status: 400 },
    );
  }
  if (!Number.isInteger(body.id) || (body.id as number) <= 0) {
    return Response.json(
      { error: { code: "invalid_request", message: "Invalid member id.", request_id: "" } },
      { status: 400 },
    );
  }
  const role = body.role === undefined ? undefined : body.role;
  if (role !== undefined && role !== "member" && role !== "admin") {
    return Response.json(
      { error: { code: "invalid_request", message: "Role must be member or admin.", request_id: "" } },
      { status: 400 },
    );
  }
  const enabled = body.enabled === undefined ? undefined : body.enabled;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return Response.json(
      { error: { code: "invalid_request", message: "`enabled` must be a boolean.", request_id: "" } },
      { status: 400 },
    );
  }
  return mutationRoute(request, async (accessToken) => {
    await updateMember(accessToken, body.id as number, {
      ...(role ? { role } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    return { updated: true };
  });
}
