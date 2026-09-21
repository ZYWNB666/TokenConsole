import { apiGet } from "@/lib/api-fetch";

import type { RequestLogFilters, RequestLogPage } from "./types";

/** Builds the query string from the active filters. */
export function requestsQuery(filters: RequestLogFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.start) params.set("start", filters.start);
  if (filters.end) params.set("end", filters.end);
  if (filters.model) params.set("model", filters.model);
  if (filters.key) params.set("key", filters.key);
  if (filters.requestId) params.set("requestId", filters.requestId);
  return params.toString();
}

export function fetchRequests(filters: RequestLogFilters, page: number, pageSize: number) {
  return apiGet<RequestLogPage>(`/api/v1/requests?${requestsQuery(filters, page, pageSize)}`);
}
