# SmartReceipts

Web app for digitally tracking and analyzing expenses via receipt scans.

> **Work in progress.** This is an early-stage side project, not a usable product yet. JWT auth, receipt CRUD, OCR-assisted data entry and account settings are implemented end to end, backend and frontend.

## What works today

- **Accounts** — register, login, logout, refresh. Access token in memory, refresh token in an httpOnly cookie.
- **Receipts** — upload an image, edit, delete, list. Images are served through an authenticated route, never a public file mount, and you only ever see your own.
- **Image preprocessing** — every upload is auto-rotated by its EXIF orientation, capped at 2000px on the longest edge and re-encoded to JPEG. HEIC from iPhones is accepted and converted. All metadata is stripped, so the GPS coordinates in a phone photo never reach storage.
- **OCR extraction** — pick a receipt photo and merchant, total and purchase date are filled in for you, via Tesseract. German receipts only for now. Everything stays editable; if extraction finds nothing or fails, manual entry works exactly as before. The upload dialog shows the scan next to the fields and marks each one as suggested or not detected.
- **Search, filter, sort** — find receipts by merchant, narrow them to a period, order by date or amount. All client-side over the already-loaded list.
- **Settings** — number format (`1.234,56` vs `1,234.56`) and default currency live on your account and follow you between devices. Theme (light/dark/system) stays per device. Password changes happen here too.

Not built yet: PDF e-receipts, line-item extraction, the analytics dashboard, i18n, deleting your account.

## Tech Stack

- **Frontend:** Next.js (TypeScript) + TailwindCSS + shadcn/ui
- **Backend:** FastAPI (Python 3.14, managed with [uv](https://docs.astral.sh/uv/))
- **Database:** PostgreSQL 18, SQLModel, Alembic migrations
- **Storage:** Swappable backend (local disk in dev, S3/Supabase later) behind a small `Protocol`
- **Auth:** Custom JWT (FastAPI + bcrypt), access + refresh tokens
- **Image processing:** Pillow + pillow-heif
- **OCR:** Tesseract (`deu`), possibly LLM-based extraction later
- **UI reference:** the screen designs in [`docs/ui-concept/`](docs/ui-concept/) — check there before building a screen by hand

Changing the code? [ARCHITECTURE.md](ARCHITECTURE.md) explains why it's built this way; [AGENTS.md](AGENTS.md) covers how to work in it.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [uv](https://docs.astral.sh/uv/)
- [Node.js](https://nodejs.org/en)

Tesseract does **not** need to be installed on your machine — it ships inside the backend image, and the test suite mocks it.

### Setup

```bash
# 1. Database
cp .env.example .env
docker compose up -d db

# 2. Migrations (run from the host against the mapped port)
cd backend
uv sync
uv run alembic upgrade head

# 3. Backend (builds the image on first run, includes Tesseract)
cd ..
docker compose up -d

# 4. Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

The API is available at `http://localhost:8000`, with a health check at `/health`. The frontend runs at `http://localhost:3000` and calls the API via `NEXT_PUBLIC_API_URL`.

The backend container bind-mounts `./backend`, so edits reload live — no rebuild for code changes. Uploaded images land in `./backend/storage/receipts/` on the host and survive a rebuild.

Interactive API docs (Swagger UI) are at `http://localhost:8000/docs` — use them to explore/try out endpoints, e.g. authorize with a bearer token from `/auth/register` or `/auth/login` to call protected routes like `/auth/me`.

## Development

```bash
# Backend (tests and tooling run natively, not in the container)
cd backend
uv run pytest
uv run ruff check --fix . && uv run ruff format .

# Frontend
cd frontend
npm run test
npm run lint:fix && npm run format
npm run typecheck
```

`DATABASE_URL` in `.env` points at `localhost`, so native `pytest` and `alembic` work as usual; Compose overrides only the host for the container. You can still run the backend natively with `uv run uvicorn backend.main:app --reload` instead of the container — OCR then needs Tesseract (with the `deu` language pack) installed and on your `PATH`.

Container-specific commands:

```bash
docker compose logs -f backend
docker compose exec backend tesseract --list-langs   # should list "deu"
docker compose up -d --build backend                 # after a dependency change
docker compose down
```

CI (GitHub Actions) runs on every change: lint + migrations + tests for `backend/`, lint + typecheck + tests for `frontend/`. CI does not use Compose, so it installs Tesseract via `apt` separately.

## Project Structure

```
/frontend    Next.js app (TypeScript, App Router)
  /src
    /app         /login, plus the (pages) route group — a Next.js route group, so it
                 adds no URL segment: / (receipts), /dashboard, /settings. Everything
                 in it shares one sidebar shell and one auth guard
    /components  /ui = shadcn-generated, /receipts = receipt feature, /layout = sidebar shell
    /hooks       useTheme (light/dark/system), useAuthGuard, useIsMobile
    /lib         api.ts (fetch wrapper + API calls), me-context.tsx (current user),
                 utils.ts (cn, formatAmount)
/backend     FastAPI app (uv project, src layout)
  /src/backend
    /core        settings, DB engine/session
    /models      SQLModel table models
    /routers     API endpoints
    /schemas     Non-table Pydantic schemas
    /services    storage.py (storage backend), image_processing.py, ocr.py
  /alembic     DB migrations
  /tests       pytest suite
  Dockerfile   Backend image (Python 3.14 + Tesseract), used by docker-compose.yml
/db/init     Postgres init scripts
```
