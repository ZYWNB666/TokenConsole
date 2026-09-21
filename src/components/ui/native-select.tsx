"use client";

import { ChevronDownIcon } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

export type NativeSelectProps = ComponentPropsWithoutRef<"select"> & {
  /** Accessible label for the control; visually hidden when `hideLabel`. */
  label: string;
  hideLabel?: boolean;
};

/**
 * Native select styled to match the other controls. A native control keeps
 * keyboard, mobile and assistive-tech behaviour correct without a new
 * dependency — the right trade-off for filter dropdowns.
 */
function NativeSelect({ className, label, hideLabel, children, ...props }: NativeSelectProps) {
  return (
    <span className={cn("inline-flex flex-col gap-1.5", className)}>
      <label
        className={cn(
          "text-xs font-medium text-muted-foreground",
          hideLabel && "sr-only",
        )}
      >
        {label}
      </label>
      <span className="relative inline-flex">
        <select
          data-slot="select"
          className="h-9 w-full appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        >
          {children}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </span>
    </span>
  );
}

export { NativeSelect };
