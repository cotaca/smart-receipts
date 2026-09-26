"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Invoice01Icon,
  Search01Icon,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptDetailDialog } from "@/components/receipts/receipt-detail-dialog";
import { ReceiptFormDialog } from "@/components/receipts/receipt-form-dialog";
import { ReceiptImage } from "@/components/receipts/receipt-image";
import { ReceiptsTable } from "@/components/receipts/receipts-table";
import { deleteReceipt, listReceipts, type ReceiptPublic } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { formatAmount } from "@/lib/utils";

type PeriodFilter = "all" | "this-month" | "last-3-months" | "this-year";
type SortOrder = "newest" | "oldest" | "amount-desc" | "amount-asc";

function matchesPeriod(purchasedAt: string, period: PeriodFilter): boolean {
  if (period === "all") return true;

  const date = new Date(purchasedAt);
  const now = new Date();

  if (period === "this-month") {
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }
  if (period === "this-year") {
    return date.getFullYear() === now.getFullYear();
  }
  // last-3-months: this month plus the two before it
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  return date >= cutoff;
}

function sortReceipts(
  receipts: ReceiptPublic[],
  sort: SortOrder,
): ReceiptPublic[] {
  const sorted = [...receipts];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) =>
        a.purchased_at.localeCompare(b.purchased_at),
      );
    case "amount-desc":
      return sorted.sort((a, b) => Number(b.amount) - Number(a.amount));
    case "amount-asc":
      return sorted.sort((a, b) => Number(a.amount) - Number(b.amount));
    case "newest":
    default:
      return sorted.sort((a, b) =>
        b.purchased_at.localeCompare(a.purchased_at),
      );
  }
}

export default function ReceiptsPage() {
  const t = useTranslations("ReceiptsPage");
  const { me } = useMe();
  const [receipts, setReceipts] = useState<ReceiptPublic[] | null>(null);
  const [listError, setListError] = useState(false);

  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [sort, setSort] = useState<SortOrder>("newest");

  // Passed to Select as `items` as well as mapped into the SelectItems:
  // without `items`, Base UI's SelectValue falls back to rendering the raw
  // value ("this-month", "amount-desc") in the trigger instead of the label.
  const periodOptions: { value: PeriodFilter; label: string }[] = [
    { value: "all", label: t("periodAll") },
    { value: "this-month", label: t("periodThisMonth") },
    { value: "last-3-months", label: t("periodLast3Months") },
    { value: "this-year", label: t("periodThisYear") },
  ];
  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: "newest", label: t("sortNewest") },
    { value: "oldest", label: t("sortOldest") },
    { value: "amount-desc", label: t("sortAmountDesc") },
    { value: "amount-asc", label: t("sortAmountAsc") },
  ];

  const [formOpen, setFormOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<
    ReceiptPublic | undefined
  >(undefined);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptPublic | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  // Read once via a lazy initializer, not via useSearchParams (that would
  // need a Suspense boundary just for this) and not via setState in an
  // effect (React flags that as a cascading-render smell). Guarded for SSR,
  // where `window` doesn't exist yet -- the value only matters client-side.
  const [detailId, setDetailId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("receipt"),
  );

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
  const visibleReceipts = useMemo(() => {
    if (!receipts) return null;
    const needle = search.trim().toLowerCase();
    const filtered = receipts.filter(
      (r) =>
        r.merchant.toLowerCase().includes(needle) &&
        matchesPeriod(r.purchased_at, period),
    );
    return sortReceipts(filtered, sort);
  }, [receipts, search, period, sort]);

  // Account-wide total, independent of the active filters — only shown when
  // every receipt shares a currency, so mixed currencies never get summed
  // into a meaningless number.
  // Display only: Number()/toFixed() is fine for rendering, but unlike the
  // backend's Decimal this is float math — never feed `total` back into a
  // calculation.
  const summary = useMemo(() => {
    if (!receipts || receipts.length === 0) return null;
    const currency = receipts[0].currency;
    if (receipts.some((r) => r.currency !== currency)) return null;
    const total = receipts.reduce((sum, r) => sum + Number(r.amount), 0);
    return { count: receipts.length, total: total.toFixed(2), currency };
  }, [receipts]);

  // Derived, not stored separately -- an edit or a delete that changes
  // `receipts` updates or closes the detail dialog automatically.
  const detailReceipt = receipts?.find((r) => r.id === detailId) ?? null;

  // Mirrors the open detail into the URL so a reload or a shared link
  // reopens it. Skipped while receipts hasn't loaded yet, so the initial
  // `?receipt=<id>` read above survives long enough for `detailReceipt` to
  // resolve instead of being stripped as "unknown".
  useEffect(() => {
    if (receipts === null) return;

    const params = new URLSearchParams(window.location.search);
    if (detailReceipt) {
      params.set("receipt", detailReceipt.id);
    } else {
      params.delete("receipt");
    }
    const query = params.toString();
    const url = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [receipts, detailId, detailReceipt]);

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
        <Button size="lg" onClick={openCreateDialog}>
          <HugeiconsIcon icon={Upload04Icon} />
          {t("uploadReceipt")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted p-2">
        <InputGroup className="max-w-65 flex-1">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select
          items={periodOptions}
          value={period}
          onValueChange={(value) => setPeriod((value as PeriodFilter) ?? "all")}
        >
          {/* aria-label: the trigger's visible text is the selected value, so
              without this the control has no name of its own telling you what
              it filters — don't remove as "redundant". */}
          <SelectTrigger size="sm" aria-label={t("periodAriaLabel")}>
            <SelectValue />
          </SelectTrigger>
          {/* SelectContent defaults to w-(--anchor-width), i.e. exactly the
              trigger's width — and the trigger is w-fit, so it's sized to the
              *selected* label. Any longer option then gets clipped. Keep that
              width as the floor, let the popup grow past it. */}
          <SelectContent className="w-auto min-w-(--anchor-width)">
            {periodOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={sortOptions}
          value={sort}
          onValueChange={(value) => setSort((value as SortOrder) ?? "newest")}
        >
          {/* aria-label: same reason as the Period select above. */}
          <SelectTrigger
            size="sm"
            className="ml-auto"
            aria-label={t("sortAriaLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          {/* Same clipping fix as the Period select above. */}
          <SelectContent className="w-auto min-w-(--anchor-width)">
            {sortOptions.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
        <p className="text-sm text-muted-foreground">{t("noMatches")}</p>
      ) : (
        <ReceiptsTable
          receipts={visibleReceipts ?? []}
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
