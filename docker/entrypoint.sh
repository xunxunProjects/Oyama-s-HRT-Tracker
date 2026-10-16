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
# demand, so wrangler's migration ledger is empty although the effects are
# there, all but one column; docker/reconcile.mjs adds that column and records
# them as applied, and only then are the migrations that are genuinely missing
# run. Both steps are idempotent.
node ./docker/reconcile.mjs "$database_name" \
    --local \
    --persist-to "$persist_dir"
./node_modules/.bin/wrangler d1 migrations apply "$database_name" \
    --local \
    --persist-to "$persist_dir"

# Secrets go into a 0600 .dev.vars (wrangler's own dev-vars file) instead of
# --var arguments: a command line is readable through /proc, so the values
# used to show up in `ps` for anything else running in this container. The
# file is written fresh on every start and trimmed of line breaks; values are
# double-quoted with backslashes and quotes escaped for dotenv. Plain
# environment variables are not bindings for the worker, so every setting the
# worker reads from Env (TRUSTED_IP_SOURCE, for instance) has to be forwarded
# into this file explicitly.
escape_dotenv() {
    printf '%s' "$1" | tr -d '\n\r' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

vars_file="./.dev.vars"
umask 077
{
    printf 'JWT_SECRET="%s"\n' "$(escape_dotenv "$JWT_SECRET")"
    if [ -n "${ADMIN_USERNAME:-}" ]; then
        printf 'ADMIN_USERNAME="%s"\n' "$(escape_dotenv "$ADMIN_USERNAME")"
    fi
    if [ -n "${ADMIN_PASSWORD:-}" ]; then
        printf 'ADMIN_PASSWORD="%s"\n' "$(escape_dotenv "$ADMIN_PASSWORD")"
    fi
    # Optional rate-limit IP source: 'cf' (default), 'x-forwarded-for' behind
    # exactly one trusted proxy, or 'none' on a mirror without client IPs.
    if [ -n "${TRUSTED_IP_SOURCE:-}" ]; then
        printf 'TRUSTED_IP_SOURCE="%s"\n' "$(escape_dotenv "$TRUSTED_IP_SOURCE")"
    fi
} > "$vars_file"
chmod 600 "$vars_file"

# Listen on the container's interfaces by default. Docker's port forwarding
# delivers published traffic to the container network interface, not to the
# container's own loopback, so binding 127.0.0.1 here would leave the service
# unreachable through `ports:`/`-p` no matter what the host side publishes.
# Exposure is controlled on the host side instead: compose.yaml and the
# documented docker run command publish on 127.0.0.1 only, and nothing is
# reachable from the LAN or the internet until that is changed deliberately.
# Set BIND_HOST=127.0.0.1 when this process shares a network namespace with
# the proxy in front of it (for example with --network host).
bind_host="${BIND_HOST:-0.0.0.0}"

set -- ./node_modules/.bin/wrangler dev \
    --ip "$bind_host" \
    --port "$port" \
    --persist-to "$persist_dir"

exec "$@"
