# SmartReceipts

Web app for digitally tracking and analyzing expenses via receipt scans.

> **Work in progress.** This is an early-stage side project, not a usable product yet. JWT auth and full receipt CRUD (upload, edit, delete — manual data entry, no OCR yet) are implemented end to end, backend and frontend.

## Tech Stack

- **Frontend:** Next.js (TypeScript) + TailwindCSS + shadcn/ui
- **Backend:** FastAPI (Python 3.14, managed with [uv](https://docs.astral.sh/uv/))
- **Database:** PostgreSQL 18, SQLModel, Alembic migrations
- **Storage:** Swappable backend (local disk in dev, S3/Supabase later) behind a small `Protocol`
- **Auth:** Custom JWT (FastAPI + bcrypt), access + refresh tokens
- **OCR:** Tesseract initially, possibly LLM-based extraction later

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [uv](https://docs.astral.sh/uv/)
- [Node.js](https://nodejs.org/en)

### Setup

```bash
# 1. Start the local database
cp .env.example .env
docker compose up -d db

# 2. Backend
cd backend
uv sync
uv run alembic upgrade head
uv run uvicorn backend.main:app --reload

# 3. Frontend (separate terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

The API will be available at `http://localhost:8000`, with a health check at `/health`. The frontend runs at `http://localhost:3000` and calls the API via `NEXT_PUBLIC_API_URL`.

Interactive API docs (Swagger UI) are at `http://localhost:8000/docs` — use them to explore/try out endpoints, e.g. authorize with a bearer token from `/auth/register` or `/auth/login` to call protected routes like `/auth/me`.

## Development

```bash
# Backend
uv run pytest
uv run ruff check --fix . && uv run ruff format .

# Frontend
npm run test
npm run lint:fix && npm run format
npm run typecheck
```

CI (GitHub Actions) runs on every change: lint + migrations + tests for `backend/`, lint + typecheck + tests for `frontend/`.

## Project Structure

```
/frontend    Next.js app (TypeScript, App Router)
  /src
    /app         Routes: / (receipts CRUD), /login (login + register)
    /components  React components (/ui = shadcn-generated, /receipts = receipt feature components)
    /hooks       useTheme (dark mode)
    /lib         api.ts (fetch wrapper + auth/receipt calls), utils.ts (cn helper)
/backend     FastAPI app (uv project, src layout)
  /src/backend
    /core        settings, DB engine/session
    /models      SQLModel table models
    /routers     API endpoints
    /schemas     Non-table Pydantic schemas
    /services    Business logic (storage backend, OCR parsing, image preprocessing)
  /alembic     DB migrations
  /tests       pytest suite
/db/init     Postgres init scripts
```
