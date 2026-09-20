import { dashboardMock } from "@/mocks/dashboard";

import type { DashboardData } from "./types";

/**
 * Demo data source for the Overview dashboard. A later phase replaces this
 * with the owned /api/v1/dashboard endpoint through the shared API client;
 * the returned shape already matches that contract, so the UI will not
 * change when the implementation switches.
 */
export async function getDashboard(): Promise<DashboardData> {
  return dashboardMock;
}
