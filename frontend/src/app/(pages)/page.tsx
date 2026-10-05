"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  FilterIcon,
  Invoice01Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptDetailDialog } from "@/components/receipts/receipt-detail-dialog";
import { ReceiptFormDialog } from "@/components/receipts/receipt-form-dialog";
import { isPdf, ReceiptImage } from "@/components/receipts/receipt-image";
import { ReceiptFilters } from "@/components/receipts/receipt-filters";
import { ReceiptsTable } from "@/components/receipts/receipts-table";
import { deleteReceipt, listReceipts, type ReceiptPublic } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import {
  DEFAULT_FILTERS,
  filtersToParams,
  groupByMonth,
  matchReceipt,
  parseFilters,
  sortReceipts,
  sumAmounts,
  type Filters,
} from "@/lib/receipt-filters";
import { formatAmount } from "@/lib/utils";

// useSearchParams needs a Suspense boundary or `next build` fails to prerender.
export default function ReceiptsPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptsPageContent />
    </Suspense>
  );
}

function withoutUpload(query: string) {
  const params = new URLSearchParams(query);
  params.delete("upload");
  return params.toString();
}

function ReceiptsPageContent() {
  const t = useTranslations("ReceiptsPage");
  const { me } = useMe();
  const [receipts, setReceipts] = useState<ReceiptPublic[] | null>(null);
  const [listError, setListError] = useState(false);

  const searchParams = useSearchParams();
  // `?upload=1` (the mobile upload button) opens the create dialog, read like
  // `?receipt=`; the replaceState effect below strips it again.
  const [formOpen, setFormOpen] = useState(
    () => searchParams.get("upload") === "1",
  );
  const [editingReceipt, setEditingReceipt] = useState<
    ReceiptPublic | undefined
  >(undefined);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptPublic | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Initial value only, via useSearchParams rather than window.location: the
  // dashboard links here with a client-side navigation, and at first render
  // then window.location is not updated yet (the router's params are). Later
  // changes are mirrored out by the effect below, never read back in.
  // Filters follow the same pattern as `?receipt=`: read once here, mirrored
  // out by the effect below.
  const [filters, setFilters] = useState<Filters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString())),
  );
  // Captured once, like the dashboard: a tab left open across midnight keeps
  // yesterday's "this month" until reload. Accepted.
  const [today] = useState(() => new Date());
  const [detailId, setDetailId] = useState<string | null>(() =>
    searchParams.get("receipt"),
  );

  // The last query this page wrote (or started with). When searchParams
  // differ from it, something else navigated here (sidebar "Receipts" link,
  // a dashboard link to "/") without remounting: re-read filters and detail.
  // `upload` is consumed (and stripped from the URL) right here, independent
  // of the list load, so a failed or slow load can't leave it behind: the next
  // tap on the upload button would push an identical URL and open nothing.
  // The initial value excludes it, so the effect also runs once on mount.
  const lastQuery = useRef(withoutUpload(searchParams.toString()));
  const query = searchParams.toString();
  useEffect(() => {
    if (query === lastQuery.current) return;
    const params = new URLSearchParams(query);
    setFilters(parseFilters(params));
    setDetailId(params.get("receipt"));
    if (params.has("upload")) {
      if (params.get("upload") === "1") openCreateDialog();
      const next = withoutUpload(query);
      lastQuery.current = next;
      window.history.replaceState(
        null,
        "",
        next ? `${window.location.pathname}?${next}` : window.location.pathname,
      );
    } else {
      lastQuery.current = query;
    }
  }, [query]);
  useEffect(() => {
    let cancelled = false;

    listReceipts()
      .then((data) => {
        if (!cancelled) setReceipts(data);
      })
      .catch(() => {
        if (!cancelled) setListError(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side only — GET /receipts has no query params. The account's
  // receipt count is small enough that filtering the already-loaded list is
  // simpler than round-tripping to the backend for every keystroke.
  const { visibleReceipts, itemHits } = useMemo(() => {
    if (!receipts) return { visibleReceipts: null, itemHits: new Map() };
    const hits = new Map<string, string>();
    const filtered = receipts.filter((r) => {
      const { match, itemHit } = matchReceipt(
        r,
        filters,
        me.default_currency,
        today,
      );
      if (itemHit) hits.set(r.id, itemHit);
      return match;
    });
    return {
      visibleReceipts: sortReceipts(filtered, filters.sort),
      itemHits: hits,
    };
  }, [receipts, filters, me.default_currency, today]);

  // Month sections only make sense when sorted by date.
  const groups = useMemo(
    () =>
      visibleReceipts &&
      (filters.sort === "newest" || filters.sort === "oldest")
        ? groupByMonth(visibleReceipts)
        : undefined,
    [visibleReceipts, filters.sort],
  );

  const visibleSum = visibleReceipts ? sumAmounts(visibleReceipts) : null;

  // Account-wide total, independent of the active filters — only shown when
  // every receipt shares a currency, so mixed currencies never get summed
  // into a meaningless number.
  // Display only: cent-integer sum, but never feed `total` back into a
  // calculation.
  const summary = useMemo(() => {
    if (!receipts || receipts.length === 0) return null;
    const total = sumAmounts(receipts);
    if (total === null) return null;
    return { count: receipts.length, total, currency: receipts[0].currency };
  }, [receipts]);

  // Derived, not stored separately -- an edit or a delete that changes
  // `receipts` updates or closes the detail dialog automatically.
  const detailReceipt = receipts?.find((r) => r.id === detailId) ?? null;

  // Mirrors the filters and the open detail into the URL so a reload or a
  // shared link restores them (one effect, one replaceState, so neither
  // overwrites the other's params). Skipped while receipts hasn't loaded yet, so the initial
  // `?receipt=<id>` read above survives long enough for `detailReceipt` to
  // resolve instead of being stripped as "unknown".
  useEffect(() => {
    if (receipts === null) return;

    const params = new URLSearchParams(window.location.search);
    filtersToParams(filters, params);
    params.delete("upload");
    if (detailReceipt) {
      params.set("receipt", detailReceipt.id);
    } else {
      params.delete("receipt");
    }
    const next = params.toString();
    lastQuery.current = next;
    const url = next
      ? `${window.location.pathname}?${next}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [receipts, filters, detailId, detailReceipt]);

  function openCreateDialog() {
    setEditingReceipt(undefined);
    setFormOpen(true);
  }

  function openEditDialog(receipt: ReceiptPublic) {
    setEditingReceipt(receipt);
    setFormOpen(true);
  }

  function handleSaved(saved: ReceiptPublic) {
    setReceipts((current) => {
      if (!current) return [saved];
      const exists = current.some((r) => r.id === saved.id);
      return exists
        ? current.map((r) => (r.id === saved.id ? saved : r))
        : [saved, ...current];
    });
  }

  async function handleConfirmDelete() {
    if (!deletingReceipt) return;
    setIsDeleting(true);
    try {
      await deleteReceipt(deletingReceipt.id);
      setReceipts(
        (current) =>
          current?.filter((r) => r.id !== deletingReceipt.id) ?? null,
      );
      setDeletingReceipt(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-8 py-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {summary
              ? t.rich("summary", {
                  count: summary.count,
                  amount: `${formatAmount(summary.total, me.number_format)} ${summary.currency}`,
                  mono: (chunks) => <span className="font-mono">{chunks}</span>,
                })
              : t("subtitleFallback")}
          </p>
        </div>
        <Button size="lg" className="max-md:hidden" onClick={openCreateDialog}>
          <HugeiconsIcon icon={Upload04Icon} />
          {t("uploadReceipt")}
        </Button>
      </div>

      <ReceiptFilters
        filters={filters}
        onChange={setFilters}
        resultCount={visibleReceipts?.length ?? 0}
        resultSum={
          visibleSum
            ? `${formatAmount(visibleSum, me.number_format)} ${visibleReceipts![0].currency}`
            : null
        }
        totalCount={receipts ? receipts.length : null}
        countFor={(f) =>
          (receipts ?? []).filter(
            (r) => matchReceipt(r, f, me.default_currency, today).match,
          ).length
        }
      />

      {listError ? (
        <p className="text-sm text-destructive">{t("loadError")}</p>
      ) : receipts === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : receipts.length === 0 ? (
        <Empty className="flex-1 border border-dashed border-border bg-muted">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Invoice01Icon} />
            </EmptyMedia>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreateDialog}>
              <HugeiconsIcon icon={Upload04Icon} />
              {t("uploadFirstReceipt")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : visibleReceipts && visibleReceipts.length === 0 ? (
        <Empty className="flex-1 border border-dashed border-border bg-muted">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={FilterIcon} />
            </EmptyMedia>
            <EmptyTitle>{t("noMatchesTitle")}</EmptyTitle>
            <EmptyDescription>{t("noMatchesDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              onClick={() =>
                setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })
              }
            >
              {t("clearFilters")}
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ReceiptsTable
          receipts={visibleReceipts ?? []}
          groups={groups}
          itemHits={itemHits}
          onOpen={(r) => setDetailId(r.id)}
        />
      )}

      {/* Stacking order matters: the detail dialog must mount before the
          form dialog and the delete alert, so Edit/Delete from the detail
          open on top of it instead of underneath. */}
      <ReceiptDetailDialog
        receipt={detailReceipt}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onEdit={openEditDialog}
        onDelete={setDeletingReceipt}
        numberFormat={me.number_format}
      />

      <ReceiptFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        receipt={editingReceipt}
        defaultCurrency={me.default_currency}
        numberFormat={me.number_format}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={deletingReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingReceipt(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", {
                merchant: deletingReceipt?.merchant ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deletingReceipt && (
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2">
              <ReceiptImage
                receiptId={deletingReceipt.id}
                alt={deletingReceipt.merchant}
                className="size-9 flex-none rounded-md"
                pdf={isPdf(deletingReceipt.content_type)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="truncate text-xs font-medium text-foreground">
                  {deletingReceipt.merchant}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {deletingReceipt.purchased_at} ·{" "}
                  {formatAmount(deletingReceipt.amount, me.number_format)}{" "}
                  {deletingReceipt.currency}
                </div>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
