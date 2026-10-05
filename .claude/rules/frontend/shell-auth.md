---
paths:
  - "frontend/src/app/?pages?/layout.tsx"
  - "frontend/src/app/login/**"
  - "frontend/src/components/layout/**"
  - "frontend/src/hooks/use-auth-guard.ts"
  - "frontend/src/lib/api.ts"
  - "frontend/src/lib/me-context.tsx"
---

# App shell, auth guard, API client

- `useAuthGuard` (silent `refresh()` via the cookie, else redirect to `/login`) runs once, in `(pages)/layout.tsx` — never per page, so routes don't race separate redirects. Client-side on purpose; move to middleware only if that becomes a real cost.
- `(pages)` is a route group: no URL segment, so `(pages)/page.tsx` serves `/`.
- `AppShell` = shadcn `Sidebar`, offcanvas below 768px. Exactly one `SidebarTrigger` with `md:hidden`, inside `SidebarInset` — without it mobile has no nav, theme toggle or sign-out. Sign-out and theme toggle live only in the sidebar footer `DropdownMenu`. The v2 design replaces this below `md` with a bottom nav — decided, not built yet (decision 5 in `docs/ui-concept/README.md`).
- No receipt-count badge in the nav (the mockup has one): lifting the count into the layout or double-fetching isn't worth it.
- `MeContext`: layouts can't pass props to pages, so `(pages)/layout.tsx` provides `me`/`setMe` from `useAuthGuard`. One context, no state library.
- `apiFetch` holds the access token in memory and omits `Content-Type` for `FormData`, so the browser sets the multipart boundary.
- **401 → refresh once → retry once** in `authedFetch` (shared by `apiFetch` and `apiFetchBlob`): the access token lives 15 min, the tab much longer. Without it every call 401s after 15 min until a reload — and `extractReceipt` swallows errors, so the OCR hints just vanished silently. Concurrent 401s share one in-flight refresh (`refreshing`). Only `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout` are exempt (wrong password, dead refresh cookie → would loop); account calls like `/auth/me` and change-password do retry — a wrong password there is a 400, never a 401. A failed refresh surfaces the original 401; no global sign-out redirect yet. Tested in `lib/api.test.ts`.
- Data: `useState` + refetch after each mutation, no TanStack Query — not enough concurrent fetching to justify it yet.
