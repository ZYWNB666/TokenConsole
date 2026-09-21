import "server-only";

import {
  isPage,
  parseEnvelope,
  toHttpFailure,
  upstreamFetch,
  UpstreamHttpError,
} from "./internal";
import { fetchAccount, quotaToUsd, type UpstreamAccount } from "./usage";

/**
 * Server-only billing adapter for the New API fork (commit 972aed19).
 *
 * Reads the caller's real balance and top-up (payment) history. Payment
 * initiation lives in recharge.ts; the history mapping below records the
 * credited USD, never the gateway's payable figure (whose currency depends
 * on the provider configuration).
 */

const TOPUPS_PATH = "/api/user/topup/self";

export type UpstreamTopUp = {
  id: number;
  /** UTC ISO timestamp. */
  createdAt: string;
  /** Credited amount in USD. */
  amountUsd: number;
  /** Payment method label, e.g. "alipay" or "stripe". */
  method: string;
  status: "completed" | "pending" | "unknown";
  /** Order/trade number for support reference. */
  tradeNo: string;
};

type UpstreamTopUpRow = {
  id?: unknown;
  created_at?: unknown;
  amount?: unknown;
  money?: unknown;
  payment_method?: unknown;
  payment_provider?: unknown;
  status?: unknown;
  trade_no?: unknown;
};

function mapStatus(status: unknown): UpstreamTopUp["status"] {
  if (status === "success" || status === "completed" || status === 1 || status === "1") return "completed";
  if (status === "pending" || status === 0 || status === "0") return "pending";
  return "unknown";
}

/**
 * Credited USD per rail (fork model/topup.go at 972aed19): Stripe records the
 * group-ratio-converted USD in `money`; epay/waffo/pancake record whole USD
 * in `amount`; Creem records credited quota units in `amount`. `money` on the
 * epay rail is the payable in the gateway's charge currency (e.g. CNY) and
 * is deliberately not exposed.
 */
function creditedUsd(row: UpstreamTopUpRow): number {
  if (row.payment_provider === "stripe") {
    if (typeof row.money === "number" && Number.isFinite(row.money) && row.money > 0) {
      return Number(row.money.toFixed(2));
    }
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream topup row is malformed");
  }
  if (row.payment_provider === "creem") {
    if (typeof row.amount === "number" && Number.isFinite(row.amount) && row.amount > 0) {
      return quotaToUsd(row.amount, 2);
    }
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream topup row is malformed");
  }
  if (typeof row.amount === "number" && Number.isInteger(row.amount) && row.amount > 0) {
    return row.amount;
  }
  throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream topup row is malformed");
}

function toTopUp(row: UpstreamTopUpRow): UpstreamTopUp {
  if (
    !Number.isInteger(row.id) || (row.id as number) <= 0 ||
    typeof row.created_at !== "number" || !Number.isFinite(row.created_at)
  ) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream topup row is malformed");
  }
  return {
    id: row.id as number,
    createdAt: new Date(row.created_at * 1000).toISOString(),
    amountUsd: creditedUsd(row),
    method: typeof row.payment_method === "string" ? row.payment_method : "",
    status: mapStatus(row.status),
    tradeNo: typeof row.trade_no === "string" ? row.trade_no : "",
  };
}

export type BillingSummary = {
  account: UpstreamAccount;
  /** Current calendar month spend in USD, from the real log stat. */
  monthSpendUsd: number;
  topups: UpstreamTopUp[];
};

/** GET /api/user/self + /api/log/self/stat + /api/user/topup/self. */
export async function fetchBillingSummary(
  accessToken: string,
  monthStartSeconds: number,
): Promise<BillingSummary> {
  const [account, topupsRes, statRes] = await Promise.all([
    fetchAccount(accessToken),
    upstreamFetch(TOPUPS_PATH, accessToken, { query: { p: "1", page_size: "50" } }),
    upstreamFetch("/api/log/self/stat", accessToken, {
      query: {
        start_timestamp: String(monthStartSeconds),
        end_timestamp: String(Math.floor(Date.now() / 1000)),
      },
    }),
  ]);
  if (!topupsRes.ok) throw toHttpFailure(topupsRes.status);
  if (!statRes.ok) throw toHttpFailure(statRes.status);
  const topupsPage = await parseEnvelope<unknown>(topupsRes);
  const stat = await parseEnvelope<Record<string, unknown>>(statRes);
  if (!isPage<UpstreamTopUpRow>(topupsPage)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream topups response is malformed");
  }
  const quota = stat.quota;
  if (typeof quota !== "number" || !Number.isFinite(quota)) {
    throw new UpstreamHttpError("UPSTREAM_UNAVAILABLE", "upstream stat response is malformed");
  }
  return {
    account,
    monthSpendUsd: quotaToUsd(quota, 4),
    topups: topupsPage.items
      .map(toTopUp)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  };
}
