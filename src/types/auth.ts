/**
 * Owned authentication DTOs for the TokenConsole Business API
 * (/api/v1/auth/*, /api/v1/me). These are the only user shapes pages see —
 * New API's raw structures never cross this boundary.
 */

/** Console-normalized role. New API's numeric roles map onto it in the adapter. */
export type AuthUserRole = "owner" | "admin" | "member";

/**
 * Account state in public units. Money arrives as USD numbers so the browser
 * can format it for the active locale; internal quota units never appear.
 */
export type AuthAccount = {
  /** Remaining balance in USD, rounded to cents. */
  balance_usd: number;
  /** Lifetime consumed spend in USD, rounded to cents. */
  used_usd: number;
  /** Lifetime request count. */
  request_count: number;
};

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: AuthUserRole;
  capabilities: string[];
  /** Present when the upstream /self payload carried account counters. */
  account?: AuthAccount;
};

export type LoginSuccess = {
  status: "ok";
  user: AuthUser;
};

export type LoginVerificationRequired = {
  status: "verification_required";
  flow_token: string;
  methods: string[];
  expires_at: number;
};

export type LoginResult = LoginSuccess | LoginVerificationRequired;
