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
          <Button size="lg">
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
            <Button>
              <HugeiconsIcon icon={Upload04Icon} />
              Upload your first receipt
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    </div>
  );
}
