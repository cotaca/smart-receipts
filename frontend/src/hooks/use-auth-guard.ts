"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getMe, refresh, setAccessToken, type Me } from "@/lib/api";

// Silent-refresh check shared by every route under (pages) — called once from
// the route group's layout instead of per-page, so a failed refresh redirects
// exactly once instead of racing across every protected page.
export function useAuthGuard() {
  const router = useRouter();
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

  return { checking, me };
}
