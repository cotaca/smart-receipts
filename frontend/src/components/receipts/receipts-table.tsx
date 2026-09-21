"use client";

import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Delete02Icon,
  MoreVerticalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";

import { ReceiptImage } from "@/components/receipts/receipt-image";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  onEdit: (receipt: ReceiptPublic) => void;
  onDelete: (receipt: ReceiptPublic) => void;
};

export function ReceiptsTable({
  receipts,
  onEdit,
  onDelete,
}: ReceiptsTableProps) {
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
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {receipts.map((receipt) => (
          <HoverCard key={receipt.id}>
            {/* No tabIndex/aria-label here on purpose: it would add one tab
                stop per receipt. Keyboard focus already reaches the row's
                "…" button below, and Base UI's onFocus on the trigger
                bubbles up from that focus, opening the card without any new
                tab stop. Don't "fix" this by making the row focusable. */}
            <HoverCardTrigger
              delay={250}
              closeDelay={150}
              render={<TableRow />}
            >
              <TableCell>
                <ReceiptImage
                  receiptId={receipt.id}
                  alt={receipt.merchant}
                  className="size-10 rounded-md"
                />
              </TableCell>
              <TableCell className="font-medium">{receipt.merchant}</TableCell>
              <TableCell className="font-mono text-muted-foreground">
                {receipt.purchased_at}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatAmount(receipt.amount, me.number_format)}{" "}
                {receipt.currency}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("actionsAriaLabel")}
                      >
                        <HugeiconsIcon icon={MoreVerticalIcon} />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(receipt)}>
                      <HugeiconsIcon icon={PencilEdit02Icon} />
                      {t("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onDelete(receipt)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                      {t("delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
