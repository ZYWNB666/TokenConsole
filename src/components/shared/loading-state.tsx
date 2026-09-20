import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const rowWidths = ["w-full", "w-5/6", "w-2/3"] as const;

export type LoadingStateProps = {
  /** Message announced to assistive technology. Defaults to "Loading". */
  label?: string;
  /** Number of placeholder rows. Defaults to 3. */
  rows?: number;
  className?: string;
};

/**
 * Visual skeleton plus an accessible polite status so screen readers know
 * content is loading. Pure presentation — no fetching or timers.
 */
export function LoadingState({
  label = "Loading",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <Card className={className}>
      <CardContent role="status" aria-live="polite" className="space-y-3 p-6">
        <span className="sr-only">{label}</span>
        <Skeleton className="h-4 w-1/3" />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton
            key={index}
            className={cn("h-3", rowWidths[index % rowWidths.length])}
          />
        ))}
      </CardContent>
    </Card>
  );
}
