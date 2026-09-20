"use client";

import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Sheet — a side panel built on Radix Dialog. Radix provides the dialog
 * semantics: focus trap while open, Escape to close, overlay click to close
 * and focus restoration to the trigger on close. Intended for mobile
 * navigation and later Drawer compositions; never hand-roll focus traps.
 */
export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetPortal = SheetPrimitive.Portal;

type SheetSide = "top" | "right" | "bottom" | "left";

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-foreground/40",
        "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        className,
      )}
      {...props}
    />
  );
}

export type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** Edge the panel attaches to. Defaults to "right". */
  side?: SheetSide;
};

export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-surface shadow-lg",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-border data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r border-border data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left",
          side === "top" &&
            "inset-x-0 top-0 max-h-screen border-b border-border data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          side === "bottom" &&
            "inset-x-0 bottom-0 max-h-screen border-t border-border data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <XIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 border-b border-border p-6 pr-12", className)}
      {...props}
    />
  );
}

export function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 border-t border-border p-6", className)}
      {...props}
    />
  );
}
