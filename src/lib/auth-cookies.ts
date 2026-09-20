/**
 * Name of the single TokenConsole BFF session cookie. The cookie is HttpOnly,
 * encrypted (AES-256-GCM, see server/auth/session.ts) and carries a
 * versioned sealed payload — there is intentionally no readable companion
 * cookie.
 */
export const SESSION_COOKIE = "tc_session";
