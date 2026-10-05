"use client";

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import { isPdf, ReceiptImage } from "@/components/receipts/receipt-image";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ReceiptPublic } from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { formatAmount } from "@/lib/utils";

type ReceiptGroup = {
  key: string; // "YYYY-MM"
  receipts: ReceiptPublic[];
  total: string | null; // dot-decimal, null for mixed currencies
};

type ReceiptsTableProps = {
  receipts: ReceiptPublic[];
  onOpen: (receipt: ReceiptPublic) => void;
  // Month sections (date sorting); without them the rows are one flat list.
  groups?: ReceiptGroup[];
  // receipt id -> the matching line item, shown under the merchant
  itemHits?: Map<string, string>;
};

export function ReceiptsTable({
  receipts,
  onOpen,
  groups,
  itemHits,
}: ReceiptsTableProps) {
  const t = useTranslations("ReceiptsTable");
  const { me } = useMe();

  // Month names follow number_format, not the UI language (dashboard rule).
  function monthLabel(key: string) {
    const [year, month] = key.split("-").map(Number);
    return new Intl.DateTimeFormat(me.number_format, {
      month: "long",
      year: "numeric",
    }).format(new Date(year, month - 1, 1));
  }

  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-14" />
          <TableHead>{t("merchant")}</TableHead>
          {/* Below sm the date moves under the merchant. This column stays
              in the header row at width 0 instead of display:none: the month
              rows' colSpan={4} would otherwise create a 4th auto column that
              takes half the merchant's width under table-fixed. */}
          <TableHead className="w-28 max-sm:w-0 max-sm:p-0">
            <span className="max-sm:hidden">{t("date")}</span>
          </TableHead>
          <TableHead className="w-28 text-right sm:w-36">
            {t("amount")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(groups ?? [{ key: "", receipts, total: null }]).map((group) => (
          <Fragment key={group.key}>
            {groups && (
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead
                  scope="colgroup"
                  colSpan={4}
                  className="h-auto py-1.5 text-xs font-normal text-foreground"
                >
                  <span className="font-medium">{monthLabel(group.key)}</span>
                  {group.total && (
                    <span className="font-mono text-muted-foreground">
                      {" · "}
                      {formatAmount(group.total, me.number_format)}{" "}
                      {group.receipts[0].currency}
                    </span>
                  )}
                </TableHead>
              </TableRow>
            )}
            {group.receipts.map((receipt) => (
              <HoverCard key={receipt.id}>
                {/* No tabIndex/aria-label here on purpose: it would add one tab
                stop per receipt. Keyboard focus already reaches the row's
                merchant button below, and Base UI's onFocus on the trigger
                bubbles up from that focus, opening the card without any new
                tab stop. Don't "fix" this by making the row focusable. */}
                <HoverCardTrigger
                  delay={250}
                  closeDelay={150}
                  render={
                    <TableRow
                      className="cursor-pointer"
                      onClick={() => onOpen(receipt)}
                    />
                  }
                >
                  <TableCell>
                    <ReceiptImage
                      receiptId={receipt.id}
                      alt={receipt.merchant}
                      className="size-10 rounded-md"
                      pdf={isPdf(receipt.content_type)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {/* No onClick of its own -- the click bubbles up to the
                    row's handler above. This button exists so the merchant
                    name is the row's one tab stop and its focus opens the
                    hover card. */}
                    <button
                      type="button"
                      title={receipt.merchant}
                      className="block max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      {receipt.merchant}
                    </button>
                    {/* Below sm the date column is hidden (the merchant would
                    get ~46 px): the date sits under the name instead. */}
                    <div className="font-mono text-xs font-normal text-muted-foreground sm:hidden">
                      {receipt.purchased_at}
                    </div>
                    {itemHits?.has(receipt.id) && (
                      <div
                        title={itemHits.get(receipt.id)}
                        className="truncate text-xs font-normal text-muted-foreground"
                      >
                        {t("lineItem")} {itemHits.get(receipt.id)}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground max-sm:hidden">
                    {receipt.purchased_at}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(receipt.amount, me.number_format)}{" "}
                    {receipt.currency}
                  </TableCell>
                </HoverCardTrigger>
                {/* No hover preview for PDFs: an icon tile adds nothing. */}
                {!isPdf(receipt.content_type) && (
                  <HoverCardContent side="left" align="center" sideOffset={16}>
                    <ReceiptImage
                      receiptId={receipt.id}
                      alt=""
                      className="max-h-[70vh] w-full rounded-md object-contain"
                    />
                  </HoverCardContent>
                )}
              </HoverCard>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
}
