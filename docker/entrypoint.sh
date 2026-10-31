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

# Optional hrt:// transport and F2F escrow provisioning. Both use the same
# service token; the worker also needs AES-GCM keys for pairing IPs and for
# escrow private keys. Generate and persist them on the volume when the
# operator did not supply one.
hrt_service_token=""
hrt_ip_key=""
hrt_escrow_key=""
if [ "${HRT_RAW_ENABLED:-0}" = "1" ] || [ "${HRT_F2F_ESCROW:-0}" = "1" ]; then
    if [ -z "${HRT_SERVICE_TOKEN_FILE:-}" ] || [ ! -f "${HRT_SERVICE_TOKEN_FILE}" ]; then
        echo "HRT_SERVICE_TOKEN_FILE is required when HRT_RAW_ENABLED=1 or HRT_F2F_ESCROW=1" >&2
        exit 1
    fi
    token_perms=$(stat -c '%a' "$HRT_SERVICE_TOKEN_FILE" 2>/dev/null || true)
    if [ "$token_perms" != "600" ]; then
        echo "HRT_SERVICE_TOKEN_FILE must be mode 0600" >&2
        exit 1
    fi
    hrt_service_token=$(tr -d '\n\r' < "$HRT_SERVICE_TOKEN_FILE")
    if [ "${#hrt_service_token}" -lt 16 ]; then
        echo "the hrt service token must contain at least 16 characters" >&2
        exit 1
    fi
fi

if [ "${HRT_RAW_ENABLED:-0}" = "1" ]; then
    if [ -n "${HRT_IP_KEY:-}" ]; then
        hrt_ip_key="$HRT_IP_KEY"
    else
        hrt_ip_key_file="${HRT_IP_KEY_FILE:-$persist_dir/hrt/ip-key}"
        mkdir -p "$(dirname "$hrt_ip_key_file")"
        if [ ! -f "$hrt_ip_key_file" ]; then
            node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" \
                > "$hrt_ip_key_file"
            chmod 600 "$hrt_ip_key_file"
        fi
        hrt_ip_key=$(tr -d '\n\r' < "$hrt_ip_key_file")
    fi
    if ! node -e "const b = Buffer.from(process.argv[1], 'base64'); if (b.length !== 32) process.exit(1)" "$hrt_ip_key"; then
        echo "HRT_IP_KEY must be base64 of 32 bytes" >&2
        exit 1
    fi
fi

if [ "${HRT_F2F_ESCROW:-0}" = "1" ]; then
    if [ -n "${HRT_ESCROW_KEY:-}" ]; then
        hrt_escrow_key="$HRT_ESCROW_KEY"
    else
        hrt_escrow_key_file="${HRT_ESCROW_KEY_FILE:-$persist_dir/hrt/escrow-key}"
        mkdir -p "$(dirname "$hrt_escrow_key_file")"
        if [ ! -f "$hrt_escrow_key_file" ]; then
            node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" \
                > "$hrt_escrow_key_file"
            chmod 600 "$hrt_escrow_key_file"
        fi
        hrt_escrow_key=$(tr -d '\n\r' < "$hrt_escrow_key_file")
    fi
    if ! node -e "const b = Buffer.from(process.argv[1], 'base64'); if (b.length !== 32) process.exit(1)" "$hrt_escrow_key"; then
        echo "HRT_ESCROW_KEY must be base64 of 32 bytes" >&2
        exit 1
    fi
fi

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
    # Rate-limit IP source. Default to 'none': a client can set
    # CF-Connecting-IP or X-Forwarded-For itself, so a self-hosted container
    # must opt in only when a trusted edge/proxy overwrites the header.
    # 'cf' is correct only behind Cloudflare; 'x-forwarded-for' only behind
    # exactly one trusted reverse proxy that appends the address.
    dotenv_line TRUSTED_IP_SOURCE "${TRUSTED_IP_SOURCE:-none}"
    # Optional public address, for example https://hrt.example.com. Share links
    # point here, and passkeys accept it when the proxy in front does not pass
    # the browser's Host header through.
    if [ -n "${PUBLIC_APP_ORIGIN:-}" ]; then
        dotenv_line PUBLIC_APP_ORIGIN "$PUBLIC_APP_ORIGIN"
    fi
    if [ "${HRT_RAW_ENABLED:-0}" = "1" ]; then
        dotenv_line HRT_RAW_ENABLED "1"
        dotenv_line HRT_IP_KEY "$hrt_ip_key"
    fi
    if [ "${HRT_F2F_ESCROW:-0}" = "1" ]; then
        dotenv_line HRT_F2F_ESCROW "1"
        dotenv_line HRT_ESCROW_KEY "$hrt_escrow_key"
    fi
    if [ -n "$hrt_service_token" ]; then
        dotenv_line HRT_SERVICE_TOKEN "$hrt_service_token"
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

# `wrangler dev` also serves an unauthenticated Local Explorer API for D1/R2
# on the same listener. This image is a production runtime, so disable that
# API (and the local observability API) before starting the worker.
export X_LOCAL_EXPLORER=false
export X_LOCAL_OBSERVABILITY=false

set -- ./node_modules/.bin/wrangler dev \
    --ip "$bind_host" \
    --port "$port" \
    --persist-to "$persist_dir"

# Optional hrt/1 raw transport. It is a separate process and is off by
# default; the web app keeps owning accounts, pairing data, and holds.
if [ "${HRT_RAW_ENABLED:-0}" = "1" ]; then
    node ./hrt-server/server.mjs &
    raw_pid=$!
    sleep 0.2
    if ! kill -0 "$raw_pid" 2>/dev/null; then
        echo "hrt-raw-server failed to start" >&2
        exit 1
    fi

    "$@" &
    web_pid=$!
    trap 'kill "$raw_pid" "$web_pid" 2>/dev/null || true' TERM INT
    while kill -0 "$raw_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
        sleep 1
    done
    kill "$raw_pid" "$web_pid" 2>/dev/null || true
    wait "$raw_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
    exit 1
fi

exec "$@"
