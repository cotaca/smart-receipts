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

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTheme } from "@/hooks/use-theme";
import { getMe, logout, refresh, setAccessToken, type Me } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<Me | null>(null);

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

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      setAccessToken(null);
      router.replace("/login");
    }
  }

  if (checking || !me) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  const initials = me.email.slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen w-full flex-col bg-background">
      <header className="flex h-[52px] flex-none items-center justify-between border-b border-border bg-background px-5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary">
            <HugeiconsIcon
              icon={Invoice01Icon}
              size={14}
              className="text-primary-foreground"
            />
          </div>
          <span className="text-[13.5px] font-semibold tracking-tight text-foreground">
            SmartReceipts
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleTheme}
            className="h-[26px] rounded-md px-2 text-[11px] text-muted-foreground"
          >
            {dark ? "Light" : "Dark"}
          </button>
          <div className="mx-1 h-4 w-px bg-border" />
          <div className="flex size-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
            {initials}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="flex size-[26px] items-center justify-center rounded-md text-muted-foreground"
          >
            <HugeiconsIcon icon={Logout01Icon} size={14} />
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-5 px-8 py-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[19px] font-semibold tracking-tight text-foreground">
              Receipts
            </h1>
            <p className="text-[12.5px] text-muted-foreground">
              Track and analyze your expenses
            </p>
          </div>
          <Button className="h-8 gap-1.5 px-3 text-[12.5px]">
            <HugeiconsIcon icon={Upload04Icon} size={14} />
            Upload receipt
          </Button>
        </div>

        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-secondary p-2 opacity-60">
          <div className="relative flex max-w-[260px] flex-1 items-center">
            <HugeiconsIcon
              icon={Search01Icon}
              size={13}
              className="pointer-events-none absolute left-2 text-muted-foreground"
            />
            <Input
              disabled
              placeholder="Search receipts…"
              className="h-[26px] pl-6.5 text-xs"
            />
          </div>
          <div className="flex h-[26px] items-center gap-1 rounded-md border border-input px-2.5 text-xs text-muted-foreground">
            This month
            <HugeiconsIcon icon={ChevronDownIcon} size={11} />
          </div>
          <div className="ml-auto flex h-[26px] items-center gap-1 rounded-md border border-input px-2.5 text-xs text-muted-foreground">
            Sort: Newest
            <HugeiconsIcon icon={ChevronDownIcon} size={11} />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center rounded-[14px] border border-dashed border-border bg-secondary px-6 py-14">
          <div className="flex max-w-70 flex-col items-center gap-3.5 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-background">
              <HugeiconsIcon
                icon={Invoice01Icon}
                size={22}
                className="text-muted-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-sm font-semibold text-foreground">
                No receipts yet
              </div>
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                Upload a receipt to start tracking your expenses automatically.
              </div>
            </div>
            <Button className="h-8 gap-1.5 px-3.5 text-[12.5px]">
              <HugeiconsIcon icon={Upload04Icon} size={14} />
              Upload your first receipt
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
