"use client";

import { THEME_STORAGE_KEY, useTheme } from "@/hooks/use-theme";

// Inlined into <head> by the root layout: sets the class before the first
// paint, so a reload in dark mode doesn't flash light until hydration. Same
// resolution as useTheme(): stored "dark"/"light", otherwise the OS setting.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}`;

// Always mounted in the root layout, so the class follows every change (a
// toggle, another tab, the OS setting in "system" mode) on every page --
// not only while some component that happens to call useTheme() is mounted.
export function ThemeSync() {
  useTheme();
  return null;
}
