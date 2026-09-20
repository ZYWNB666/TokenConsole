import type { ApiResult } from "@/types/api";
import type { AuthUser, LoginResult } from "@/types/auth";

/**
 * Browser client for the owned /api/v1 auth endpoints. The browser only ever
 * speaks to this API — never to New API directly — and never sees or stores
 * an access or refresh token (they live only in the encrypted HttpOnly BFF
 * cookie).
 */

async function postJson<TData>(path: string, body: unknown): Promise<ApiResult<TData>> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    const parsed: unknown = await response.json().catch(() => null);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      return parsed as { data: TData };
    }
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      return parsed as { error: { code: string; message: string; request_id: string } };
    }
  } catch {
    // fall through to the generic network error
  }
  return {
    error: { code: "network_error", message: "Something went wrong. Please try again.", request_id: "" },
  };
}

export function signIn(username: string, password: string): Promise<ApiResult<LoginResult>> {
  return postJson<LoginResult>("/api/v1/auth/login", { username, password });
}

export function verifySignIn(
  flowToken: string,
  method: string,
  code: string,
): Promise<ApiResult<LoginResult>> {
  return postJson<LoginResult>("/api/v1/auth/verify", {
    flow_token: flowToken,
    method,
    code,
  });
}

export function signOut(): Promise<ApiResult<{ status: string }>> {
  return postJson<{ status: string }>("/api/v1/auth/logout", {});
}

export type CurrentUserResult =
  | { status: "authenticated"; user: AuthUser }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/**
 * Loads the signed-in user for the header. Distinguishes "not signed in"
 * (401 — the BFF has already cleared the session) from a temporary backend
 * outage (5xx/429/network), which must not sign the user out.
 */
export async function fetchCurrentUser(): Promise<CurrentUserResult> {
  try {
    const response = await fetch("/api/v1/me", { credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) {
      return { status: "unauthenticated" };
    }
    if (!response.ok) {
      return { status: "unavailable" };
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (parsed && typeof parsed === "object" && "data" in parsed) {
      const data = (parsed as { data: AuthUser }).data;
      if (typeof data?.id === "number" && typeof data?.username === "string") {
        return { status: "authenticated", user: data };
      }
    }
    return { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}
