# SmartReceipts

Web app for digitally tracking and analyzing expenses via receipt scans.

> **Work in progress.** This is an early-stage side project, not a usable product yet. Backend foundation and JWT auth are in place; receipt upload/OCR and the frontend are not yet built.

## Tech Stack

- **Frontend:** Next.js (TypeScript) + TailwindCSS + shadcn/ui
- **Backend:** FastAPI (Python 3.14, managed with [uv](https://docs.astral.sh/uv/))
- **Database:** PostgreSQL 18, SQLModel, Alembic migrations
- **Auth:** Custom JWT (FastAPI + bcrypt), access + refresh tokens
- **OCR:** Tesseract initially, possibly LLM-based extraction later

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/)
- [uv](https://docs.astral.sh/uv/)
- Node.js (for the frontend, once scaffolded)

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
```

The API will be available at `http://localhost:8000`, with a health check at `/health`.

Interactive API docs (Swagger UI) are at `http://localhost:8000/docs` — use them to explore/try out endpoints, e.g. authorize with a bearer token from `/auth/register` or `/auth/login` to call protected routes like `/auth/me`.

## Development

```bash
# Run tests
uv run pytest

# Lint & format
uv run ruff check --fix .
uv run ruff format .
```

CI (GitHub Actions) runs lint, migrations, and tests on every change under `backend/`.

## Project Structure

```
/frontend    Next.js app (TypeScript, App Router)
/backend     FastAPI app (uv project, src layout)
  /src/backend
    /core        settings, DB engine/session
    /models      SQLModel table models
    /routers     API endpoints
    /schemas     Non-table Pydantic schemas
    /services    Business logic (OCR parsing, image preprocessing)
  /alembic     DB migrations
  /tests       pytest suite
/db/init     Postgres init scripts
```