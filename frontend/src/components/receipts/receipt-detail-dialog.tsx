"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  Download04Icon,
  PencilEdit02Icon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons";

import {
  isPdf,
  ReceiptImage,
  ReceiptPdfFrame,
  useReceiptImageUrl,
} from "@/components/receipts/receipt-image";
import { ReceiptZoomDialog } from "@/components/receipts/receipt-zoom-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReceiptPublic } from "@/lib/api";
import { formatAmount, formatDate, formatQuantity } from "@/lib/utils";

type ReceiptDetailDialogProps = {
  receipt: ReceiptPublic | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (receipt: ReceiptPublic) => void;
  onDelete: (receipt: ReceiptPublic) => void;
  numberFormat: string;
};

export function ReceiptDetailDialog({
  receipt,
  onOpenChange,
  onEdit,
  onDelete,
  numberFormat,
}: ReceiptDetailDialogProps) {
  return (
    <Dialog open={receipt !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-5xl">
        {/* Rendered only while a receipt is set -- same reasoning as the
            form dialog: simpler than holding onto the last receipt through
            the close animation. */}
        {receipt && (
          <ReceiptDetailContent
            receipt={receipt}
            onEdit={onEdit}
            onDelete={onDelete}
            numberFormat={numberFormat}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type ReceiptDetailContentProps = {
  receipt: ReceiptPublic;
  onEdit: (receipt: ReceiptPublic) => void;
  onDelete: (receipt: ReceiptPublic) => void;
  numberFormat: string;
};

function ReceiptDetailContent({
  receipt,
  onEdit,
  onDelete,
  numberFormat,
}: ReceiptDetailContentProps) {
  const t = useTranslations("ReceiptDetailDialog");
  const [zoomOpen, setZoomOpen] = useState(false);
  const pdf = isPdf(receipt.content_type);
  // Same cached object URL ReceiptImage displays -- Zoom/Download never
  // trigger a second network fetch.
  const imageUrl = useReceiptImageUrl(receipt.id);

  const addedDate = new Date(receipt.created_at).toLocaleDateString(
    numberFormat,
    { day: "2-digit", month: "2-digit", year: "numeric" },
  );

  // Integer cents -- summing parsed floats drifts (0.1 + 0.2 !== 0.3), same
  // as the form dialog's items-sum footer.
  const sumCents = receipt.items.reduce(
    (sum, item) => sum + Math.round(Number(item.total_price) * 100),
    0,
  );

  return (
    <>
      <DialogHeader className="flex-row items-start justify-between gap-2 pr-8">
        <div className="flex flex-col gap-1">
          <DialogTitle>{receipt.merchant}</DialogTitle>
          <DialogDescription>
            {t.rich("added", {
              date: addedDate,
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </DialogDescription>
        </div>
        <div className="flex flex-none gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(receipt)}>
            <HugeiconsIcon icon={PencilEdit02Icon} />
            {t("edit")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onDelete(receipt)}
          >
            <HugeiconsIcon icon={Delete02Icon} />
            {t("delete")}
          </Button>
        </div>
      </DialogHeader>

      {/* Same height cap as the form dialog: at md+ the facts column sets the
          row height and the image column is absolutely positioned inside it,
          so a tall receipt scrolls instead of stretching the dialog. The
          min-height keeps the image usable when the facts column is short
          (no notes, no items), capped by the viewport so it never overflows. */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:min-h-[min(24rem,calc(100dvh-12rem))] md:grid-cols-[320px_minmax(0,1fr)]">
        <div className="md:relative">
          <div className="flex flex-col gap-2 md:absolute md:inset-0">
            {pdf ? (
              <ReceiptPdfFrame
                src={imageUrl}
                title={t("pdfFrameTitle", { merchant: receipt.merchant })}
                className="min-h-32 md:h-full"
              />
            ) : (
              <div className="max-h-64 min-h-32 w-full overflow-y-auto rounded-lg bg-muted [scrollbar-width:thin] md:max-h-none">
                <ReceiptImage
                  receiptId={receipt.id}
                  alt={receipt.merchant}
                  className="h-auto w-full"
                />
              </div>
            )}
            <div className="flex flex-none gap-2">
              {imageUrl ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a href={imageUrl} download={receipt.original_filename} />
                  }
                >
                  <HugeiconsIcon icon={Download04Icon} />
                  {t("download")}
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  <HugeiconsIcon icon={Download04Icon} />
                  {t("download")}
                </Button>
              )}
              {/* PDFs zoom via the browser's own PDF viewer inside the
                  iframe -- a second overlay would be redundant. */}
              {!pdf && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomOpen(true)}
                >
                  <HugeiconsIcon icon={ZoomInAreaIcon} />
                  {t("fullSize")}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("amount")}</span>
              <span className="font-mono">
                {formatAmount(receipt.amount, numberFormat)} {receipt.currency}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("purchased")}</span>
              <span className="font-mono">
                {formatDate(receipt.purchased_at, numberFormat)}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("currency")}</span>
              <span className="font-mono">{receipt.currency}</span>
            </div>
          </div>

          {receipt.notes && (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground">{t("notes")}</span>
              <p className="whitespace-pre-wrap">{receipt.notes}</p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("lineItems")}</h3>
            {receipt.items.length === 0 ? (
              <p className="text-muted-foreground">{t("noItems")}</p>
            ) : (
              <>
                <p className="text-muted-foreground">
                  {t("itemsSummary", {
                    count: receipt.items.length,
                    amount: `${formatAmount(String(sumCents / 100), numberFormat)} ${receipt.currency}`,
                  })}
                </p>
                <Table>
                  <TableHeader>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipt.items.map((item, index) => (
                      // Read-only list -- no server id per line item, index is
                      // stable here since the list isn't reordered or edited.
                      <TableRow key={index}>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatQuantity(item.quantity, numberFormat)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(item.unit_price, numberFormat)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatAmount(item.total_price, numberFormat)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </div>
        </div>
      </div>

      <ReceiptZoomDialog
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        src={imageUrl}
        merchant={receipt.merchant}
      />
    </>
  );
}
