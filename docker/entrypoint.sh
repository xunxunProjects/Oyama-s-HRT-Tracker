#!/bin/sh
set -eu

if [ -z "${JWT_SECRET:-}" ]; then
    echo "JWT_SECRET is required. Set it to a random value of at least 32 characters." >&2
    exit 1
fi

if [ "${#JWT_SECRET}" -lt 32 ]; then
    echo "JWT_SECRET must contain at least 32 characters." >&2
    exit 1
fi

persist_dir="${PERSIST_DIR:-/data}"
database_name="${D1_DATABASE_NAME:-hrt-tracker-prod}"
port="${PORT:-8787}"

mkdir -p "$persist_dir"

# This schema is intentionally idempotent. Unlike the development schema at
# the repository root, it never drops existing data when the container restarts.
./node_modules/.bin/wrangler d1 execute "$database_name" \
    --local \
    --persist-to "$persist_dir" \
    --file ./docker/schema.sql \
    --yes

set -- ./node_modules/.bin/wrangler dev \
    --ip 0.0.0.0 \
    --port "$port" \
    --persist-to "$persist_dir" \
    --var "JWT_SECRET:$JWT_SECRET"

if [ -n "${ADMIN_USERNAME:-}" ]; then
    set -- "$@" --var "ADMIN_USERNAME:$ADMIN_USERNAME"
fi

if [ -n "${ADMIN_PASSWORD:-}" ]; then
    set -- "$@" --var "ADMIN_PASSWORD:$ADMIN_PASSWORD"
fi

exec "$@"
