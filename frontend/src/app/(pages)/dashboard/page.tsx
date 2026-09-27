"use client";

import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSquare01Icon } from "@hugeicons/core-free-icons";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Placeholder — line items are stored (see .claude/rules/backend/receipts-api.md),
// but the analytics backend this page needs is not built yet, so it can
// show nothing real.
export default function DashboardPage() {
  const t = useTranslations("DashboardPage");

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-8 py-7">
      <Empty className="flex-1 border border-dashed border-border bg-muted">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={DashboardSquare01Icon} />
          </EmptyMedia>
          <EmptyTitle>{t("title")}</EmptyTitle>
          <EmptyDescription>{t("description")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
