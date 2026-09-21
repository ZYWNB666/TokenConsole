/** Settings module DTOs for the owned /api/v1/settings contract. */

export type SessionView = {
  sid: string;
  current: boolean;
  loginMethod: string;
  ip: string;
  userAgent: string;
  /** UTC ISO timestamps. */
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
};

export type SessionsData = {
  sessions: SessionView[];
};
