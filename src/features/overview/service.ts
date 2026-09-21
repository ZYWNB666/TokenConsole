import type { OverviewData } from "./types";

/**
 * Browser client for the owned /api/v1/overview endpoint. The browser only
 * ever speaks to this API — the New API fork stays unreachable from the
 * client. The browser never sees or stores tokens; they live only in the
 * encrypted HttpOnly BFF cookie.
 */

export type OverviewState =
  | { status: "loading" }
  | { status: "ready"; data: OverviewData }
  | { status: "unauthenticated" }
  | { status: "error" };

export async function fetchOverview(): Promise<OverviewState> {
  try {
    const response = await fetch("/api/v1/overview", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthenticated" };
    }
    if (!response.ok) {
      return { status: "error" };
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      const data = (parsed as { data: OverviewData }).data;
      if (data && typeof data.rangeStart === "string" && Array.isArray(data.metrics)) {
        return { status: "ready", data };
      }
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}
