"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DashboardSquare01Icon,
  Invoice01Icon,
  Logout01Icon,
  Moon01Icon,
  Settings01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";
import { logout, setAccessToken, type Me } from "@/lib/api";

export function AppSidebar({ me }: { me: Me }) {
  const t = useTranslations("AppSidebar");
  const pathname = usePathname();
  const router = useRouter();
  const { dark, toggleTheme } = useTheme();
  const initials = me.email.slice(0, 2).toUpperCase();

  // Order matches the ReceiptsDesktop mockup's Workspace group.
  const navItems = [
    {
      href: "/dashboard",
      label: t("navDashboard"),
      icon: DashboardSquare01Icon,
    },
    { href: "/", label: t("navReceipts"), icon: Invoice01Icon },
    { href: "/settings", label: t("navSettings"), icon: Settings01Icon },
  ];

  async function handleSignOut() {
    try {
      await logout();
    } finally {
      setAccessToken(null);
      router.replace("/login");
    }
  }

  return (
    <Sidebar>
      <SidebarHeader className="h-13 flex-row items-center gap-2 border-b border-border px-3.5">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary">
          <HugeiconsIcon
            icon={Invoice01Icon}
            className="text-primary-foreground"
          />
        </div>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          SmartReceipts
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                  >
                    <HugeiconsIcon icon={item.icon} />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg">
                <Avatar size="sm">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-xs text-foreground">
                  {me.email}
                </span>
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuItem onClick={toggleTheme}>
              <HugeiconsIcon icon={dark ? Sun01Icon : Moon01Icon} />
              {t("toggleTheme")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <HugeiconsIcon icon={Logout01Icon} />
              {t("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
