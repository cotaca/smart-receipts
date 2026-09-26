"use client";

import { useTranslations } from "next-intl";

import { ReceiptImage } from "@/components/receipts/receipt-image";
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

type ReceiptsTableProps = {
  receipts: ReceiptPublic[];
  onOpen: (receipt: ReceiptPublic) => void;
};

export function ReceiptsTable({ receipts, onOpen }: ReceiptsTableProps) {
  const t = useTranslations("ReceiptsTable");
  const { me } = useMe();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14" />
          <TableHead>{t("merchant")}</TableHead>
          <TableHead>{t("date")}</TableHead>
          <TableHead className="text-right">{t("amount")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.map((receipt) => (
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
                />
              </TableCell>
              <TableCell className="font-medium">
                {/* No onClick of its own -- the click bubbles up to the
                    row's handler above. This button exists so the merchant
                    name is the row's one tab stop and its focus opens the
                    hover card. */}
                <button
                  type="button"
                  className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {receipt.merchant}
                </button>
              </TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {receipt.purchased_at}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatAmount(receipt.amount, me.number_format)}{" "}
                {receipt.currency}
              </TableCell>
            </HoverCardTrigger>
            <HoverCardContent side="left" align="center" sideOffset={16}>
              <ReceiptImage
                receiptId={receipt.id}
                alt=""
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
            </HoverCardContent>
          </HoverCard>
        ))}
      </TableBody>
    </Table>
  );
}
