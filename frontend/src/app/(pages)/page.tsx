"use client";

import { useEffect, useMemo, useState } from "react";
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
  const { me } = useMe();
  const [receipts, setReceipts] = useState<ReceiptPublic[] | null>(null);
  const [listError, setListError] = useState(false);

  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [sort, setSort] = useState<SortOrder>("newest");

  const [formOpen, setFormOpen] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<
    ReceiptPublic | undefined
  >(undefined);
  const [deletingReceipt, setDeletingReceipt] = useState<ReceiptPublic | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
            Receipts
          </h1>
          <p className="text-xs text-muted-foreground">
            {summary ? (
              <>
                {summary.count} receipts ·{" "}
                <span className="font-mono">
                  {formatAmount(summary.total, me.number_format)}{" "}
                  {summary.currency}
                </span>{" "}
                tracked
              </>
            ) : (
              "Track and analyze your expenses"
            )}
          </p>
        </div>
        <Button size="lg" onClick={openCreateDialog}>
          <HugeiconsIcon icon={Upload04Icon} />
          Upload receipt
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted p-2">
        <InputGroup className="max-w-65 flex-1">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search receipts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Select
          value={period}
          onValueChange={(value) => setPeriod((value as PeriodFilter) ?? "all")}
        >
          {/* aria-label: Base-UI only mounts the popup content (and thus
              SelectValue's text) after first open, so the trigger has no
              reliable accessible name before that — don't remove as "redundant". */}
          <SelectTrigger size="sm" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="this-month">This month</SelectItem>
            <SelectItem value="last-3-months">Last 3 months</SelectItem>
            <SelectItem value="this-year">This year</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(value) => setSort((value as SortOrder) ?? "newest")}
        >
          {/* aria-label: same reason as the Period select above. */}
          <SelectTrigger size="sm" className="ml-auto" aria-label="Sort order">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Sort: Newest</SelectItem>
            <SelectItem value="oldest">Sort: Oldest</SelectItem>
            <SelectItem value="amount-desc">
              Sort: Amount (high to low)
            </SelectItem>
            <SelectItem value="amount-asc">
              Sort: Amount (low to high)
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listError ? (
        <p className="text-sm text-destructive">
          {"Couldn't load your receipts. Please refresh the page."}
        </p>
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
            <EmptyTitle>No receipts yet</EmptyTitle>
            <EmptyDescription>
              Upload a receipt to start tracking your expenses automatically.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={openCreateDialog}>
              <HugeiconsIcon icon={Upload04Icon} />
              Upload your first receipt
            </Button>
          </EmptyContent>
        </Empty>
      ) : visibleReceipts && visibleReceipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No receipts match your filters.
        </p>
      ) : (
        <ReceiptsTable
          receipts={visibleReceipts ?? []}
          onEdit={openEditDialog}
          onDelete={setDeletingReceipt}
        />
      )}

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
            <AlertDialogTitle>Delete receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              {`This will permanently delete the receipt from ${deletingReceipt?.merchant}. This can't be undone.`}
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
