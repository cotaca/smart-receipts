import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Placeholder — spend analytics need the planned ReceiptItem line-item table
// (see "Future: product-level analytics" in ARCHITECTURE.md) before this can
// show anything real.
export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-8 py-7">
      <Empty className="flex-1 border border-dashed border-border bg-muted">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={DashboardSquare01Icon} />
          </EmptyMedia>
          <EmptyTitle>Dashboard coming soon</EmptyTitle>
          <EmptyDescription>
            Spend analytics need product-level line items first.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
