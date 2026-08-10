"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Invoice01Icon,
  Logout01Icon,
  Upload04Icon,
  Search01Icon,
  ChevronDownIcon,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ReceiptFormDialog } from "@/components/receipts/receipt-form-dialog";
import { ReceiptsTable } from "@/components/receipts/receipts-table";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteReceipt,
  getMe,
  listReceipts,
  logout,
  refresh,
  setAccessToken,
  type Me,
  type ReceiptPublic,
} from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

  const [receipts, setReceipts] = useState<ReceiptPublic[] | null>(null);
  const [listError, setListError] = useState(false);

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

    async function bootstrap() {
      try {
        const { access_token } = await refresh();
        setAccessToken(access_token);
        const user = await getMe();
        if (!cancelled) {
          setMe(user);
          setChecking(false);
        }
      } catch {
        if (!cancelled) router.replace("/login");
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!me) return;
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
  }, [me]);

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      setAccessToken(null);
      router.replace("/login");
    }
  }

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

  if (checking || !me) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  const initials = me.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex h-13 flex-none items-center justify-between border-b border-border bg-background px-5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary">
            <HugeiconsIcon
              icon={Invoice01Icon}
              className="text-primary-foreground"
            />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            SmartReceipts
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={toggleTheme}>
            {dark ? "Light" : "Dark"}
          </Button>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            <HugeiconsIcon icon={Logout01Icon} />
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 px-8 py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">
              Receipts
            </h1>
            <p className="text-xs text-muted-foreground">
              Track and analyze your expenses
            </p>
          </div>
          <Button size="lg" onClick={openCreateDialog}>
            <HugeiconsIcon icon={Upload04Icon} />
            Upload receipt
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2 opacity-60">
          <InputGroup className="max-w-65 flex-1">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
            <InputGroupInput disabled placeholder="Search receipts…" />
          </InputGroup>
          <Button variant="outline" size="sm" disabled>
            This month
            <HugeiconsIcon icon={ChevronDownIcon} />
          </Button>
          <Button variant="outline" size="sm" disabled className="ml-auto">
            Sort: Newest
            <HugeiconsIcon icon={ChevronDownIcon} />
          </Button>
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
        ) : (
          <ReceiptsTable
            receipts={receipts}
            onEdit={openEditDialog}
            onDelete={setDeletingReceipt}
          />
        )}
      </main>

      <ReceiptFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        receipt={editingReceipt}
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
    </div>
  );
}
