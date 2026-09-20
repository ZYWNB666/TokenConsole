/**
 * Owned authentication DTOs for the TokenConsole Business API
 * (/api/v1/auth/*, /api/v1/me). These are the only user shapes pages see —
 * New API's raw structures never cross this boundary.
 */

/** Console-normalized role. New API's numeric roles map onto it in the adapter. */
export type AuthUserRole = "owner" | "admin" | "member";

export type AuthUser = {
  id: number;
  username: string;
  display_name: string;
  email: string;
  role: AuthUserRole;
  capabilities: string[];
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
