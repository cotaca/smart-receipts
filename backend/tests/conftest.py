import os
import subprocess
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlmodel import Session, create_engine

from backend.core.config import settings
from backend.core.db import get_session
from backend.main import app

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _run_alembic(*args: str) -> None:
    env = {**os.environ, "DATABASE_URL": settings.test_database_url}
    subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        check=True,
        cwd=BACKEND_DIR,
        env=env,
    )


@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    _run_alembic("upgrade", "head")
    yield
    _run_alembic("downgrade", "base")


@pytest.fixture(scope="session")
def engine(apply_migrations):
    return create_engine(settings.test_database_url)


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest_asyncio.fixture
async def client(db_session):
    app.dependency_overrides[get_session] = lambda: db_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="https://test") as ac:
        yield ac
    app.dependency_overrides.clear()
