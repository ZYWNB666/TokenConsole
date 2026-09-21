"use client";

import type { RefObject } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { brand } from "@/lib/brand";

import { BrandMark } from "./brand-mark";
import { NavList } from "./nav-list";

type MobileNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Header menu button; focus returns to it when the sheet closes. */
  menuButtonRef?: RefObject<HTMLButtonElement | null>;
};

/**
 * Mobile navigation over the shared Radix Sheet: focus trap and Escape come
 * from the dialog primitive. The trigger lives in the header outside the
 * Radix tree, so focus restoration back to it is wired explicitly.
 */
export function MobileNav({ open, onOpenChange, menuButtonRef }: MobileNavProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[85%] max-w-xs gap-0 p-0"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          menuButtonRef?.current?.focus();
        }}
      >
        <SheetHeader className="p-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div className="min-w-0 leading-tight">
              <SheetTitle className="text-sm font-semibold">
                {brand.name}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {brand.tagline}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-3">
          <NavList onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
