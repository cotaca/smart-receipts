import { HugeiconsIcon } from "@hugeicons/react";
import { Settings01Icon } from "@hugeicons/core-free-icons";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Placeholder — no settings table/endpoint exists yet (see "Settings" in
// CLAUDE.local.md: theme, language, monetary format, default currency).
export default function SettingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-8 py-7">
      <Empty className="flex-1 border border-dashed border-border bg-muted">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Settings01Icon} />
          </EmptyMedia>
          <EmptyTitle>Settings coming soon</EmptyTitle>
          <EmptyDescription>
            Account-wide theme, language, and currency preferences aren&apos;t
            built yet.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
