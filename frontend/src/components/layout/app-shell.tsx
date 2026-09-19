import type { ReactNode } from "react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { Me } from "@/lib/api";

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar me={me} />
      <SidebarInset>
        {/* Sidebar defaults to offcanvas below md, so without this trigger
            mobile has no way to reach nav, theme toggle or sign-out. One
            trigger here (not per page) covers all three routes under this shell. */}
        <SidebarTrigger className="m-2 self-start md:hidden" />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
