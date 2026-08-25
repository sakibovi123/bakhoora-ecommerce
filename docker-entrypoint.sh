#!/bin/sh
set -e

# Migrations run against DIRECT_DATABASE_URL (settings.migration_database_url),
# which must be the session pooler on :5432 — the transaction pooler on :6543
# cannot hold the session state DDL needs.
#
# This runs on container start, so with more than one replica two containers
# could migrate at once and race. Set RUN_MIGRATIONS=false on the extra
# replicas, or leave it at one replica while the schema is still moving.
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
    echo "==> alembic upgrade head"
    alembic upgrade head
else
    echo "==> skipping migrations (RUN_MIGRATIONS=$RUN_MIGRATIONS)"
fi

echo "==> starting uvicorn on 0.0.0.0:${PORT:-8000}"
# 0.0.0.0, not 127.0.0.1: Railway's proxy reaches the container over its own
# network, and a loopback bind is unreachable from outside the container.
# exec so uvicorn becomes PID 1 and receives SIGTERM directly on shutdown.
exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port "${PORT:-8000}" \
    --workers "${WEB_CONCURRENCY:-1}" \
    --proxy-headers \
    --forwarded-allow-ips '*'
