"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useAuthGuard } from "@/hooks/use-auth-guard";

// Route group — pathneutral, so "/" and "/dashboard" etc. stay at their
// top-level paths. Runs the silent-refresh auth check once for every
// protected route and wraps them all in the sidebar shell.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { checking, me } = useAuthGuard();

  if (checking || !me) {
    return <div className="min-h-screen w-full bg-background" />;
  }

  return <AppShell me={me}>{children}</AppShell>;
}
