---
paths:
  - ".github/workflows/**"
  - "backend/Dockerfile"
  - "backend/pyproject.toml"
  - "backend/src/backend/core/**"
  - "frontend/.nvmrc"
  - "frontend/package.json"
  - "frontend/package-lock.json"
  - "docker-compose.yml"
  - ".env.example"
---

# CI, dependencies, environment

- `backend.yml`: ruff + alembic + pytest on `backend/` changes. `frontend.yml`: eslint + prettier + tsc + vitest on `frontend/` changes. CI doesn't use Compose and installs Tesseract via `apt`.
- CI doesn't inherit the local `.env`. A new required `Settings` field, dependency or system package must reach the workflow too — check YAML syntax and needed env vars before handing over, or it only shows up as a failed run.
- Node is pinned in `frontend/.nvmrc` (CI reads it via `node-version-file`). Keep it matching the Node that generated `package-lock.json`: a different npm major resolves optional deps differently and `npm ci` fails with "Missing X from lock file" while `npm install` works locally.
- After a backend dependency change: `docker compose up -d --build backend`.
