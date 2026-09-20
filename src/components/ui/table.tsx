import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Semantic table primitives. The wrapper is keyboard-focusable so the table
 * can be scrolled horizontally without a pointer (arrow keys once focused);
 * native table/th/td semantics are preserved inside. Rows stay compact
 * (40–44px).
 */
export function Table({
  className,
  label,
  ...props
}: React.ComponentProps<"table"> & {
  /** Accessible name for the scrollable container (also announced on focus). */
  label?: string;
}) {
  return (
    <div
      data-slot="table-container"
      role={label ? "region" : undefined}
      aria-label={label}
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-surface-muted/50",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("px-3 py-2.5 align-middle", className)}
      {...props}
    />
  );
}

export function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-left text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}
