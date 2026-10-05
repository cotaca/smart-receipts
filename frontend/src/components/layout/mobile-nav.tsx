import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Upload04Icon } from "@hugeicons/core-free-icons";

import { AccountMenuItems } from "@/components/layout/account-menu";
import { useNavItems } from "@/components/layout/nav-items";
import { LogoMark } from "@/components/logo-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Me } from "@/lib/api";
import { cn } from "@/lib/utils";

export function MobileTopBar({ me }: { me: Me }) {
  const t = useTranslations("AppShell");
  return (
    <header className="flex h-13 flex-none items-center justify-between border-b border-border pr-1.5 pl-3.5 md:hidden">
      <div className="flex items-center gap-2">
        <LogoMark className="size-6" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          SmartReceipts
        </span>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("accountMenu")}
            />
          }
        >
          <Avatar size="sm">
            <AvatarFallback>
              {me.email.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <AccountMenuItems />
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function MobileBottomNav() {
  const t = useTranslations("AppShell");
  const pathname = usePathname();
  const items = useNavItems();
  return (
    <nav
      aria-label={t("mainNav")}
      className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(68px+env(safe-area-inset-bottom))] grid-cols-3 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex min-h-11 flex-col items-center justify-center gap-1 text-[11px] font-medium text-foreground"
          >
            <span
              className={cn(
                "flex h-7 w-10 items-center justify-center rounded-full",
                active && "bg-secondary",
              )}
            >
              <HugeiconsIcon icon={item.icon} className="size-5" />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

// Deviation from the board: upload is a floating button, not a fourth nav
// entry. It navigates to the list, which opens its dialog on `?upload=1`.
export function UploadFab() {
  const t = useTranslations("ReceiptsPage");
  const router = useRouter();
  const pathname = usePathname();

  function handleClick() {
    // Keep the list's filters when already there. replace, not push: the
    // list strips `upload` again with replaceState, which would otherwise
    // leave two identical history entries.
    const params = new URLSearchParams(
      pathname === "/" ? window.location.search : "",
    );
    params.set("upload", "1");
    const url = `/?${params.toString()}`;
    if (pathname === "/") router.replace(url);
    else router.push(url);
  }

  return (
    <Button
      size="icon"
      className="fixed right-4 bottom-[calc(68px+16px+env(safe-area-inset-bottom))] z-20 size-14 rounded-full shadow-lg md:hidden"
      aria-label={t("uploadReceipt")}
      onClick={handleClick}
    >
      <HugeiconsIcon icon={Upload04Icon} className="size-6" />
    </Button>
  );
}
