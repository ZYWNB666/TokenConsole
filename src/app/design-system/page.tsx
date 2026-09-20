import type { Metadata } from "next";

import { DesignSystemPreview } from "@/components/shared/design-system-preview";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Design System",
  description:
    "Internal component reference for the TokenAPI console. Not the product UI.",
};

export default function DesignSystemPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
      <PageHeader
        id="design-system-heading"
        title="Design System"
        description="Internal component reference for the TokenAPI console — not the product UI."
        actions={<Badge variant="outline">Internal component reference</Badge>}
      />
      <div className="mt-8">
        <DesignSystemPreview />
      </div>
    </main>
  );
}
