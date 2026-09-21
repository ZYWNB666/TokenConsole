import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.ComponentProps<"textarea">;

/** Multi-line text input styled like the Input primitive. */
function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-surface-muted aria-invalid:border-error",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
