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
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Uploaded product images land here. On Railway this path is ephemeral unless a
# volume is mounted on it — see the deployment notes.
RUN mkdir -p /app/media

# Railway injects PORT; 8000 is only the local default.
ENV PORT=8000
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
