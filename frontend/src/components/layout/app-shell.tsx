"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  MobileBottomNav,
  MobileTopBar,
  UploadFab,
} from "@/components/layout/mobile-nav";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Me } from "@/lib/api";

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar me={me} />
      {/* Below md the sidebar is replaced by top bar + bottom nav. The top
          bar sits outside SidebarInset (a <main>) so it is a real banner
          landmark. The bottom padding keeps the last row clear of the nav
          (68px) and the upload button above it. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar me={me} />
        <SidebarInset className="max-md:pb-[calc(68px+88px+env(safe-area-inset-bottom))]">
          {children}
        </SidebarInset>
      </div>
      <MobileBottomNav />
      <UploadFab />
    </SidebarProvider>
  );
}
