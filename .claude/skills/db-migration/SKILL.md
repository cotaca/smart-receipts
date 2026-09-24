---
name: db-migration
description: Alembic migration workflow for SmartReceipts. Use whenever a SQLModel table model in backend/src/backend/models/ changes or a table is added — before writing the migration.
---

# DB migration

Run from `backend/` against the dev database (`docker compose up -d db`).

1. Change the SQLModel model. A new non-null column on an existing table needs a `server_default` or a backfill in the migration, or the upgrade fails on existing rows.
2. `uv run alembic revision --autogenerate -m "<imperative summary>"`
3. **Read the generated file and fix it by hand.** Autogenerate gets these wrong or misses them: renames (emitted as drop + add → data loss; use `op.alter_column`/`op.rename_table`), server defaults, some type changes, enum value changes, and `sqlmodel.sql.sqltypes.AutoString` (the file needs `import sqlmodel` unless the template adds it). Never edit a migration that already exists outside your working tree — add a new one.
4. `uv run alembic upgrade head` → `uv run alembic downgrade -1` → `uv run alembic upgrade head`. The downgrade must work.
5. `uv run pytest` — the session fixture applies all migrations to the test DB.
6. If the model change adds a required setting or system package, the CI rule applies.
7. Update the rule that documents the table if a field's meaning or a decision changed.
