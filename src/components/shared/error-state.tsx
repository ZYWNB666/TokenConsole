import { CircleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ErrorStateProps = {
  /** Short headline. Defaults to a generic message. */
  title?: string;
  /** Plain-language explanation of what went wrong. */
  description?: string;
  /**
   * Retry handler. The retry action is only rendered when a working handler
   * is provided — never show a decorative retry button.
   */
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description = "The request could not be completed. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-surface px-6 py-12 text-center",
        className,
      )}
    >
      <div aria-hidden="true" className="text-error">
        <CircleAlertIcon className="size-8" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {typeof onRetry === "function" ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
