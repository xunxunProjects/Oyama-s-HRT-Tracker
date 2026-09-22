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

# The schema comes from migrations/ and nowhere else. A volume created by an
# older image got its tables from docker/schema.sql plus DDL the worker ran on
# demand, so wrangler's migration ledger is empty although the effects are all
# there; the first statement file records those as applied, and only then are
# the migrations that are genuinely missing run. Both steps are idempotent.
./node_modules/.bin/wrangler d1 execute "$database_name" \
    --local \
    --persist-to "$persist_dir" \
    --file ./docker/mark-applied-migrations.sql \
    --yes
./node_modules/.bin/wrangler d1 migrations apply "$database_name" \
    --local \
    --persist-to "$persist_dir"

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
