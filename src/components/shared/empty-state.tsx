import type { ReactNode } from "react";
import { InboxIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  /** Short headline describing the empty state. */
  title: string;
  /** Optional explanation of why it is empty and what happens next. */
  description?: string;
  /** Optional icon shown above the title. */
  icon?: ReactNode;
  /** Optional next action. Only pass an action that actually works. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden="true" className="text-muted-foreground">
        {icon ?? <InboxIcon className="size-8" />}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
