# Deploy with Docker

> **Production: pin the `v1.5.0` release tag.** Do not deploy `main`; build the
> image from a release checkout.

The container runs the complete app: the Worker API under Wrangler's local
workerd runtime, a local D1 database, R2-compatible avatar storage, and
optionally the `hrt://` raw server and F2F escrow. Data is kept in `./data` and
survives restarts. It does not connect to the Cloudflare production database or
bucket.

## Quick start

You need Git, Docker, and Docker Compose v2.

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
cp .env.docker.example .env
# Put the output of this command into JWT_SECRET in .env:
openssl rand -base64 48
mkdir -p ./data
sudo chown 1000:1000 ./data
docker compose up -d --build
```

Open <http://localhost:8787>. The first build takes a few minutes. The port is
published on `127.0.0.1` only.

To stop without deleting data, run `docker compose down`.

## Settings

The entrypoint turns `.env` into a private `.dev.vars` file (mode 600) for the
Worker. Secrets are not passed as command-line arguments. A value containing
both a single quote and a backtick makes the container exit, because the file
format cannot represent it.

### Core

| Setting                            | Required | Meaning                                                                                                                                                                                                                                                                               |
| ---------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                       | Yes      | Signs sign-in tokens. At least 32 characters, at least 8 distinct characters, and none of the words `secret`, `fallback-secret`, `fallback_secret`, `test-secret`, `dev-secret`, `default`, `password`, `123456`, or `changeme` in any case. Generate with `openssl rand -base64 48`. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | No       | Built-in administrator. Set both or neither. The username is compared case-insensitively and is reserved even if the password is empty.                                                                                                                                               |
| `PUBLIC_APP_ORIGIN`                | No       | Public origin for share links and passkey sign-in, for example `https://hrt.example.com`.                                                                                                                                                                                             |
| `TRUSTED_IP_SOURCE`                | No       | `cf` (default), `x-forwarded-for`, or `none`. Controls where per-address rate limits read the client address.                                                                                                                                                                         |
| `ENVIRONMENT`                      | No       | Only `development` makes a 500 response include the error text. The container leaves it unset, so it behaves as production.                                                                                                                                                           |

Changing `JWT_SECRET` invalidates every existing session; there is no
previous-secret fallback.

### Optional: `hrt://` and F2F

| Setting                                 | Default                 | Meaning                                                                                                                                                                     |
| --------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HRT_RAW_ENABLED`                       | off                     | `1` starts the raw TLS server and enables `hrt://` pairing in the web app. Requires a service token and certificate/key. Cloudflare deployments cannot use this.            |
| `HRT_SERVICE_TOKEN`                     | none                    | At least 16 characters; shared by the Worker and raw server via the `x-hrt-service` header. In Docker, use `HRT_SERVICE_TOKEN_FILE` instead.                                |
| `HRT_SERVICE_TOKEN_FILE`                | none                    | Path to the token file. Required when `HRT_RAW_ENABLED=1` or `HRT_F2F_ESCROW=1`. The entrypoint requires mode 600 exactly (mode 400 is refused) and at least 16 characters. |
| `HRT_IP_KEY`, `HRT_IP_KEY_FILE`         | generated               | Base64 of 32 bytes; encrypts addresses stored with pairing requests. Docker creates `/data/hrt/ip-key` once if neither is supplied.                                         |
| `HRT_RAW_PORT`                          | `9443`                  | Raw TLS port inside the container.                                                                                                                                          |
| `HRT_RAW_CERT`, `HRT_RAW_KEY`           | none                    | PEM certificate and key for the raw server. The key must be mode 600. Docker does not create them.                                                                          |
| `HRT_WEB_ORIGIN`                        | `http://127.0.0.1:8787` | Where the raw server reaches the web app. Set it if you change `PORT`.                                                                                                      |
| `HRT_RAW_MAX_CONNECTIONS`               | `8`                     | Concurrent raw connections.                                                                                                                                                 |
| `HRT_F2F_ESCROW`                        | off                     | `1` reserves one escrow key for each new F2F cohort from the operator's pool.                                                                                               |
| `HRT_ESCROW_KEY`, `HRT_ESCROW_KEY_FILE` | generated               | Base64 of 32 bytes; wraps stored escrow private keys. Back it up. Docker creates `/data/hrt/escrow-key` once if neither is supplied.                                        |

### Container-only

| Setting            | Default            | Meaning                                                                                                                                                              |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`             | `8787`             | Port Wrangler listens on inside the container. The health check follows it.                                                                                          |
| `PERSIST_DIR`      | `/data`            | Database, avatar store, and generated keys.                                                                                                                          |
| `D1_DATABASE_NAME` | `hrt-tracker-prod` | Database the migrations are applied to. Matches `wrangler.toml`.                                                                                                     |
| `BIND_HOST`        | `0.0.0.0`          | Address Wrangler binds inside the container. Use `127.0.0.1` only with `--network host` or a shared network namespace; otherwise the published port cannot reach it. |

## What happens at startup

1. Checks `JWT_SECRET` length and distinct characters. Exits on failure.
2. Runs `docker/reconcile.mjs`, then applies pending D1 migrations to
   `/data` with `wrangler d1 migrations apply hrt-tracker-prod --local`.
   Both are idempotent.
3. If raw or escrow features are enabled, checks the service-token file and
   loads or creates the IP/escrow keys.
4. Writes `.dev.vars` and starts `wrangler dev`.
5. With `HRT_RAW_ENABLED=1`, also starts `node ./hrt-server/server.mjs`. If
   either process exits, the container stops with status 1.

## Data, backups, and updates

All application data is under `/data`:

- the local database and avatar store;
- `hrt/ip-key` and `hrt/escrow-key` when those features are enabled.

The container runs as uid 1000, so `./data` must be writable by uid 1000:
`sudo chown 1000:1000 ./data`.

- **Back up**: stop the container first, then copy `./data`. The folder holds
  accounts and sessions even though backups and share payloads are encrypted.
- **Update**: `git pull` then `docker compose up -d --build`. Pending
  migrations run at startup and `./data` is kept.
- **Change `.env`**: `docker compose up -d --force-recreate`.
  `docker compose restart` keeps the old environment.
- **Port conflict**: change only the host side, for example
  `127.0.0.1:18787:8787`.

## Health check

The image requests `/api/transparency` on `127.0.0.1:$PORT` every 30 seconds
(5-second timeout, 20-second start period, 3 retries). The route is public and
returns aggregate counts. A rejected `JWT_SECRET` makes every route, including
this one, answer 503, so the container becomes `unhealthy`. Check
`docker compose ps`.

## Reverse proxy and HTTPS

Compose publishes the port on loopback, so a reverse proxy on the same host is
the normal setup.

- **Caddy**: add `header_up CF-Connecting-IP {remote_host}` inside
  `reverse_proxy` when `TRUSTED_IP_SOURCE=cf`.
- **nginx**: add `proxy_set_header CF-Connecting-IP $remote_addr;` in the
  proxying `location`.
- Alternatively set `TRUSTED_IP_SOURCE=x-forwarded-for` and let the single
  proxy append the address, or `none` on a Tor/I2P mirror.

Passkey sign-in accepts the request's own origin, `https://<host>` when the
Worker is reached over plain http through a TLS proxy, or
`PUBLIC_APP_ORIGIN`. Set `PUBLIC_APP_ORIGIN` if the proxy does not pass the
browser's `Host` header through.

Plain http works on a LAN and encrypted backups/shares remain encrypted, but
browsers withhold installation, offline use, and passkeys until the page is
served over https or from localhost. Do not expose the container directly to
the internet.

## Optional: `hrt://` transport

`hrt-server` is a raw TLS 1.3 listener (ALPN `hrt/1`) that lets `hrt-tool` sign
in with an `hrt://` address. It is disabled by default and unavailable on
Cloudflare Workers. It stores no health data and forwards only an allowlist of
requests to the loopback web app. See `hrt-server/README.md` for the protocol.

1. Create the certificate, key, and token under `./data/hrt/`:

   ```sh
   install -d -m 700 ./data/hrt
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
     -keyout ./data/hrt/server-key.pem -out ./data/hrt/server-cert.pem \
     -days 365 -subj "/CN=hrt.example.com"
   openssl rand -base64 48 > ./data/hrt/service-token
   chmod 600 ./data/hrt/server-key.pem ./data/hrt/service-token
   sudo chown -R 1000:1000 ./data/hrt
   ```

2. Add to `.env`:

   ```sh
   HRT_RAW_ENABLED=1
   HRT_SERVICE_TOKEN_FILE=/data/hrt/service-token
   HRT_RAW_CERT=/data/hrt/server-cert.pem
   HRT_RAW_KEY=/data/hrt/server-key.pem
   ```

3. Publish the raw port to the clients that need it. Compose publishes only
   `127.0.0.1:8787`; add a mapping such as `"9443:9443"` and expose it only on
   the intended interface.

4. Recreate the container and check the capability route:

   ```sh
   docker compose up -d --force-recreate
   curl -s http://127.0.0.1:8787/api/hrt/capability
   ```

   It answers `{"supported":true}` when pairing is on. If the raw server cannot
   start, it prints `hrt-raw-server: <reason>` and the container stops.

Clients use `hrt://HOST[:PORT]` (port defaults to 9443) and confirm the server
public key on first contact. `hrt-tool` pins the key.

## Optional: F2F escrow

Escrow is opt-in. Generate a cohort OpenPGP key pair offline and load it through
the service-token endpoints. The server stores the public key and an AES-GCM
envelope of the private key under `HRT_ESCROW_KEY`. No API returns the private
key, and no recovery endpoint exists.

- Set `HRT_F2F_ESCROW=1` and provide `HRT_SERVICE_TOKEN_FILE`. Docker creates
  `/data/hrt/escrow-key` unless you supply `HRT_ESCROW_KEY`/`HRT_ESCROW_KEY_FILE`.
  Back it up.
- Provision with `POST /api/tool/v1/f2f/escrow/keys`; inspect with
  `GET /api/tool/v1/f2f/escrow/status`. Both require
  `x-hrt-service: <service token>` and do not accept a web session.
- Only new cohorts reserve a key. With an empty pool, membership fails with
  `ESCROW_UNAVAILABLE`.
- A cohort has 100 seats. The housekeeping run retires a cohort after 180 days
  without key or keyring activity; see the note about cron in Docker below.

The operator workflow with `gpg` and `curl` is in
`docs/hrt-protocol/F2F_SERVICE.md`.

## Published images

`docker-publish.yml` builds the image for pull requests to `main`, and
publishes `linux/amd64` and `linux/arm64` images to
`ghcr.io/<owner>/<repository>` on pushes to `main`, version tags, and manual
runs. The package is private for now, so pulling it without access fails; build
from source as above.

The runtime image copies the Worker's source files by an explicit list in the
Dockerfile. A fork that adds a module imported by the Worker must add it to that
list.

## Known limits

- **Scheduled cleanup does not run in the container.** The entrypoint starts
  `wrangler dev` without `--test-scheduled`, and nothing calls the scheduled
  handler. Session and share expiry are also checked when the records are used,
  so this is a cleanup gap, not an access bypass. Trigger the handler yourself
  if you need the sweep.
- **Rate limiting fail-open.** If a rate-limit binding is missing or throws,
  the Worker logs it and lets the request through. Whether Wrangler's local
  runtime enforces the `[[ratelimits]]` bindings was not verified here.
- **Two different `JWT_SECRET` checks.** The entrypoint checks length and
  distinct characters; the Worker also rejects the listed words. A long value
  containing one of those words passes the entrypoint and then gets 503s.
- **No `hrt://` on Cloudflare.** The raw listener needs a TLS socket and is
  Docker-only.
- The Docker and Cloudflare deployment paths were read from the repository and
  not deployed while writing this page. Commands are the ones in the README and
  entrypoint at version 1.5.0.
