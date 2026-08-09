"use client";

import { useEffect, useState } from "react";

import { getHealth } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "loading" | "ok" | "error";

const LABEL: Record<Status, string> = {
  loading: "Checking API…",
  ok: "API connected",
  error: "API unreachable",
};

const DOT_COLOR: Record<Status, string> = {
  loading: "bg-zinc-400",
  ok: "bg-green-500",
  error: "bg-red-500",
};

export function ApiStatus() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then(() => {
        if (!cancelled) setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <span className={cn("h-2 w-2 rounded-full", DOT_COLOR[status])} />
      {LABEL[status]}
    </div>
  );
}
