---
paths:
  - "frontend/src/app/?pages?/settings/**"
  - "frontend/src/hooks/use-theme.ts"
  - "frontend/src/lib/locale.ts"
  - "frontend/src/lib/utils.ts"
  - "frontend/src/i18n/**"
  - "frontend/messages/**"
---

# Settings, theme, number format, i18n

`number_format`, `default_currency`, `language` are account settings; theme is per device. Out of scope: sign-out on this page (it lives in the sidebar).

- **Saved immediately, no Save button, no optimistic update**: controls are bound to `me.*` and only move when `setMe` receives the server response. A failed `PATCH` shows an `Alert` and keeps the old value; its test asserts `setMe` was *not* called.
- **Theme** (`useTheme`) is tri-state. `system` = no `theme` key in localStorage (remove it, don't write a sentinel). Two separate `useSyncExternalStore`s (stored mode; `matchMedia` dark) — a combined object snapshot is never `Object.is`-equal and re-renders forever. Same-tab writes dispatch a manual `storage` event. `toggleTheme`/`dark` stay on the return value for the sidebar toggle. The `dark` class is applied by `components/theme-sync.tsx`, not by whichever component happens to call `useTheme()`: `THEME_INIT_SCRIPT` in the root layout's `<head>` sets it before the first paint (no light flash on reload; hence `suppressHydrationWarning` on `<html>`), and the always-mounted `ThemeSync` keeps it in sync on every page. Relying on callers broke once — the account menu items, the last always-mounted caller, only render while the menu is open.
- **Amounts and dates follow `number_format`, never the UI `language`** — independent settings. `formatAmount` wraps `Intl.NumberFormat(numberFormat)` with 2 decimals. Never use next-intl's number formatting; it keys off `language`.
- **i18n**: `next-intl` without locale routing (no URL prefix, no middleware); the locale comes from a `locale` cookie in `src/i18n/request.ts`. Catalogs `messages/{de,en}.json`, statically imported there (the comment says why), one namespace per page/component; no `Common` namespace until a string repeats at 3+ sites.
- **Locale cookie sync** (`syncLocaleCookie`): if the account `language` differs from the cookie, write it and **read it back**; only a confirmed write triggers `router.refresh()`. Without the read-back, blocked cookies cause an endless refresh loop. `router.refresh()`, not `location.reload()` — a reload drops the in-memory access token. The cookie survives logout on purpose (it sets the login page language).
- Password change: a `Dialog`; a 400 (wrong current password) is shown inline, never a logout.
- Delete account: an `AlertDialog` (destructive, `role="alertdialog"`), password re-entry, form only mounted while open. Success clears the access token and `router.replace("/login")`, same as sign-out in the sidebar. A 400 (wrong password) is shown inline.
