---
paths:
  - "backend/src/backend/routers/auth.py"
  - "backend/src/backend/models/user.py"
  - "backend/src/backend/schemas/auth.py"
  - "backend/tests/**/*auth*"
---

# Auth (backend)

Custom JWT via FastAPI; no auth service, no OAuth for the MVP.

- bcrypt directly, no `passlib` (incompatible with bcrypt>=4.1). bcrypt silently truncates at 72 bytes, so `NewPassword` (`schemas/auth.py`) rejects longer passwords with 422 wherever a password is *set* (register, change-password). Deliberately not on login or `current_password`: older accounts may hold a longer password and must still get in. No minimum length yet; the v2 register design proposes 8 (open question 4 in `docs/ui-concept/README.md`).
- JWT (`pyjwt`) carries `sub`, `exp`, `type`; `type` (`access`/`refresh`) stops a refresh token being replayed as an access token.
- Access token: 15 min, in the response body, kept in memory by the frontend (never localStorage). Refresh token: 7 days, httpOnly + secure + samesite=lax cookie, never in JSON.
- Stateless: no refresh-token table. Logout only clears the cookie, and change-password invalidates nothing — a stolen token lives until expiry. Don't write a test asserting this "works". The endpoint docstring states it too; revisit both together if a `refresh_tokens` table (rotate-on-use) is ever built.
- Wrong current password on change-password → **400, not 401**: the request is authenticated, and a 401 would make a future global "401 → sign out" interceptor log users out on a typo.
- `number_format`, `default_currency`, `language` are columns on `users`, written only via `PATCH /auth/me`. The `Literal`s in `UserSettingsUpdate` are the trust boundary; no DB `CHECK` because that is the only write path. `number_format` stores the locale string (`de-DE`/`en-US`) so the frontend passes it straight to `Intl`.
- `UserPublic` never includes `hashed_password`.
- `DELETE /auth/me` (password re-entry, wrong password → 400 like change-password) hard-deletes the account: receipts are deleted explicitly (`receipts.user_id` has no `ondelete`, unlike `receipt_items.receipt_id`) then the user, then commit — only after that do image files get best-effort `storage.delete()` per key, logged via `logging.exception` on failure and never aborting. An orphaned file beats a live account with broken images.
- CORS: `FRONTEND_ORIGIN` is required (no dev default), `allow_credentials=True` — the refresh cookie must cross the 3000/8000 origin split.
