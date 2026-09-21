"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCardIcon, ExternalLinkIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost } from "@/lib/api-fetch";
import { useFormat, useT } from "@/i18n/provider";
import { useAsyncData } from "@/lib/use-async-data";
import { cn } from "@/lib/utils";
import { isApiFailure } from "@/types/api";
import type { DictionaryKey } from "@/i18n/dictionaries/en";

import type { RechargeOptionsView, RechargeOrderView } from "./types";

/**
 * Recharge card: real gateway payment rails only. When the gateway exposes
 * no supported payment method, the card says so honestly instead of offering
 * a fake flow. Successful order creation hands the browser to the gateway's
 * checkout — epay via a signed form POST, Stripe via its checkout link.
 */

/** Console-side bound; the server enforces the same range. */
const MIN_AMOUNT_USD = 1;
const MAX_AMOUNT_USD = 10_000;

const UNAVAILABLE_KEYS: Record<
  NonNullable<RechargeOptionsView["reason"]>,
  DictionaryKey
> = {
  compliance_required: "recharge.unavailable.compliance_required",
  not_configured: "recharge.unavailable.not_configured",
  not_supported: "recharge.unavailable.not_supported",
};

const ERROR_KEYS: Record<string, DictionaryKey> = {
  invalid_request: "recharge.error.amount",
  invalid_amount: "recharge.error.amount",
  invalid_method: "recharge.error.method",
  payment_not_configured: "recharge.error.notConfigured",
  payment_unavailable: "recharge.error.unavailable",
  rate_limited: "recharge.error.rateLimited",
};

/** Safari blocks programmatic form/window targets after an await; the
 * gateway's own wallet submits in the same tab there, and so do we. */
function prefersSameTab(): boolean {
  return (
    navigator.userAgent.includes("Safari") &&
    !navigator.userAgent.includes("Chrome")
  );
}

export function RechargeCard() {
  const t = useT();
  const format = useFormat();
  const state = useAsyncData(
    useCallback(() => apiGet<RechargeOptionsView>("/api/v1/billing/recharge"), []),
  );
  const options = state.status === "ready" ? state.data : null;

  const [amountText, setAmountText] = useState("");
  const [methodId, setMethodId] = useState("");
  /**
   * Last settled quote, keyed by "methodId:amount". A key mismatch means the
   * inputs changed and a new quote is (still) on its way — derived state
   * instead of effect-synced flags.
   */
  const [quoteResult, setQuoteResult] = useState<{ key: string; payable: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  // The selected method falls back to the first real method while the
  // gateway's list loads or after a method disappears from it.
  const effectiveMethodId = options?.methods.some((entry) => entry.id === methodId)
    ? methodId
    : (options?.methods[0]?.id ?? "");
  const method = options?.methods.find((entry) => entry.id === effectiveMethodId) ?? null;
  const minAmount = method?.minAmountUsd ?? MIN_AMOUNT_USD;
  const amount = Number.parseInt(amountText, 10);
  const amountValid =
    Number.isInteger(amount) && amount >= minAmount && amount <= MAX_AMOUNT_USD;

  const quoteKey = method && amountValid ? `${method.id}:${amount}` : null;
  const quoteSettled = quoteResult !== null && quoteResult.key === quoteKey;
  const quotePending = quoteKey !== null && !quoteSettled;
  const payable = quoteSettled ? quoteResult.payable : null;

  // Live payable quote, debounced; a failed quote just hides the line — the
  // checkout page always shows the authoritative amount.
  useEffect(() => {
    if (!method || !amountValid) return;
    let active = true;
    const key = `${method.id}:${amount}`;
    const timer = setTimeout(() => {
      void apiPost<{ payable: string }>("/api/v1/billing/recharge/quote", {
        amountUsd: amount,
        methodId: method.id,
      }).then((result) => {
        if (!active) return;
        setQuoteResult({ key, payable: isApiFailure(result) ? null : result.data.payable });
      });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amount, amountValid, method]);

  async function startCheckout() {
    if (!method || !amountValid || creating) return;
    setCreating(true);
    setActionError(null);
    setCheckoutOpened(false);
    const result = await apiPost<RechargeOrderView>("/api/v1/billing/recharge", {
      amountUsd: amount,
      methodId: method.id,
    });
    setCreating(false);
    if (isApiFailure(result)) {
      setActionError(t(ERROR_KEYS[result.error.code] ?? "recharge.error.generic"));
      return;
    }
    const order = result.data;
    const sameTab = prefersSameTab();
    if (order.kind === "redirect") {
      if (sameTab) {
        window.location.href = order.url;
      } else {
        window.open(order.url, "_blank", "noopener");
      }
    } else {
      const form = document.createElement("form");
      form.action = order.action;
      form.method = "POST";
      if (!sameTab) form.target = "_blank";
      for (const [name, value] of Object.entries(order.fields)) {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        field.value = value;
        form.appendChild(field);
      }
      document.body.appendChild(form);
      form.submit();
      form.remove();
    }
    setCheckoutOpened(true);
  }

  if (state.status === "loading") {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4" aria-busy="true">
          <span className="sr-only">{t("common.loading")}</span>
          <div className="flex flex-wrap gap-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-8 w-20" />
            ))}
          </div>
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === "error") {
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<CreditCardIcon className="size-8" />}
            title={t("common.error.title")}
            description={t("common.error.description")}
            action={
              <Button type="button" variant="outline" size="sm" onClick={state.reload}>
                {t("common.tryAgain")}
              </Button>
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (!options || !options.available) {
    const reason = options?.reason ?? "not_configured";
    return (
      <Card>
        <CardContent className="pt-6">
          <EmptyState
            icon={<CreditCardIcon className="size-8" />}
            title={t("recharge.unavailable.title")}
            description={t(UNAVAILABLE_KEYS[reason])}
            action={
              options?.manualTopUpUrl ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={options.manualTopUpUrl} target="_blank" rel="noreferrer noopener">
                    {t("recharge.manualLink")}
                    <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                  </a>
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{t("recharge.title")}</CardTitle>
        <CardDescription>{t("recharge.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.presetAmountsUsd.length > 0 ? (
          <div role="group" aria-label={t("recharge.preset")} className="flex flex-wrap gap-2">
            {options.presetAmountsUsd.map((preset) => {
              const selected = amountText === String(preset);
              return (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setAmountText(String(preset))}
                  className={cn(
                    "h-8 rounded-md border px-3 text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "border-border bg-surface text-foreground hover:bg-surface-muted",
                  )}
                >
                  {format.currency(preset)}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="recharge-amount" className="block text-sm font-medium text-foreground">
              {t("recharge.amount")}
            </label>
            <Input
              id="recharge-amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={minAmount}
              max={MAX_AMOUNT_USD}
              step={1}
              required
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              aria-describedby="recharge-amount-hint"
            />
            <p id="recharge-amount-hint" className="text-xs text-muted-foreground">
              {t("recharge.amountHint", { min: minAmount, max: MAX_AMOUNT_USD })}
            </p>
          </div>
          <NativeSelect
            label={t("recharge.method")}
            value={effectiveMethodId}
            onChange={(event) => setMethodId(event.target.value)}
          >
            {options.methods.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label} — {t("recharge.minLabel", { min: entry.minAmountUsd })}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {quotePending
            ? t("recharge.quotePending")
            : payable !== null
              ? `${t("recharge.quote")}: ${payable}`
              : ""}
        </div>

        {actionError ? (
          <p role="alert" className="text-sm text-error">
            {actionError}
          </p>
        ) : null}
        {checkoutOpened ? (
          <p className="text-sm text-muted-foreground">{t("recharge.opened")}</p>
        ) : null}

        <div>
          <Button
            type="button"
            onClick={() => void startCheckout()}
            disabled={!amountValid || !method || creating}
          >
            {creating ? t("recharge.submitting") : t("recharge.submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
