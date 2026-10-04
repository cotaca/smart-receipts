---
paths:
  - "frontend/**/*.test.ts"
  - "frontend/**/*.test.tsx"
  - "frontend/vitest.config.*"
---

# Frontend tests

- Vitest + React Testing Library on jsdom, with `@vitejs/plugin-react-swc` (`@vitejs/plugin-react` conflicts with shadcn's Babel peer deps). Playwright e2e for upload → extract → save is planned, not set up yet.
- `useMe()` throws outside `MeProvider`: render with a fixed `Me` and `setMe: vi.fn()`.
- `(pages)/page.test.tsx`: mock `extractReceipt` in every create-flow test and wait for the scan phase to settle (call made, Merchant field back) before touching fields — they're Skeletons meanwhile.
- Recharts' `ResponsiveContainer` needs a `ResizeObserver`, which jsdom lacks: stub it (`vi.stubGlobal`) in any test that renders a chart, and `vi.unstubAllGlobals()` afterwards. Bars themselves are never asserted (no layout).
- `app-sidebar.test.tsx`: mock `usePathname`, render inside `SidebarProvider`. Don't test shadcn's own collapse behavior.
- `use-auth-guard.test.ts` covers the redirect once, against the hook (`renderHook`) — not per page.
- `receipt-image.test.tsx`: two mounts on one id both switch URL after a refresh, and the old URL is revoked exactly once.
