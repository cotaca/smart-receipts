"use client";

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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14" />
          <TableHead>Merchant</TableHead>
          <TableHead>Date</TableHead>
          <TableHead className="text-right">Amount</TableHead>
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
            <TableCell className="text-muted-foreground">
              {receipt.purchased_at}
            </TableCell>
            <TableCell className="text-right">
              {receipt.amount} {receipt.currency}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Receipt actions"
                    >
                      <HugeiconsIcon icon={MoreVerticalIcon} />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(receipt)}>
                    <HugeiconsIcon icon={PencilEdit02Icon} />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onDelete(receipt)}
                  >
                    <HugeiconsIcon icon={Delete02Icon} />
                    Delete
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
