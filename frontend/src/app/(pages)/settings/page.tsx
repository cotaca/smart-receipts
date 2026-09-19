"use client";

import { useState, type SubmitEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme, type ThemeMode } from "@/hooks/use-theme";
import {
  ApiError,
  changePassword,
  updateMe,
  type Currency,
  type NumberFormat,
} from "@/lib/api";
import { useMe } from "@/lib/me-context";
import { formatAmount } from "@/lib/utils";

const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "EUR", label: "Euro" },
  { code: "USD", label: "US Dollar" },
  { code: "GBP", label: "British Pound" },
  { code: "CHF", label: "Swiss Franc" },
];

// Fixed example, not a real receipt -- only used to render the live preview
// row in the Amounts card.
const PREVIEW_AMOUNT = "1248.55";

export default function SettingsPage() {
  const { mode, setTheme } = useTheme();
  const { me, setMe } = useMe();
  const [settingsError, setSettingsError] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  // Saved automatically, no Save button -- and no optimistic update: `me`
  // (and therefore every Tabs/Select below, since they're controlled by it)
  // only moves once the server has confirmed the change, so the screen never
  // shows a selection that isn't actually persisted.
  async function saveSettings(
    patch: Partial<Pick<typeof me, "number_format" | "default_currency">>,
  ) {
    setSettingsError("");
    try {
      setMe(await updateMe(patch));
    } catch {
      setSettingsError("Couldn't save your changes. Please try again.");
    }
  }

  const memberSince = new Date(me.created_at).toLocaleDateString(
    me.number_format,
    { year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-8 py-7">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        Settings
      </h1>

      {settingsError && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertDescription>{settingsError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Stored on this device only — sign in elsewhere and you&apos;ll need
            to set it again.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-foreground">Theme</span>
            <span className="text-[11px] text-muted-foreground">
              System follows your OS setting
            </span>
          </div>
          <Tabs
            value={mode}
            onValueChange={(value) => setTheme(value as ThemeMode)}
          >
            <TabsList>
              <TabsTrigger value="light">Light</TabsTrigger>
              <TabsTrigger value="dark">Dark</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amounts</CardTitle>
          <CardDescription>
            Display only — stored values stay exact decimals.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                Number format
              </span>
              <span className="text-[11px] text-muted-foreground">
                Decimal separator for every amount
              </span>
            </div>
            <Tabs
              value={me.number_format}
              onValueChange={(value) =>
                saveSettings({ number_format: value as NumberFormat })
              }
            >
              <TabsList>
                <TabsTrigger value="de-DE" className="font-mono">
                  1.234,56
                </TabsTrigger>
                <TabsTrigger value="en-US" className="font-mono">
                  1,234.56
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                Default currency
              </span>
              <span className="text-[11px] text-muted-foreground">
                Pre-selected on every new receipt
              </span>
            </div>
            <Select
              value={me.default_currency}
              onValueChange={(value) =>
                value && saveSettings({ default_currency: value as Currency })
              }
            >
              <SelectTrigger aria-label="Default currency" className="w-45">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(({ code, label }) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-mono">{code}</span> — {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
            <span>Preview</span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatAmount(PREVIEW_AMOUNT, me.number_format)}{" "}
              {me.default_currency}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {me.email} · member since {memberSince}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">Password</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPasswordDialogOpen(true)}
          >
            Change password
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />
    </main>
  );
}

function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Only mounted while open, so reopening always starts from blank
            fields -- same pattern as ReceiptFormDialog. */}
        {open && <ChangePasswordForm onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordForm({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      await changePassword(currentPassword, newPassword);
      onOpenChange(false);
    } catch (err) {
      // 400 means "wrong current password" (see routers/auth.py) -- any
      // other status is an unrelated failure.
      setError(
        err instanceof ApiError && err.status === 400
          ? "Current password is incorrect."
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change password</DialogTitle>
        <DialogDescription>
          Your other signed-in sessions stay signed in.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {error && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">Current password</Label>
          <Input
            id="current-password"
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            type="password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            Change password
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
