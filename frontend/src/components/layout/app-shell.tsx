"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Me } from "@/lib/api";

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const t = useTranslations("AppShell");

  return (
    <SidebarProvider>
      <AppSidebar me={me} />
      <SidebarInset>
        {/* Sidebar defaults to offcanvas below md, so without this trigger
            mobile has no way to reach nav, theme toggle or sign-out. One
            trigger here (not per page) covers all three routes under this shell.
            aria-label wins over the sr-only "Toggle Sidebar" span baked into
            the shadcn-generated SidebarTrigger, so the accessible name is
            translated without touching components/ui/sidebar.tsx. */}
        <SidebarTrigger
          className="m-2 self-start md:hidden"
          aria-label={t("toggleSidebar")}
        />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
