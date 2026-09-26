"use client";

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  Delete02Icon,
  ImageUpload01Icon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";

import {
  ReceiptImage,
  refreshReceiptImage,
  useReceiptImageUrl,
} from "@/components/receipts/receipt-image";
import { ReceiptZoomDialog } from "@/components/receipts/receipt-zoom-view";
import { formatAmount, trimQuantity } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createReceipt,
  extractReceipt,
  replaceReceiptImage,
  updateReceipt,
  type ReceiptExtraction,
  type ReceiptItem,
  type ReceiptPublic,
} from "@/lib/api";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

// Accepts "," or "." as the decimal separator (European vs. US input), up to
// 2 decimal places to match the backend's Numeric(10, 2) column.
const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;
// Line item quantity: up to 3 decimal places (backend's Numeric(10, 3)) and
// must be > 0 -- checked separately below since regex can't express that.
const QUANTITY_PATTERN = /^\d+([.,]\d{1,3})?$/;
// Line item price: like AMOUNT_PATTERN but signed (deposit returns/discounts
// are negative).
const PRICE_PATTERN = /^-?\d+([.,]\d{1,2})?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

type ItemRow = ReceiptItem & { key: number };

function isEmptyRow(row: ItemRow): boolean {
  return (
    !row.description.trim() &&
    !row.quantity.trim() &&
    !row.unit_price.trim() &&
    !row.total_price.trim()
  );
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

// "Suggested" / "Not detected" per field — this is all POST /receipts/extract
// tells us per field. Confidence exists server-side, but only feeds the line
// filter and the overall low_quality flag, never a per-field score, so
// anything more specific (e.g. "top of receipt", a bounding-box overlay)
// would still be fabricated copy.
function ExtractionBadge({ found }: { found: boolean }) {
  const t = useTranslations("ReceiptFormDialog");
  return (
    <Badge variant={found ? "secondary" : "outline"}>
      {found ? t("suggested") : t("notDetected")}
    </Badge>
  );
}

type ReceiptFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt?: ReceiptPublic;
  defaultCurrency: string;
  numberFormat: string;
  onSaved: (receipt: ReceiptPublic) => void;
};

export function ReceiptFormDialog({
  open,
  onOpenChange,
  receipt,
  defaultCurrency,
  numberFormat,
  onSaved,
}: ReceiptFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-5xl">
        {/* Keyed by receipt id (or "create") and only mounted while open, so
            switching targets or reopening always starts from fresh state —
            no effect needed to sync form fields from props. */}
        {open && (
          <ReceiptForm
            key={receipt?.id ?? "create"}
            receipt={receipt}
            defaultCurrency={defaultCurrency}
            numberFormat={numberFormat}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ReceiptFormProps = {
  receipt?: ReceiptPublic;
  defaultCurrency: string;
  numberFormat: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (receipt: ReceiptPublic) => void;
};

function ReceiptForm({
  receipt,
  defaultCurrency,
  numberFormat,
  onOpenChange,
  onSaved,
}: ReceiptFormProps) {
  const t = useTranslations("ReceiptFormDialog");
  const isEdit = Boolean(receipt);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [merchant, setMerchant] = useState(receipt?.merchant ?? "");
  const [amount, setAmount] = useState(receipt?.amount ?? "");
  const [currency, setCurrency] = useState(
    receipt?.currency ?? defaultCurrency,
  );
  const [purchasedAt, setPurchasedAt] = useState(receipt?.purchased_at ?? "");
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  const itemKeyCounter = useRef(receipt?.items.length ?? 0);
  const [items, setItems] = useState<ItemRow[]>(
    () =>
      receipt?.items.map((item, index) => ({
        ...item,
        quantity: trimQuantity(item.quantity),
        key: index,
      })) ?? [],
  );
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isReplacingImage, setIsReplacingImage] = useState(false);
  const [extraction, setExtraction] = useState<ReceiptExtraction | null>(null);
  const [error, setError] = useState("");
  const [zoomOpen, setZoomOpen] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  // Edit mode reuses the same cached object URL ReceiptImage displays, so
  // the zoom overlay never triggers a second network fetch.
  const editImageUrl = useReceiptImageUrl(receipt?.id ?? "");

  // Local object URL for the create-mode preview. Created during render via
  // useMemo (not useState+useEffect — that would call setState synchronously
  // in the effect body) and revoked in a cleanup-only effect whenever the
  // memoized URL changes, i.e. on file change and on unmount.
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isScanning = !isEdit && isExtracting;
  const isReview = !isEdit && !isExtracting && extraction !== null;
  const foundCount = extraction
    ? [extraction.merchant, extraction.amount, extraction.purchased_at].filter(
        Boolean,
      ).length
    : 0;

  // Integer cents -- summing parsed floats drifts (0.1 + 0.2 !== 0.3).
  // Invalid/empty rows are skipped rather than blocking the sum: this
  // footer is a display-only hint, never a submit gate.
  const sumCents = items.reduce((sum, row) => {
    const total = row.total_price.trim();
    if (isEmptyRow(row) || !PRICE_PATTERN.test(total)) return sum;
    return sum + Math.round(Number(normalizeAmount(total)) * 100);
  }, 0);
  const trimmedAmount = amount.trim();
  const amountCents = AMOUNT_PATTERN.test(trimmedAmount)
    ? Math.round(Number(normalizeAmount(trimmedAmount)) * 100)
    : null;
  const itemsSumMismatch =
    amountCents !== null && amountCents !== sumCents
      ? formatAmount(
          String(Math.abs(amountCents - sumCents) / 100),
          numberFormat,
        )
      : null;

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setExtraction(null);
    if (!selected) return;

    setIsExtracting(true);
    try {
      const data = await extractReceipt(selected);
      // Only fill fields the OCR actually recognized -- never clear
      // something the user already typed because extraction found nothing.
      if (data.merchant) setMerchant(data.merchant);
      if (data.amount) setAmount(data.amount);
      if (data.purchased_at) setPurchasedAt(data.purchased_at);
      setItems((current) =>
        data.items.length && current.length === 0
          ? data.items.map((item) => ({
              ...item,
              quantity: trimQuantity(item.quantity),
              key: itemKeyCounter.current++,
            }))
          : current,
      );
      setExtraction(data);
    } catch {
      // Extraction is a convenience, not a requirement -- swallow errors so
      // manual entry keeps working exactly as before.
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleReplaceImage(selected: File | null) {
    if (!receipt || !selected || isReplacingImage) return;

    setIsReplacingImage(true);
    setError("");
    try {
      const updated = await replaceReceiptImage(receipt.id, selected);
      await refreshReceiptImage(receipt.id);
      onSaved(updated);
      // Dialog stays open -- this is its own request, separate from Save.
    } catch {
      setError(t("replaceImageError"));
    } finally {
      setIsReplacingImage(false);
    }
  }

  function addItemRow() {
    setItems((current) => [
      ...current,
      {
        description: "",
        quantity: "",
        unit_price: "",
        total_price: "",
        key: itemKeyCounter.current++,
      },
    ]);
  }

  function removeItemRow(key: number) {
    setItems((current) => current.filter((row) => row.key !== key));
  }

  function updateItemRow(key: number, patch: Partial<ReceiptItem>) {
    setItems((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        // Auto-recompute the total from quantity x unit price whenever
        // either changes and both parse -- total itself stays editable too.
        if ("quantity" in patch || "unit_price" in patch) {
          const qty = Number(normalizeAmount(next.quantity));
          const unit = Number(normalizeAmount(next.unit_price));
          if (
            next.quantity.trim() &&
            next.unit_price.trim() &&
            !Number.isNaN(qty) &&
            !Number.isNaN(unit)
          ) {
            next.total_price = (qty * unit).toFixed(2);
          }
        }
        return next;
      }),
    );
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!receipt && !file) {
      setError(t("selectImageError"));
      return;
    }

    if (!AMOUNT_PATTERN.test(amount.trim())) {
      setError(t("invalidAmountError"));
      return;
    }
    const normalizedAmount = normalizeAmount(amount);

    // The DatePicker is a button, not a native input, so it has no `required`
    // attribute to rely on for validation.
    if (!purchasedAt) {
      setError(t("selectDateError"));
      return;
    }

    // Fully empty rows are dropped; every other row must be complete and valid.
    const nonEmptyItems = items.filter((row) => !isEmptyRow(row));
    const invalidRow = nonEmptyItems.some(
      (row) =>
        !row.description.trim() ||
        !QUANTITY_PATTERN.test(row.quantity.trim()) ||
        Number(normalizeAmount(row.quantity)) <= 0 ||
        !PRICE_PATTERN.test(row.unit_price.trim()) ||
        !PRICE_PATTERN.test(row.total_price.trim()),
    );
    if (invalidRow) {
      setError(t("invalidItemsError"));
      return;
    }
    const normalizedItems: ReceiptItem[] = nonEmptyItems.map((row) => ({
      description: row.description.trim(),
      quantity: normalizeAmount(row.quantity),
      unit_price: normalizeAmount(row.unit_price),
      total_price: normalizeAmount(row.total_price),
    }));

    setIsSubmitting(true);
    setError("");

    try {
      const saved = receipt
        ? await updateReceipt(receipt.id, {
            merchant,
            amount: normalizedAmount,
            currency,
            purchased_at: purchasedAt,
            notes: notes || null,
            items: normalizedItems,
          })
        : await createReceipt({
            file: file as File,
            merchant,
            amount: normalizedAmount,
            currency,
            purchased_at: purchasedAt,
            notes: notes || undefined,
            items: normalizedItems,
          });

      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? t("saveError") : t("genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? t("editTitle") : t("uploadTitle")}</DialogTitle>
        <DialogDescription>
          {isEdit ? t("editDescription") : t("uploadDescription")}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[320px_minmax(0,1fr)]">
          {/* Preview column. At md+ it's taken out of flow (absolute) so the
              fields column alone sets the row height, and the image can grow
              at most that tall -- then it scrolls. */}
          <div className="md:relative">
            <div className="flex flex-col gap-2 md:absolute md:inset-0">
              {!isEdit && (
                <input
                  ref={fileInputRef}
                  id="file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  className="sr-only"
                  onChange={(e) =>
                    handleFileChange(e.target.files?.[0] ?? null)
                  }
                />
              )}

              {/* Same fixed-height label row as the fields column, so the
                preview's top edge lines up with the Merchant input. Edit mode
                has no input to point at -- replacing is its own button. */}
              <div className="flex h-5 items-center">
                <Label htmlFor={isEdit ? undefined : "file"}>
                  {t("receiptImageLabel")} <RequiredMark />
                </Label>
              </div>

              {isEdit && receipt ? (
                <div className="max-h-64 min-h-32 w-full overflow-y-auto rounded-lg bg-muted [scrollbar-width:thin] md:max-h-none">
                  <ReceiptImage
                    receiptId={receipt.id}
                    alt={receipt.merchant}
                    className="h-auto w-full"
                  />
                </div>
              ) : previewUrl ? (
                // Local blob preview — the file never left the browser yet, so
                // this can't go through ReceiptImage (which fetches from the API).
                <div className="max-h-64 min-h-32 w-full overflow-y-auto rounded-lg border border-border bg-muted [scrollbar-width:thin] md:max-h-none">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={t("receiptPreviewAlt")}
                    className="h-auto w-full"
                  />
                </div>
              ) : (
                <div className="flex h-64 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted text-center text-xs text-muted-foreground md:h-auto md:min-h-0 md:flex-1">
                  {t("noFileSelected")}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <HugeiconsIcon icon={ImageUpload01Icon} />
                    {t("chooseFile")}
                  </Button>
                </div>
              )}

              {!isEdit && previewUrl && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("replaceFile")}
                    {isExtracting && <Spinner />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setZoomOpen(true)}
                  >
                    <HugeiconsIcon icon={ZoomInAreaIcon} />
                    {t("zoom")}
                  </Button>
                </div>
              )}

              {isEdit && receipt && (
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={replaceFileInputRef}
                    id="replace-file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="sr-only"
                    onChange={(e) => {
                      void handleReplaceImage(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                  <Label htmlFor="replace-file" className="sr-only">
                    {t("replaceFile")}
                  </Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isReplacingImage}
                      onClick={() => replaceFileInputRef.current?.click()}
                    >
                      {isReplacingImage ? (
                        <Spinner />
                      ) : (
                        <HugeiconsIcon icon={ImageUpload01Icon} />
                      )}
                      {t("replaceFile")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoomOpen(true)}
                    >
                      <HugeiconsIcon icon={ZoomInAreaIcon} />
                      {t("zoom")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Fields column */}
          <div className="flex flex-col gap-4">
            {isScanning && (
              <Alert>
                <Spinner />
                <AlertTitle>{t("scanningTitle")}</AlertTitle>
                <AlertDescription>{t("scanningDescription")}</AlertDescription>
                <Progress value={null} className="mt-1" />
              </Alert>
            )}

            {isReview && extraction?.low_quality && (
              <Alert variant="warning">
                <HugeiconsIcon icon={Alert02Icon} />
                <AlertTitle>{t("lowQualityTitle")}</AlertTitle>
                <AlertDescription>
                  {t("lowQualityDescription")}
                </AlertDescription>
              </Alert>
            )}

            {isReview && (
              <Alert>
                <AlertDescription>
                  <p>{t("fieldsFound", { count: foundCount })}</p>
                  <p>
                    {t("itemsFound", { count: extraction?.items.length ?? 0 })}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {isScanning ? (
              <>
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <div className="flex h-5 items-center gap-2">
                    <Label htmlFor="merchant">
                      {t("merchantLabel")} <RequiredMark />
                    </Label>
                    {isReview && (
                      <ExtractionBadge found={Boolean(extraction?.merchant)} />
                    )}
                  </div>
                  <Input
                    id="merchant"
                    required
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder={t("merchantPlaceholder")}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_minmax(0,1fr)]">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex h-5 items-center gap-2">
                      <Label htmlFor="amount">
                        {t("amountLabel")} <RequiredMark />
                      </Label>
                      {isReview && (
                        <ExtractionBadge found={Boolean(extraction?.amount)} />
                      )}
                    </div>
                    {/* type="text" not "number" — number inputs reject ","
                        entirely in most locales, which would block European
                        decimal input. Validated against AMOUNT_PATTERN in
                        handleSubmit instead. */}
                    <Input
                      id="amount"
                      type="text"
                      inputMode="decimal"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={formatAmount("12.34", numberFormat)}
                      className="font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {/* Same fixed-height row as the other labels, so the
                        select stays level with the amount input even when
                        that one carries an extraction badge. */}
                    <div className="flex h-5 items-center">
                      <Label htmlFor="currency">{t("currencyLabel")}</Label>
                    </div>
                    <Select
                      value={currency}
                      onValueChange={(value) =>
                        setCurrency(value ?? defaultCurrency)
                      }
                    >
                      <SelectTrigger id="currency" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex h-5 items-center gap-2">
                      <Label htmlFor="purchased_at">
                        {t("purchaseDateLabel")} <RequiredMark />
                      </Label>
                      {isReview && (
                        <ExtractionBadge
                          found={Boolean(extraction?.purchased_at)}
                        />
                      )}
                    </div>
                    <DatePicker
                      id="purchased_at"
                      value={purchasedAt}
                      onChange={setPurchasedAt}
                      numberFormat={numberFormat}
                      placeholder={t("pickDate")}
                      className="w-full font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="notes">{t("notesLabel")}</Label>
                  <Textarea
                    id="notes"
                    rows={2}
                    className="min-h-16"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("notesPlaceholder")}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 id="line-items-heading" className="text-sm font-medium">
                      {t("lineItemsLabel")}
                    </h3>
                    {items.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addItemRow}
                      >
                        <HugeiconsIcon icon={Add01Icon} />
                        {t("addItem")}
                      </Button>
                    )}
                  </div>
                  {items.length === 0 ? (
                    <Empty className="rounded-xl border border-dashed p-4">
                      <EmptyHeader>
                        <EmptyDescription>{t("noItems")}</EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addItemRow}
                        >
                          <HugeiconsIcon icon={Add01Icon} />
                          {t("addItem")}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <>
                      {/* ~6 item rows before scrolling: header 41px + 6 x 45px
                          (p-2 cell + h-7 input + border) + footer ~33px = 344px.
                          Header and sum row stay sticky. Targets the Table's
                          own container, which is the scroll ancestor. */}
                      <div className="[&>[data-slot=table-container]]:max-h-86 [&>[data-slot=table-container]]:overflow-y-auto [&>[data-slot=table-container]]:[scrollbar-width:thin]">
                        <Table aria-labelledby="line-items-heading">
                          <TableHeader className="sticky top-0 z-10 bg-popover">
                            <TableRow>
                              <TableHead>{t("itemDescription")}</TableHead>
                              <TableHead className="w-20 text-right">
                                {t("itemQuantity")}
                              </TableHead>
                              <TableHead className="w-28 text-right">
                                {t("itemUnitPrice")}
                              </TableHead>
                              <TableHead className="w-28 text-right">
                                {t("itemTotal")}
                              </TableHead>
                              <TableHead className="w-9" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((row, index) => {
                              const rowNumber = index + 1;
                              return (
                                <TableRow key={row.key}>
                                  <TableCell>
                                    <Input
                                      aria-label={t("itemDescriptionAria", {
                                        row: rowNumber,
                                      })}
                                      maxLength={200}
                                      value={row.description}
                                      onChange={(e) =>
                                        updateItemRow(row.key, {
                                          description: e.target.value,
                                        })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      aria-label={t("itemQuantityAria", {
                                        row: rowNumber,
                                      })}
                                      type="text"
                                      inputMode="decimal"
                                      className="font-mono text-right"
                                      value={row.quantity}
                                      onChange={(e) =>
                                        updateItemRow(row.key, {
                                          quantity: e.target.value,
                                        })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      aria-label={t("itemUnitPriceAria", {
                                        row: rowNumber,
                                      })}
                                      type="text"
                                      inputMode="decimal"
                                      className="font-mono text-right"
                                      value={row.unit_price}
                                      onChange={(e) =>
                                        updateItemRow(row.key, {
                                          unit_price: e.target.value,
                                        })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Input
                                      aria-label={t("itemTotalAria", {
                                        row: rowNumber,
                                      })}
                                      type="text"
                                      inputMode="decimal"
                                      className="font-mono text-right"
                                      value={row.total_price}
                                      onChange={(e) =>
                                        updateItemRow(row.key, {
                                          total_price: e.target.value,
                                        })
                                      }
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={t("removeItemAria", {
                                        row: rowNumber,
                                      })}
                                      onClick={() => removeItemRow(row.key)}
                                    >
                                      <HugeiconsIcon icon={Delete02Icon} />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                          <TableFooter className="sticky bottom-0 z-10 bg-popover">
                            <TableRow className="bg-muted/50">
                              <TableCell colSpan={3}>{t("itemsSum")}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatAmount(
                                  String(sumCents / 100),
                                  numberFormat,
                                )}{" "}
                                {currency}
                              </TableCell>
                              <TableCell />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                      {itemsSumMismatch && (
                        // role="status", not the Alert's default "alert": the
                        // text changes on every keystroke in Amount, and an
                        // assertive live region would interrupt each time.
                        <Alert variant="warning" role="status">
                          <HugeiconsIcon icon={Alert02Icon} />
                          <AlertDescription>
                            {t("itemsSumMismatch", {
                              difference: `${itemsSumMismatch} ${currency}`,
                            })}
                          </AlertDescription>
                        </Alert>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> {t("required")}
            </p>
            {error && (
              <p className="text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isEdit ? t("saveChanges") : t("upload")}
          </Button>
        </DialogFooter>
      </form>

      {/* Zoom overlay: a second Dialog stacked over this one, sharing the
          same image source (no second network fetch). The Dialog primitive
          gives it its own focus trap and Escape handling, closing only this
          top overlay and leaving the edit/create dialog open underneath. */}
      <ReceiptZoomDialog
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        src={isEdit ? editImageUrl : previewUrl}
        merchant={receipt?.merchant ?? merchant}
      />
    </>
  );
}
