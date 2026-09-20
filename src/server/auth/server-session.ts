import "server-only";

import { cookies, headers } from "next/headers";

import { SESSION_COOKIE } from "@/lib/auth-cookies";
import { sanitizeReturnTo } from "@/lib/auth-guards";

import { openSession, type SessionPayload } from "./session";

/**
 * Server-component side of the auth service. Page protection happens here —
 * in the (console) layout, before any protected HTML is produced — by
 * verifying the encrypted session cookie locally. No HTTP loopback to
 * /api/v1/* is performed; upstream validation stays in the BFF routes.
 */

/** The authenticated session of the current request, or null. */
export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return openSession(cookieStore.get(SESSION_COOKIE)?.value ?? null);
}

/**
 * The path the proxy annotated for this request, used to build a safe
 * returnTo when an unauthenticated request hits a protected page.
 */
export async function getRequestPath(): Promise<string> {
  const headerStore = await headers();
  return sanitizeReturnTo(headerStore.get("x-console-path"));
}

export type ConsoleGuard =
  | { kind: "session"; session: SessionPayload }
  | { kind: "redirect"; location: string };

/**
 * Guard for console pages: a valid (decryptable, unexpired) session, or a
 * redirect to the sign-in page with the requested path as returnTo.
 */
export async function requireConsoleSession(): Promise<ConsoleGuard> {
  const session = await getServerSession();
  if (session) return { kind: "session", session };
  return {
    kind: "redirect",
    location: `/login?returnTo=${encodeURIComponent(await getRequestPath())}`,
  };
}
