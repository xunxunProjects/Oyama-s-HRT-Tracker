#!/usr/bin/env bash
# Start the Worker against a throwaway local D1/R2 store.
#
# The suite never touches a real Cloudflare database: `--local` runs Miniflare,
# `--persist-to` keeps everything under .e2e/, and JWT_SECRET is random for
# every run. The browser only needs the API; Vite serves the app in front of it.
set -euo pipefail

# Keep the D1/R2 files outside the Vite root: Vite watches the project
# directory, and a D1 write on every authenticated request would otherwise
# full-reload the page under the test.
PERSIST="${E2E_PERSIST_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/oyama-hrt-e2e.XXXXXX")}"
trap 'rm -rf "$PERSIST"' EXIT

seconds="$(date +%s)"
secret="${E2E_JWT_SECRET:-${seconds}$(openssl rand -hex 32)}"

npx wrangler d1 migrations apply hrt-tracker-prod --local --persist-to "$PERSIST" >/dev/null
exec npx wrangler dev --local --port 8787 --persist-to "$PERSIST" --var "JWT_SECRET:$secret"
