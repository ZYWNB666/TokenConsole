"use client";

import { useEffect, useState } from "react";

import type { ApiResult } from "@/types/api";

export type AsyncDataState<TData> =
  | { status: "loading" }
  | { status: "ready"; data: TData }
  | { status: "error"; code: string };

/**
 * Fetches data from an owned /api/v1 endpoint whenever `fetcher` changes
 * identity (callers build it with useCallback over their query state), with
 * an explicit reload for retry buttons. Unauthenticated (401) results are
 * handled inside the transport (redirect to /login); the error branch keeps
 * the server's error code so callers can distinguish states (e.g. a
 * privilege "forbidden" from an availability failure).
 */
export function useAsyncData<TData>(
  fetcher: () => Promise<ApiResult<TData>>,
): AsyncDataState<TData> & { reload: () => void } {
  const [state, setState] = useState<AsyncDataState<TData>>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    fetcher().then((result) => {
      if (!active) return;
      if ("data" in result) {
        setState({ status: "ready", data: result.data });
      } else {
        setState({ status: "error", code: result.error.code });
      }
    });
    return () => {
      active = false;
    };
  }, [fetcher, nonce]);

  return {
    ...state,
    reload: () => {
      setState({ status: "loading" });
      setNonce((value) => value + 1);
    },
  };
}
