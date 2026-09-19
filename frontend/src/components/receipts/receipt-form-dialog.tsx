"use client";

import { useState, type SubmitEvent } from "react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  createReceipt,
  extractReceipt,
  updateReceipt,
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

type ReceiptFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt?: ReceiptPublic;
  onSaved: (receipt: ReceiptPublic) => void;
};

export function ReceiptFormDialog({
  open,
  onOpenChange,
  receipt,
  onSaved,
}: ReceiptFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Keyed by receipt id (or "create") and only mounted while open, so
            switching targets or reopening always starts from fresh state —
            no effect needed to sync form fields from props. */}
        {open && (
          <ReceiptForm
            key={receipt?.id ?? "create"}
            receipt={receipt}
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
  onOpenChange: (open: boolean) => void;
  onSaved: (receipt: ReceiptPublic) => void;
};

function ReceiptForm({ receipt, onOpenChange, onSaved }: ReceiptFormProps) {
  const isEdit = Boolean(receipt);

  const [merchant, setMerchant] = useState(receipt?.merchant ?? "");
  const [amount, setAmount] = useState(receipt?.amount ?? "");
  const [currency, setCurrency] = useState(receipt?.currency ?? "EUR");
  const [purchasedAt, setPurchasedAt] = useState(receipt?.purchased_at ?? "");
  const [notes, setNotes] = useState(receipt?.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    if (!selected) return;

    setIsExtracting(true);
    try {
      const data = await extractReceipt(selected);
      // Only fill fields the OCR actually recognized -- never clear
      // something the user already typed because extraction found nothing.
      if (data.merchant) setMerchant(data.merchant);
      if (data.amount) setAmount(data.amount);
      if (data.purchased_at) setPurchasedAt(data.purchased_at);
    } catch {
      // Extraction is a convenience, not a requirement -- swallow errors so
      // manual entry keeps working exactly as before.
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;

    if (!receipt && !file) {
      setError("Please select a receipt image");
      return;
    }

    if (!AMOUNT_PATTERN.test(amount.trim())) {
      setError("Please enter a valid amount (e.g. 12.34 or 12,34)");
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
      setError(
        err instanceof ApiError
          ? "Couldn't save the receipt. Please check the details and try again."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit receipt" : "Upload receipt"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Update the details for this receipt."
            : "Add a receipt image and its details."}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <p className="text-xs text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> Required
        </p>

        {!isEdit && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="file">
              Receipt image <RequiredMark />
            </Label>
            {/* No `required` attribute — validated in handleSubmit instead,
                which also gives a proper in-context error message. */}
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
              {isExtracting && <Spinner />}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="merchant">
            Merchant <RequiredMark />
          </Label>
          <Input
            id="merchant"
            required
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Rewe"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="amount">
              Amount <RequiredMark />
            </Label>
            {/* type="text" not "number" — number inputs reject "," entirely
                in most locales, which would block European decimal input.
                Validated against AMOUNT_PATTERN in handleSubmit instead. */}
            <Input
              id="amount"
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="12,34"
            />
          </div>
          <div className="flex w-28 flex-col gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Select
              value={currency}
              onValueChange={(value) => setCurrency(value ?? "EUR")}
            >
              <SelectTrigger id="currency">
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
          <Label htmlFor="purchased_at">
            Purchase date <RequiredMark />
          </Label>
          <Input
            id="purchased_at"
            type="date"
            required
            value={purchasedAt}
            onChange={(e) => setPurchasedAt(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {isEdit ? "Save changes" : "Upload"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
