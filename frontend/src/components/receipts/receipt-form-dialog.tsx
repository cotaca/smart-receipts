"use client";

import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ImageUpload01Icon, ZoomInAreaIcon } from "@hugeicons/core-free-icons";

import {
  ReceiptImage,
  refreshReceiptImage,
  useReceiptImageUrl,
} from "@/components/receipts/receipt-image";
import { ReceiptZoomView } from "@/components/receipts/receipt-zoom-view";
import { formatAmount } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createReceipt,
  extractReceipt,
  replaceReceiptImage,
  updateReceipt,
  type ReceiptExtraction,
  type ReceiptPublic,
} from "@/lib/api";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

// Accepts "," or "." as the decimal separator (European vs. US input), up to
// 2 decimal places to match the backend's Numeric(10, 2) column.
const AMOUNT_PATTERN = /^\d+([.,]\d{1,2})?$/;

function normalizeAmount(raw: string): string {
  return raw.trim().replace(",", ".");
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

// "Suggested" / "Not detected" per field — this is all POST /receipts/extract
// tells us. It returns no source or confidence, so anything more specific
// (e.g. "top of receipt", a bounding-box overlay) would be fabricated copy.
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
      <DialogContent className="sm:max-w-3xl">
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
          })
        : await createReceipt({
            file: file as File,
            merchant,
            amount: normalizedAmount,
            currency,
            purchased_at: purchasedAt,
            notes: notes || undefined,
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

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-xs text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> {t("required")}
        </p>

        <div className="grid gap-4 sm:grid-cols-[280px_1fr]">
          {/* Preview column */}
          <div className="flex flex-col gap-2">
            {isEdit && receipt ? (
              <div className="h-96 w-full overflow-y-auto rounded-lg bg-muted [scrollbar-width:thin]">
                <ReceiptImage
                  receiptId={receipt.id}
                  alt={receipt.merchant}
                  className="h-auto w-full"
                />
              </div>
            ) : previewUrl ? (
              // Local blob preview — the file never left the browser yet, so
              // this can't go through ReceiptImage (which fetches from the API).
              <div className="h-96 w-full overflow-y-auto rounded-lg border border-border bg-muted [scrollbar-width:thin]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt={t("receiptPreviewAlt")}
                  className="h-auto w-full"
                />
              </div>
            ) : (
              <div className="flex h-96 w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted text-center text-xs text-muted-foreground">
                {t("noFileSelected")}
              </div>
            )}

            {!isEdit && (
              <div className="flex flex-col gap-1.5">
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
                <Label htmlFor="file">
                  {t("receiptImageLabel")} <RequiredMark />
                </Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {file ? t("replaceFile") : t("chooseFile")}
                    {isExtracting && <Spinner />}
                  </Button>
                  {previewUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setZoomOpen(true)}
                    >
                      <HugeiconsIcon icon={ZoomInAreaIcon} />
                      {t("zoom")}
                    </Button>
                  )}
                </div>
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

            {isReview && (
              <Alert>
                <AlertDescription>
                  {t("fieldsFound", { count: foundCount })}
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

                <div className="flex gap-3">
                  <div className="flex flex-1 flex-col gap-1.5">
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
                  <div className="flex w-28 flex-col gap-1.5">
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
                  <Input
                    id="purchased_at"
                    type="date"
                    required
                    value={purchasedAt}
                    onChange={(e) => setPurchasedAt(e.target.value)}
                    className="font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="notes">{t("notesLabel")}</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("notesPlaceholder")}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
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
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        {/* Wider than the dialog underneath (sm:max-w-3xl) -- an overlay the
            same size as its parent would not read as a zoom at all. */}
        <DialogContent className="sm:max-w-5xl">
          <DialogTitle className="sr-only">
            {t("zoomTitle", { merchant: receipt?.merchant ?? merchant })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("zoomDescription")}
          </DialogDescription>
          {zoomOpen && (isEdit ? editImageUrl : previewUrl) && (
            <ReceiptZoomView
              src={(isEdit ? editImageUrl : previewUrl) as string}
              alt=""
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
