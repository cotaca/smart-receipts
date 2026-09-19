import { useCallback, useEffect, useSyncExternalStore } from "react";

const STORAGE_KEY = "theme";

export type ThemeMode = "light" | "dark" | "system";

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

// The mode is "system" whenever nothing is stored -- there's no separate
// "system" value written to localStorage, removing the key *is* how the
// mode returns to following the OS setting.
function getModeSnapshot(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : "system";
}

function getModeServerSnapshot(): ThemeMode {
  return "system";
}

function subscribeMode(onChange: () => void) {
  // Only cross-tab storage writes change the snapshot here -- this hook's
  // own setTheme calls notify their caller by re-rendering directly, and OS
  // preference changes are tracked by the separate media query store below.
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

// Split into its own store (instead of folding into the mode snapshot)
// because it must return a plain boolean: useSyncExternalStore compares
// snapshots with Object.is, and a getSnapshot that builds a new
// {mode, osDark} object on every call would never compare equal and would
// re-render (or loop) on every call.
function getOsDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getOsDarkServerSnapshot(): boolean {
  return false;
}

function subscribeOsDark(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useTheme() {
  const mode = useSyncExternalStore(
    subscribeMode,
    getModeSnapshot,
    getModeServerSnapshot,
  );
  const osDark = useSyncExternalStore(
    subscribeOsDark,
    getOsDarkSnapshot,
    getOsDarkServerSnapshot,
  );
  const dark = mode === "dark" || (mode === "system" && osDark);

  // Keeps the DOM class in sync with the resolved mode -- covers the
  // initial mount plus every later change (mode switch, OS preference
  // change while in "system", or a storage event from another tab).
  useEffect(() => {
    applyTheme(dark);
  }, [dark]);

  const setTheme = useCallback((next: ThemeMode) => {
    if (next === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, next);
    }
    // localStorage writes don't fire "storage" in the same tab that made
    // them, so useSyncExternalStore would miss this -- dispatch it manually.
    window.dispatchEvent(new Event("storage"));
  }, []);

  // Kept for app-sidebar.tsx's existing footer toggle, which only ever
  // flips between light/dark and has no UI for a tri-state choice -- the
  // full mode picker lives in Settings > Appearance instead.
  const toggleTheme = useCallback(() => {
    setTheme(dark ? "light" : "dark");
  }, [dark, setTheme]);

  return { mode, dark, setTheme, toggleTheme };
}
