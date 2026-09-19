"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { Me } from "@/lib/api";

// Next.js layouts can't pass props to the pages they wrap, so (pages)/page.tsx
// has no way to receive the `me` that (pages)/layout.tsx's useAuthGuard already
// fetched -- a context bridges that gap without a state-management package.
// setMe is carried alongside it so the settings page can push a confirmed
// PATCH /auth/me response back into the shared value (e.g. so a new default
// currency is picked up by the receipt form without a refetch).
type MeContextValue = { me: Me; setMe: (me: Me) => void };

const MeContext = createContext<MeContextValue | null>(null);

export function MeProvider({
  me,
  setMe,
  children,
}: MeContextValue & { children: ReactNode }) {
  return (
    <MeContext.Provider value={{ me, setMe }}>{children}</MeContext.Provider>
  );
}

export function useMe(): MeContextValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error("useMe must be used within a MeProvider");
  return ctx;
}
