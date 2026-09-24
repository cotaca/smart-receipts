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
- `AppShell` = shadcn `Sidebar`, offcanvas below 768px. Exactly one `SidebarTrigger` with `md:hidden`, inside `SidebarInset` — without it mobile has no nav, theme toggle or sign-out. Sign-out and theme toggle live only in the sidebar footer `DropdownMenu`.
- No receipt-count badge in the nav (the mockup has one): lifting the count into the layout or double-fetching isn't worth it.
- `MeContext`: layouts can't pass props to pages, so `(pages)/layout.tsx` provides `me`/`setMe` from `useAuthGuard`. One context, no state library.
- `apiFetch` holds the access token in memory and omits `Content-Type` for `FormData`, so the browser sets the multipart boundary.
- Data: `useState` + refetch after each mutation, no TanStack Query — not enough concurrent fetching to justify it yet.
