"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CircleAlertIcon, CopyIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

type CopyButtonProps = {
  /** Text written to the clipboard. */
  value: string;
  /** Accessible label prefix, e.g. "Copy API endpoint". */
  label?: string;
  className?: string;
};

/**
 * Copies a value to the clipboard with visible and screen-reader feedback:
 * a short "Copied" confirmation on success and a "Copy failed" message when
 * the clipboard is unavailable. Never uses alert().
 */
export function CopyButton({ value, label = "Copy", className }: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState("idle"), 2000);
  }

  const ariaLabel =
    state === "copied"
      ? "Copied"
      : state === "failed"
        ? "Copy failed"
        : `${label}: ${value}`;

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {state === "copied" ? (
        <CheckIcon aria-hidden="true" className="size-3.5 text-success" />
      ) : state === "failed" ? (
        <CircleAlertIcon aria-hidden="true" className="size-3.5 text-error" />
      ) : (
        <CopyIcon aria-hidden="true" className="size-3.5" />
      )}
      {state === "copied" ? (
        <span aria-hidden="true" className="text-xs font-medium text-success">
          Copied
        </span>
      ) : state === "failed" ? (
        <span aria-hidden="true" className="text-xs font-medium text-error">
          Copy failed
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
