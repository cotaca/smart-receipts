---
paths:
  - "backend/src/backend/routers/dashboard.py"
  - "backend/src/backend/schemas/dashboard.py"
  - "backend/tests/test_dashboard.py"
  - "frontend/src/app/(pages)/dashboard/**"
  - "frontend/src/components/dashboard/**"
---

# Dashboard

`GET /dashboard?today=YYYY-MM-DD&period=last-12-months|this-year|last-year` returns everything the page shows in one response (`DashboardPublic`, plain Pydantic -- no shape maps to a table). All aggregation is SQL, always filtered by `user_id`.

- **Currency**: only receipts in `user.default_currency` are summed; summing across currencies is meaningless and there is no FX. `excluded_count` (all other-currency receipts, account-wide, regardless of period) feeds the hint on the page. `recent` is the exception: the 4 newest receipts in any currency, so the list matches the receipts page.
- **"Today" comes from the client** (`today` is required, its local date). The server has no clock in the logic, so tests need no clock mocking, and "this month" is the user's month, not the server's timezone's.
- **Period** filters the chart, top merchants and top products only. The KPI tiles are always this month vs last month. `last-12-months` = the 1st of the month 11 months back through the end of today's month; `this-year` = Jan 1 through the end of today's month; `last-year` = Jan 1 - Dec 31 of the previous year. `monthly` is zero-filled for every month of the range.
- **Grouping keys**: merchants by `lower(trim(merchant))`, products by `lower(trim(description))`; the displayed name is `min()` of the raw values. Busiest merchant: most receipts this month, ties to the higher total.
- **Products count line items, not quantity**: quantity mixes kg and pieces, so "42x" means the product appeared on 42 receipt lines. Ranked by count, then total.
- **Quarterly tab** (`toQuarters`) sums months into calendar quarters; the first and last quarter of a 12-month range may be partial. Accepted.
- `today` is captured once when the page mounts: a tab left open across midnight shows a stale "this month" until reload. Accepted.
- The change vs last month is hidden when last month is <= 0 (amounts can be negative, a percentage would mislead).
- The chart has `role="img"` plus a label and an sr-only list of period and amount; the merchant `Progress` bars are `aria-hidden` (count and amount sit beside them as text).
- Month labels use `number_format`, not the UI language (see settings-i18n). The mobile bottom nav is built app-wide (`.claude/rules/frontend/shell-auth.md`). The empty state's "Upload receipt" links `/?upload=1`, which opens the list's upload dialog directly.
- jsdom has no layout, so the Recharts bars are not asserted; bar colours and responsiveness are manual checks.
