import { NextResponse, type NextRequest } from "next/server";

/**
 * Route proxy (Next.js 16's replacement for middleware.ts).
 *
 * It makes NO authorization decisions — the encrypted session cookie is only
 * ever opened by the server-side auth service (see server/auth/). The proxy
 * solely annotates every page request with its pathname so the console
 * layout can build an exact, safe returnTo when it redirects an
 * unauthenticated visitor to /login.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-console-path", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Exclude the /api routes and static assets — but NOT paths that merely
  // start with "api" (e.g. /api-keys), which are console pages.
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
