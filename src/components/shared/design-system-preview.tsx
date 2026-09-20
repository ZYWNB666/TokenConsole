"use client";

import * as React from "react";
import { SearchIcon, SettingsIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { MetricCard } from "@/components/shared/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Component reference for the TokenAPI design system.
 * Every value on this page is an explicitly labelled sample or example —
 * nothing here reflects live usage, spend, availability or system state.
 */

type SampleModel = {
  id: string;
  contextWindow: number;
  streaming: boolean;
  status: "available" | "unavailable";
};

/** Example rows for layout reference only — not real models. */
const sampleModels: SampleModel[] = [
  { id: "example-model-a", contextWindow: 128_000, streaming: true, status: "available" },
  { id: "example-model-b", contextWindow: 32_000, streaming: false, status: "unavailable" },
  { id: "example-model-c", contextWindow: 200_000, streaming: true, status: "available" },
];

function SampleNotice() {
  return (
    <p
      role="note"
      className="rounded-lg border border-info/20 bg-info/5 px-4 py-3 text-sm text-foreground"
    >
      <strong className="font-medium">Sample data only.</strong> Every value on
      this page is an explicitly labelled sample or example for component
      reference. Nothing here reflects live usage, spend, availability or any
      production system state.
    </p>
  );
}

function DemoSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <div>
        <h2
          id={`${id}-heading`}
          className="text-lg font-semibold tracking-tight text-foreground"
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ButtonsSection() {
  return (
    <DemoSection
      id="buttons"
      title="Button"
      description="Variants, sizes and states. All buttons show a visible focus ring on keyboard interaction."
    >
      <Card>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="default">Default size</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button>
              <SettingsIcon aria-hidden="true" />
              With icon
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Example icon-only button"
            >
              <SearchIcon aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </DemoSection>
  );
}

function InputSection() {
  return (
    <DemoSection
      id="input"
      title="Input"
      description="Every input has a visible label; hints are linked with aria-describedby. These fields are not submitted anywhere."
    >
      <Card>
        <CardContent className="grid gap-6 p-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="ds-project-name"
              className="block text-sm font-medium text-foreground"
            >
              Project name
            </label>
            <Input
              id="ds-project-name"
              placeholder="my-project"
              aria-describedby="ds-project-name-hint"
            />
            <p id="ds-project-name-hint" className="text-xs text-muted-foreground">
              Example field — input is not submitted anywhere.
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="ds-disabled-input"
              className="block text-sm font-medium text-foreground"
            >
              Disabled input
            </label>
            <Input id="ds-disabled-input" disabled placeholder="Unavailable" />
            <p className="text-xs text-muted-foreground">
              Example of the disabled state.
            </p>
          </div>
        </CardContent>
      </Card>
    </DemoSection>
  );
}

function BadgeSection() {
  return (
    <DemoSection
      id="badge"
      title="Badge"
      description="Status is always conveyed by text, never by color alone."
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-6">
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="error">Error</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="primary">Primary</Badge>
        </CardContent>
      </Card>
    </DemoSection>
  );
}

function CardSection() {
  return (
    <DemoSection
      id="card"
      title="Card"
      description="White surface, 8px radius, 1px border, subtle shadow."
    >
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Example card</CardTitle>
          <CardDescription>
            A sample card used to group related content.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Cards group related content on the muted page canvas. This content is
          an example.
        </CardContent>
        <CardFooter className="gap-2">
          <Button size="sm" variant="outline">
            Example action
          </Button>
          <Button size="sm" variant="ghost">
            Secondary
          </Button>
        </CardFooter>
      </Card>
    </DemoSection>
  );
}

function MetricCardSection() {
  return (
    <DemoSection
      id="metric-card"
      title="MetricCard"
      description="Presentation only — the caller owns data, formatting and any calculation. Trend color comes from tone, not direction: a rising value can be bad news."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Example metric (sample)"
          value="3.2%"
          helper="Sample value — not real data"
          trend={{ direction: "up", tone: "negative", label: "+0.4 pts (sample)" }}
        />
        <MetricCard
          label="Example metric (sample)"
          value="412 ms"
          helper="Sample value — not real data"
          trend={{ direction: "down", tone: "positive", label: "-38 ms (sample)" }}
        />
        <MetricCard
          label="Example metric (sample)"
          value="1,024"
          helper="Sample value — not real data"
          trend={{ direction: "up", label: "+96 (sample, no tone given)" }}
        />
      </div>
    </DemoSection>
  );
}

function TableSection() {
  return (
    <DemoSection
      id="table"
      title="Table"
      description="Semantic, compact rows; numeric columns are right-aligned."
    >
      <Card className="overflow-hidden">
        <Table label="Example models (sample data)">
          <TableCaption>
            Example data for layout reference only — not real models. On narrow
            screens the table region is keyboard-focusable and scrolls with the
            arrow keys.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Model ID</TableHead>
              <TableHead className="text-right">Context window</TableHead>
              <TableHead>Streaming</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sampleModels.map((model) => (
              <TableRow key={model.id}>
                <TableCell className="font-mono text-xs">{model.id}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {model.contextWindow.toLocaleString("en-US")}
                </TableCell>
                <TableCell>{model.streaming ? "Yes" : "No"}</TableCell>
                <TableCell>
                  <Badge
                    variant={model.status === "available" ? "success" : "neutral"}
                  >
                    {model.status === "available" ? "Available" : "Unavailable"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </DemoSection>
  );
}

function LoadingSection() {
  return (
    <DemoSection
      id="loading"
      title="Skeleton and LoadingState"
      description="Loading placeholders with a polite status message for assistive technology."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skeleton</CardTitle>
            <CardDescription>Raw placeholder shapes (example).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
        <LoadingState label="Loading sample data (example)" rows={3} />
      </div>
    </DemoSection>
  );
}

function EmptyStateDemo() {
  const [triggered, setTriggered] = React.useState(false);

  return (
    <div className="space-y-2">
      <EmptyState
        title="No API keys yet (example)"
        description="An example empty state. In a real feature, this action would open the key creation flow."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => setTriggered(true)}
          >
            Example action
          </Button>
        }
      />
      <p role="status" className="text-xs text-muted-foreground">
        {triggered
          ? "Example action triggered."
          : "Example action has not been triggered yet."}
      </p>
    </div>
  );
}

function ErrorStateDemo() {
  const [retries, setRetries] = React.useState(0);

  return (
    <div className="space-y-2">
      <ErrorState
        title="Example error state"
        description="A demonstration of the error state component with a working retry action."
        onRetry={() => setRetries((count) => count + 1)}
      />
      <p role="status" className="text-xs text-muted-foreground">
        {retries === 0
          ? "Retry has not been triggered yet."
          : `Retry triggered ${retries} time${retries === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}

function StatesSection() {
  return (
    <DemoSection
      id="states"
      title="EmptyState and ErrorState"
      description="Demo actions below actually work. ErrorState only shows a retry button when a valid retry handler is provided."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <EmptyStateDemo />
        <ErrorStateDemo />
      </div>
    </DemoSection>
  );
}

function SheetDemo({ side }: { side: "left" | "right" }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          {side === "right" ? "Open right sheet" : "Open left sheet"}
        </Button>
      </SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Example sheet ({side})</SheetTitle>
          <SheetDescription>
            Built on Radix Dialog: focus is trapped while open, Escape and the
            overlay close it, and focus returns to the trigger. This panel is
            example content only.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-sm text-muted-foreground">
            This component will be reused for mobile navigation in a later
            task. The content of this panel is a sample.
          </p>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SheetSection() {
  return (
    <DemoSection
      id="sheet"
      title="Sheet"
      description="Dialog semantics with focus trap, Escape close, overlay and focus restoration. Both panels below really open and close."
    >
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-6">
          <SheetDemo side="right" />
          <SheetDemo side="left" />
        </CardContent>
      </Card>
    </DemoSection>
  );
}

export function DesignSystemPreview() {
  return (
    <div className="space-y-12">
      <SampleNotice />
      <ButtonsSection />
      <InputSection />
      <BadgeSection />
      <CardSection />
      <MetricCardSection />
      <TableSection />
      <LoadingSection />
      <StatesSection />
      <SheetSection />
    </div>
  );
}
