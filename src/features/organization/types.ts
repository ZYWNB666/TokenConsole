/** Organization module DTOs for the owned /api/v1/org contract. */

export type MemberRole = "owner" | "admin" | "member";

export type MemberStatus = "active" | "banned" | "unknown";

export type MemberView = {
  id: number;
  username: string;
  displayName: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  /** UTC ISO timestamp of registration. */
  createdAt: string;
  /** Remaining balance in USD. */
  balanceUsd: number;
  /** Consumed spend in USD. */
  usedUsd: number;
  requestCount: number;
};

export type MembersPage = {
  items: MemberView[];
  total: number;
  page: number;
  pageSize: number;
};
