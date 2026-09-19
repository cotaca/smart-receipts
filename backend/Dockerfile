FROM python:3.14-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-deu \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Must be set before `uv sync`: the dev bind-mount (./backend:/app) would
# otherwise shadow a .venv installed under /app, hiding the image's own
# environment the moment the container starts.
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Separate layer for deps so an app-code-only change doesn't reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project

COPY . .
RUN uv sync --locked

# No `uv run` -- /opt/venv/bin is already on PATH, and `uv run` would try to
# re-sync against the bind-mounted /app on every start.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--reload"]
