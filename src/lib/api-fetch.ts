import type { ApiResult } from "@/types/api";

/**
 * Browser transport for the owned /api/v1 endpoints: one place for the
 * envelope check, error normalization and credentials handling. The browser
 * never talks to anything else.
 */

async function parse<TData>(response: Response): Promise<ApiResult<TData>> {
  const parsed: unknown = await response.json().catch(() => null);
  if (parsed && typeof parsed === "object" && "data" in parsed) {
    return parsed as { data: TData };
  }
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    return parsed as { error: { code: string; message: string; request_id: string } };
  }
  return {
    error: { code: "network_error", message: "Something went wrong. Please try again.", request_id: "" },
  };
}

async function request<TData>(
  path: string,
  method: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<ApiResult<TData>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
    if (response.status === 401) {
      // The BFF has cleared the session — return the browser to sign-in.
      window.location.replace("/login");
      return new Promise(() => undefined) as Promise<ApiResult<TData>>;
    }
    return await parse<TData>(response);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return new Promise(() => undefined) as Promise<ApiResult<TData>>;
    }
    return {
      error: { code: "network_error", message: "Something went wrong. Please try again.", request_id: "" },
    };
  }
}

export function apiGet<TData>(path: string, signal?: AbortSignal): Promise<ApiResult<TData>> {
  return request<TData>(path, "GET", undefined, signal);
}

export function apiPost<TData>(path: string, body?: unknown): Promise<ApiResult<TData>> {
  return request<TData>(path, "POST", body ?? {});
}

export function apiPatch<TData>(path: string, body?: unknown): Promise<ApiResult<TData>> {
  return request<TData>(path, "PATCH", body ?? {});
}

export function apiDelete<TData>(path: string): Promise<ApiResult<TData>> {
  return request<TData>(path, "DELETE");
}
