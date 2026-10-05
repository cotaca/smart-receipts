"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon } from "@hugeicons/core-free-icons";

import { PasswordRules } from "@/components/password-rules";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  deleteAccount,
  hasErrorLoc,
  setAccessToken,
  updateMe,
  type Currency,
  type Language,
  type NumberFormat,
} from "@/lib/api";
import { syncLocaleCookie } from "@/lib/locale";
import { useMe } from "@/lib/me-context";
import { isValidPassword } from "@/lib/password";
import { formatAmount } from "@/lib/utils";

const CURRENCIES: { code: Currency; labelKey: string }[] = [
  { code: "EUR", labelKey: "currencyEur" },
  { code: "USD", labelKey: "currencyUsd" },
  { code: "GBP", labelKey: "currencyGbp" },
  { code: "CHF", labelKey: "currencyChf" },
];

// Fixed example, not a real receipt -- only used to render the live preview
// row in the Amounts card.
const PREVIEW_AMOUNT = "1248.55";

export default function SettingsPage() {
  const t = useTranslations("SettingsPage");
  const router = useRouter();
  const { mode, setTheme } = useTheme();
  const { me, setMe } = useMe();
  const [settingsError, setSettingsError] = useState("");
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Saved automatically, no Save button -- and no optimistic update: `me`
  // (and therefore every Tabs/Select below, since they're controlled by it)
  // only moves once the server has confirmed the change, so the screen never
  // shows a selection that isn't actually persisted.
  async function saveSettings(
    patch: Partial<
      Pick<typeof me, "number_format" | "default_currency" | "language">
    >,
  ) {
    setSettingsError("");
    try {
      const updated = await updateMe(patch);
      setMe(updated);
      if (patch.language && syncLocaleCookie(updated.language)) {
        router.refresh();
      }
    } catch {
      setSettingsError(t("saveError"));
    }
  }

  const memberSince = new Date(me.created_at).toLocaleDateString(
    me.number_format,
    { year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-8 py-7">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">
        {t("title")}
      </h1>

      {settingsError && (
        <Alert variant="destructive">
          <HugeiconsIcon icon={AlertCircleIcon} />
          <AlertDescription>{settingsError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("appearanceTitle")}</CardTitle>
          <CardDescription>{t("appearanceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {t("themeLabel")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("themeHint")}
              </span>
            </div>
            <Tabs
              value={mode}
              onValueChange={(value) => setTheme(value as ThemeMode)}
            >
              <TabsList>
                <TabsTrigger value="light">{t("themeLight")}</TabsTrigger>
                <TabsTrigger value="dark">{t("themeDark")}</TabsTrigger>
                <TabsTrigger value="system">{t("themeSystem")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {t("languageLabel")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("languageHint")}
              </span>
            </div>
            <Tabs
              value={me.language}
              onValueChange={(value) =>
                saveSettings({ language: value as Language })
              }
            >
              <TabsList>
                <TabsTrigger value="de">{t("languageDe")}</TabsTrigger>
                <TabsTrigger value="en">{t("languageEn")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("amountsTitle")}</CardTitle>
          <CardDescription>{t("amountsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-foreground">
                {t("numberFormatLabel")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("numberFormatHint")}
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
                {t("defaultCurrencyLabel")}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t("defaultCurrencyHint")}
              </span>
            </div>
            <Select
              value={me.default_currency}
              onValueChange={(value) =>
                value && saveSettings({ default_currency: value as Currency })
              }
            >
              <SelectTrigger
                aria-label={t("defaultCurrencyAriaLabel")}
                className="w-45"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(({ code, labelKey }) => (
                  <SelectItem key={code} value={code}>
                    <span className="font-mono">{code}</span> — {t(labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-muted px-2.5 py-2 text-[11px] text-muted-foreground">
            <span>{t("preview")}</span>
            <span className="font-mono text-sm font-medium text-foreground">
              {formatAmount(PREVIEW_AMOUNT, me.number_format)}{" "}
              {me.default_currency}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("accountTitle")}</CardTitle>
          <CardDescription>
            {t("accountDescription", { email: me.email, memberSince })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">
            {t("passwordLabel")}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPasswordDialogOpen(true)}
          >
            {t("changePassword")}
          </Button>
        </CardContent>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium text-foreground">
            {t("deleteAccount")}
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setDeleteDialogOpen(true)}
          >
            {t("deleteAccount")}
          </Button>
        </CardContent>
      </Card>

      <ChangePasswordDialog
        open={passwordDialogOpen}
        onOpenChange={setPasswordDialogOpen}
      />

      <DeleteAccountDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
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
  const t = useTranslations("SettingsPage");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const currentMissing = submitted && currentPassword === "";
  const passwordInvalid = submitted && !isValidPassword(newPassword);
  const mismatch = submitted && repeat !== newPassword;

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    const firstInvalid =
      currentPassword === ""
        ? "current-password"
        : !isValidPassword(newPassword)
          ? "new-password"
          : repeat !== newPassword
            ? "repeat-new-password"
            : null;
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setIsSubmitting(true);
    setError("");

    try {
      await changePassword(currentPassword, newPassword);
      onOpenChange(false);
    } catch (err) {
      // 400 means "wrong current password" (see routers/auth.py) -- any
      // other status is an unrelated failure.
      // 422 = the server's password policy disagrees with the client's.
      setError(
        err instanceof ApiError && err.status === 400
          ? t("wrongCurrentPassword")
          : hasErrorLoc(err, "new_password")
            ? t("errorPasswordRules")
            : t("genericError"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("changePassword")}</DialogTitle>
        <DialogDescription>{t("changePasswordDescription")}</DialogDescription>
      </DialogHeader>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3.5"
      >
        {error && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="current-password">{t("currentPasswordLabel")}</Label>
          <Input
            id="current-password"
            type="password"
            required
            value={currentPassword}
            autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
            aria-invalid={currentMissing}
            aria-describedby={
              currentMissing ? "current-password-msg" : undefined
            }
          />
          {currentMissing && (
            <div
              id="current-password-msg"
              className="flex items-start gap-1.5 text-xs text-destructive"
            >
              <HugeiconsIcon
                icon={AlertCircleIcon}
                className="mt-px size-3.5 flex-none"
              />
              <span>{t("currentPasswordRequired")}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">{t("newPasswordLabel")}</Label>
          <Input
            id="new-password"
            type="password"
            required
            value={newPassword}
            autoComplete="new-password"
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={passwordInvalid}
            aria-describedby="new-password-rules"
          />
          <PasswordRules
            id="new-password-rules"
            password={newPassword}
            submitted={submitted}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="repeat-new-password">
            {t("repeatNewPasswordLabel")}
          </Label>
          <Input
            id="repeat-new-password"
            type="password"
            required
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            aria-invalid={mismatch}
            aria-describedby={mismatch ? "repeat-new-password-msg" : undefined}
          />
          {mismatch && (
            <div
              id="repeat-new-password-msg"
              className="flex items-start gap-1.5 text-xs text-destructive"
            >
              <HugeiconsIcon
                icon={AlertCircleIcon}
                className="mt-px size-3.5 flex-none"
              />
              <span>{t("passwordMismatch")}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("changePassword")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        {/* Only mounted while open, so reopening always starts from a blank
            password field -- same pattern as ChangePasswordDialog. */}
        {open && <DeleteAccountForm />}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteAccountForm() {
  const t = useTranslations("SettingsPage");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      await deleteAccount(password);
      setAccessToken(null);
      router.replace("/login");
    } catch (err) {
      // 400 means "wrong password" (see routers/auth.py) -- any other
      // status is an unrelated failure.
      setError(
        err instanceof ApiError && err.status === 400
          ? t("wrongPassword")
          : t("genericError"),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("deleteAccount")}</AlertDialogTitle>
        <AlertDialogDescription>
          {t("deleteAccountDescription")}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        {error && (
          <Alert variant="destructive">
            <HugeiconsIcon icon={AlertCircleIcon} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delete-account-password">
            {t("deleteAccountConfirmLabel")}
          </Label>
          <Input
            id="delete-account-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button type="submit" variant="destructive" disabled={isSubmitting}>
            {isSubmitting && <Spinner />}
            {t("deleteAccount")}
          </Button>
        </AlertDialogFooter>
      </form>
    </>
  );
}
