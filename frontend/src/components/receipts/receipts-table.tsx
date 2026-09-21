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
          <TableRow key={receipt.id}>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
