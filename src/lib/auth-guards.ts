/**
 * Pure, environment-free auth guard helpers shared by server components,
 * the login page (browser) and the test suite.
 */

const DEFAULT_RETURN_TO = "/overview";

/**
 * Only same-site, root-relative paths are valid return targets. Rejects
 * protocol-relative URLs ("//host"), absolute URLs, and anything carrying
 * control characters — the open-redirect guard for `?returnTo=`.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_RETURN_TO;
  if (!raw.startsWith("/")) return DEFAULT_RETURN_TO;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN_TO;
  if (raw.includes("://") || raw.includes("\n") || raw.includes("\r")) return DEFAULT_RETURN_TO;
  return raw;
}
