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

# Length alone accepts a 64-character run of one character. The worker applies
# the same alphabet floor; check it here so the container fails at start rather
# than on the first API request.
distinct=$(printf '%s' "$JWT_SECRET" | fold -w 1 | sort -u | wc -l | tr -d ' ')
if [ "$distinct" -lt 8 ]; then
    echo "JWT_SECRET must use at least 8 distinct characters. Generate one with: openssl rand -base64 48" >&2
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
# file is written fresh on every start and trimmed of line breaks. Plain
# environment variables are not bindings for the worker, so every setting the
# worker reads from Env (TRUSTED_IP_SOURCE, for instance) has to be forwarded
# into this file explicitly.
#
# wrangler parses the file with dotenv 16, which strips the quotes around a
# value and undoes no escapes, so backslash-escaping would change secrets
# that contain a backslash or a quote. Single quotes keep a value exactly as
# it is; a value with a single quote in it goes in backticks instead, and one
# with both cannot be written faithfully at all.
dotenv_line() {
    value=$(printf '%s' "$2" | tr -d '\n\r')
    case $value in
        *\'*)
            case $value in
                *\`*)
                    echo "$1 contains both ' and \`, which .dev.vars cannot hold. Choose another value." >&2
                    exit 1
                    ;;
            esac
            printf '%s=`%s`\n' "$1" "$value"
            ;;
        *)
            printf "%s='%s'\n" "$1" "$value"
            ;;
    esac
}

vars_file="./.dev.vars"
umask 077
{
    dotenv_line JWT_SECRET "$JWT_SECRET"
    if [ -n "${ADMIN_USERNAME:-}" ]; then
        dotenv_line ADMIN_USERNAME "$ADMIN_USERNAME"
    fi
    if [ -n "${ADMIN_PASSWORD:-}" ]; then
        dotenv_line ADMIN_PASSWORD "$ADMIN_PASSWORD"
    fi
    # Optional rate-limit IP source: 'cf' (default; the proxy in front must
    # overwrite CF-Connecting-IP), 'x-forwarded-for' behind exactly one proxy
    # you control, or 'none' on a mirror without client IPs.
    if [ -n "${TRUSTED_IP_SOURCE:-}" ]; then
        dotenv_line TRUSTED_IP_SOURCE "$TRUSTED_IP_SOURCE"
    fi
    # Optional public address, for example https://hrt.example.com. Share links
    # point here, and passkeys accept it when the proxy in front does not pass
    # the browser's Host header through.
    if [ -n "${PUBLIC_APP_ORIGIN:-}" ]; then
        dotenv_line PUBLIC_APP_ORIGIN "$PUBLIC_APP_ORIGIN"
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
