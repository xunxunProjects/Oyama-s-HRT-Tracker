# VPS deployment with native Node

This is the advanced path: run the Worker under Wrangler's local runtime on a
VPS, supervised by systemd, behind a TLS reverse proxy. It uses the same
sources as the Docker image, but you own the process, the data directory, and
the updates.

> **Use the `v1.5.0` release tag, not `main`.** This path is not the supported
> self-host default. If you want the maintained packaging, use
> [Docker](Deployment-Docker). Run this only if you need a native service and
> can maintain it.

## Why this path exists

Docker is the supported way to self-host. A native service is useful when:

- the host already runs Node and you do not want a container runtime;
- you want the Worker process under your existing systemd, logging, and
  backup tooling;
- you need to bind the service to a private interface or a Unix-socket proxy
  without Docker networking.

It is not a hardened production server by itself. `wrangler dev` is a
development runtime; it is used here because it is the same runtime the Docker
image uses. Put a real reverse proxy in front and keep the app port on
loopback.

## Requirements

- Linux VPS with systemd.
- Node.js 22 and npm.
- A build toolchain for native modules.
- Caddy or nginx for TLS.
- A dedicated system user (example: `hrt`) and a data directory
  (`/var/lib/hrt-tracker`).

## Install

```bash
sudo useradd --system --home /opt/hrt-tracker --shell /usr/sbin/nologin hrt
sudo mkdir -p /opt/hrt-tracker /var/lib/hrt-tracker
sudo chown hrt:hrt /opt/hrt-tracker /var/lib/hrt-tracker

sudo -u hrt git clone --branch v1.5.0 --depth 1 \
  https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git /opt/hrt-tracker
cd /opt/hrt-tracker
sudo -u hrt npm ci
sudo -u hrt npm run build
```

Create `/opt/hrt-tracker/.dev.vars` (mode `0600`, owner `hrt`). Wrangler reads
this file as the Worker's bindings; plain shell environment variables are not
bindings.

```dotenv
JWT_SECRET='replace-with-openssl-rand-base64-48'
# Optional admin pair; set both or neither.
# ADMIN_USERNAME='admin'
# ADMIN_PASSWORD='a-unique-password'
TRUSTED_IP_SOURCE='x-forwarded-for'
PUBLIC_APP_ORIGIN='https://hrt.example.com'
ENVIRONMENT='production'
```

Generate the secret with `openssl rand -base64 48`. The Worker rejects weak or
well-known values with a 503. Do not commit this file.

Apply the schema to the local D1 store:

```bash
cd /opt/hrt-tracker
sudo -u hrt node ./docker/reconcile.mjs hrt-tracker-prod \
  --local --persist-to /var/lib/hrt-tracker
sudo -u hrt ./node_modules/.bin/wrangler d1 migrations apply \
  hrt-tracker-prod --local --persist-to /var/lib/hrt-tracker
```

`reconcile.mjs` is only needed for a data directory created by an older image;
it is idempotent. The migration command applies the missing `0000`–`0012`
migrations.

## Run under systemd

`/etc/systemd/system/hrt-tracker.service`:

```ini
[Unit]
Description=Oyama HRT Tracker (Wrangler local runtime)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=hrt
Group=hrt
WorkingDirectory=/opt/hrt-tracker
ExecStart=/usr/bin/npx wrangler dev --ip 127.0.0.1 --port 8787 \
  --persist-to /var/lib/hrt-tracker
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/hrt-tracker

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hrt-tracker
sudo systemctl status hrt-tracker
curl -s http://127.0.0.1:8787/api/transparency
```

The service is now reachable only from the VPS itself. Do not open port 8787
in the firewall.

## TLS reverse proxy

Caddy example (`/etc/caddy/Caddyfile`):

```caddyfile
hrt.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Caddy obtains a certificate and appends the client address to
`X-Forwarded-For`; set `TRUSTED_IP_SOURCE='x-forwarded-for'` in `.dev.vars`.
If you use nginx, make sure it overwrites or appends the client-address header
rather than passing a client-supplied value through. Set `PUBLIC_APP_ORIGIN` to
the public origin.

## Optional raw `hrt://`

The Docker image can start `hrt-server/` with `HRT_RAW_ENABLED=1`. For a native
installation, run `node ./hrt-server/server.mjs` as a second systemd service
with the certificate, key, service token, and IP key (mode 600). Expose the raw
port only to the clients that need it. See [Deployment-Docker](Deployment-Docker)
for the environment variables and certificate commands; the protocol is the
same.

Cloudflare cannot accept a raw TLS connection. If you deploy to Workers, use
the HTTPS API only.

## Updates

```bash
sudo systemctl stop hrt-tracker
sudo -u hrt tar -C /var/lib/hrt-tracker -czf /var/backups/hrt-tracker-$(date +%F).tar.gz .
cd /opt/hrt-tracker
sudo -u hrt git fetch --tags
sudo -u hrt git checkout v1.5.0      # replace with the new release tag
sudo -u hrt npm ci
sudo -u hrt npm run build
sudo -u hrt node ./docker/reconcile.mjs hrt-tracker-prod \
  --local --persist-to /var/lib/hrt-tracker
sudo -u hrt ./node_modules/.bin/wrangler d1 migrations apply \
  hrt-tracker-prod --local --persist-to /var/lib/hrt-tracker
sudo systemctl start hrt-tracker
```

Verify `/api/transparency` and log in with a non-admin account. If a migration
fails, stop and restore the backup; do not delete the data directory.

## Pitfalls

| Pitfall                            | What to do                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Running `main` in production       | Check out the release tag; `main` is unreleased                                                                  |
| Binding `0.0.0.0`                  | Use `--ip 127.0.0.1` and a reverse proxy                                                                         |
| Exposing 8787 in the firewall      | Keep it closed; only the proxy talks to it                                                                       |
| Secrets in the environment         | Wrangler reads `.dev.vars`, not arbitrary shell variables                                                        |
| Data owned by root                 | Run the service as `hrt`; keep `/var/lib/hrt-tracker` writable by that user                                      |
| Expecting scheduled cleanup        | `wrangler dev` does not run the Cloudflare cron; expired shares are cleaned lazily and tombstones may accumulate |
| Expecting a supported upgrade path | This path is manual; Docker is the supported one                                                                 |
| Forgetting the proxy header        | Set `TRUSTED_IP_SOURCE` and make the proxy overwrite `X-Forwarded-For`                                           |

## Related pages

- [Deployment](Deployment) — compare the paths
- [Deployment-Docker](Deployment-Docker) — supported container path
- [Deployment-Cloudflare](Deployment-Cloudflare) — edge path
- [Security](Security) — hardening and reporting
- [Dependencies](Dependencies) — runtime and build requirements
