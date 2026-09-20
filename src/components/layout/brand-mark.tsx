import { cn } from "@/lib/utils";

/**
 * Compact geometric letter mark. Decorative — the adjacent brand text is the
 * accessible name, so the mark itself is aria-hidden.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground",
        className,
      )}
    >
      T
    </span>
  );
}
