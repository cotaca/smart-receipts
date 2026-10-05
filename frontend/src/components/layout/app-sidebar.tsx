"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { AccountMenuItems } from "@/components/layout/account-menu";
import { useNavItems } from "@/components/layout/nav-items";
import { LogoMark } from "@/components/logo-mark";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import type { Me } from "@/lib/api";

export function AppSidebar({ me }: { me: Me }) {
  const t = useTranslations("AppSidebar");
  const pathname = usePathname();
  const navItems = useNavItems();
  const initials = me.email.slice(0, 2).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="h-13 flex-row items-center gap-2 border-b border-border px-3.5">
        <LogoMark className="size-6" />
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
            <AccountMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
