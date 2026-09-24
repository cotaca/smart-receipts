---
paths:
  - "backend/tests/**"
---

# Backend tests

- pytest + pytest-asyncio + `httpx.AsyncClient` against the app. Alembic migrations run once in a session fixture; every test runs in a rolled-back transaction.
- Local: database `smart_receipts_test` in the dev Postgres container. CI: a throwaway Postgres service container.
