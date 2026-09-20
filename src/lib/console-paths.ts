/**
 * Console paths that require an authenticated session. This list is the
 * access-control source for the route proxy; auth-guards.test.ts asserts it
 * stays in sync with the navigation metadata.
 */
export const CONSOLE_PATHS = [
  "/overview",
  "/api-keys",
  "/playground",
  "/models",
  "/requests",
  "/usage",
  "/billing",
  "/organization",
  "/settings",
] as const;
