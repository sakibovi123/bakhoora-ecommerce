# Railway will use this file in preference to auto-detection, which is the
# point: Nixpacks has to guess how a project installs, and this one uses uv with
# a lockfile. Building from the lock means the image gets the exact versions
# that were tested, not whatever resolved on the day of the deploy.

FROM python:3.12-slim AS base

# uv ships as a static binary; copying it from the official image avoids a pip
# bootstrap and pins the version alongside everything else.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /bin/uv

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Dependencies first, in their own layer: application code changes on every
# push, the lockfile rarely does, so this layer survives most rebuilds.
# pyproject.toml declares no [build-system], so uv installs the dependencies
# without trying to build the project itself as a package.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Uploaded product images land here. On Railway this path is ephemeral unless a
# volume is mounted on it — see the deployment notes.
RUN mkdir -p /app/media

# Railway injects PORT; 8000 is only the local default.
ENV PORT=8000
EXPOSE 8000

# Startup lives here rather than in a separate script that COPY has to find.
#
# Migrations run against DIRECT_DATABASE_URL (settings.migration_database_url),
# which must be the session pooler on :5432 — the transaction pooler on :6543
# cannot hold the session state DDL needs.
#
# They run on every container start, so with more than one replica two
# containers could migrate at once and race. Set RUN_MIGRATIONS=false on the
# extra replicas, or stay at one replica while the schema is still moving.
#
# 0.0.0.0, not 127.0.0.1: Railway's proxy reaches the container over its own
# network, and a loopback bind is unreachable from outside it. exec hands
# uvicorn PID 1 so it receives SIGTERM directly on shutdown.
ENTRYPOINT ["/bin/sh", "-c", "\
set -e; \
if [ \"${RUN_MIGRATIONS:-true}\" = \"true\" ]; then \
    echo '==> alembic upgrade head'; \
    alembic upgrade head; \
else \
    echo \"==> skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)\"; \
fi; \
echo \"==> starting uvicorn on 0.0.0.0:${PORT:-8000}\"; \
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT:-8000} \
    --workers ${WEB_CONCURRENCY:-1} \
    --proxy-headers \
    --forwarded-allow-ips '*' \
"]
