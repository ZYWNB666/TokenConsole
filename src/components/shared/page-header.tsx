import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  /** Page heading text. */
  title: string;
  /** Optional supporting copy rendered under the title. */
  description?: string;
  /** Optional action area (buttons, links) aligned to the end. */
  actions?: ReactNode;
  /** Optional id for the h1, e.g. to reference it via aria-labelledby. */
  id?: string;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  id,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="space-y-1">
        <h1
          id={id}
          className="text-2xl font-semibold tracking-tight text-foreground"
        >
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
