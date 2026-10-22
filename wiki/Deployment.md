# Deployment

This page is for the person who has to keep an instance running. Pick one of
the three production paths, or use the local path for development.

> **Use the latest release, `v1.5.0` (2026-10-14), for production.** Do not
> deploy `main`. `main` contains unreleased changes, including two Low-severity
> fixes merged on 2026-10-22 that are not in `v1.5.0`; they will be in the next
> release. If you need those fixes in production, wait for the next release
> rather than deploying an untagged commit.

## Choose a path

| Path                                        | Runs on                                      | Data lives in                  | Best for                                             | Raw `hrt://`  |
| ------------------------------------------- | -------------------------------------------- | ------------------------------ | ---------------------------------------------------- | ------------- |
| [Cloudflare Workers](Deployment-Cloudflare) | Cloudflare's runtime                         | D1 + R2                        | No server to maintain, global HTTPS, a custom domain | No            |
| [Docker / Compose](Deployment-Docker)       | One container (`wrangler dev` + local D1/R2) | `./data`, mounted at `/data`   | A home server, a VPS, a LAN machine you control      | Yes, optional |
| [VPS, native Node](Deployment-VPS)          | Node 22 + `wrangler dev` under systemd       | A persist directory on the VPS | A VPS where you do not want Docker; advanced         | Yes, optional |
| [Local development](Deployment-Local)       | Vite + a local Worker                        | Local D1/R2                    | Working on the code, not production                  | No            |

Docker and VPS-native run the same Worker sources. The difference is packaging
and process supervision: Docker is the supported self-host path; VPS-native is
for operators who need a native service and accept the extra maintenance.

## Requirements

- **Cloudflare:** Node.js 22, npm, a Cloudflare account, D1 and R2 enabled, and
  a domain if you do not want a `workers.dev` address.
- **Docker:** Git, Docker Engine, Docker Compose v2. The image is built from
  source; the published GHCR image is private for now.
- **VPS native:** Node.js 22, npm, a build toolchain for native modules, a
  reverse proxy (Caddy or nginx), and systemd. Rust is only needed for the
  desktop app.
- **Local:** Node.js 22 and npm; see [Deployment-Local](Deployment-Local).

## What the server stores

Accounts, sessions, encrypted backups, share payloads, avatars, and (when
enabled) F2F keyring material live on the server. Dose records, lab results,
weight, and the model run in the browser by default. Backups and share links
are encrypted before they leave the browser. The server still holds account and
session metadata, so protect the database and the host.

## Decide these first

1. **Address and HTTPS.** Serve a public deployment over HTTPS through a
   TLS-terminating reverse proxy (Caddy, nginx, or a Cloudflare custom domain).
   Browsers restrict installation, offline use, and passkey sign-in on plain
   HTTP other than localhost.
2. **Who can reach the port.** The Compose file publishes `127.0.0.1:8787` only.
   Keep it loopback-only and put a proxy in front. Never expose the app port
   directly to the internet.
3. **Client address source.** Per-address rate limits need the real client
   address. Set `TRUSTED_IP_SOURCE` to `cf`, `x-forwarded-for`, or `none` to
   match what sits in front. A proxy must overwrite `CF-Connecting-IP` or
   append to `X-Forwarded-For`; otherwise a client can choose its own address
   or every visitor shares one.
4. **`JWT_SECRET`.** Generate a long random value and keep it out of git.
   Changing it signs every session out. The Worker rejects weak or well-known
   values with a 503.
5. **Admin account.** `ADMIN_USERNAME` and `ADMIN_PASSWORD` are optional, but
   set both or neither. Setting only the username reserves the name without
   enabling administrator sign-in.
6. **Optional `hrt://` transport.** Only Docker and VPS-native can expose the
   raw TLS listener. Cloudflare Workers cannot accept a raw TLS connection.
7. **Optional F2F escrow.** Off by default. If you enable it, back up the escrow
   key; without it, stored escrow private keys cannot be recovered.

## Common pitfalls

| Pitfall                                  | What to do                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Building from `main`                     | Check out the release tag (`v1.5.0`); never deploy an untagged commit                                                                                   |
| Copying the maintainer's `wrangler.toml` | Replace the D1 `database_id` and the R2 `bucket_name` with your own; delete the `[[previews.*]]` blocks                                                 |
| Missing migrations                       | The container applies them on start; Cloudflare uses `npm run wrangler:migrate:remote`; VPS-native uses the local migration command with `--persist-to` |
| Exposing `8787`                          | Publish `127.0.0.1:8787` only; terminate TLS in a proxy                                                                                                 |
| Wrong client IP                          | Set `TRUSTED_IP_SOURCE` and make the proxy overwrite the header                                                                                         |
| Data owned by root                       | `mkdir -p data && sudo chown 1000:1000 data`; the container runs as uid 1000                                                                            |
| Expecting cron in Docker                 | The six-hour cleanup runs on Cloudflare; Docker and VPS-native do not run it                                                                            |
| Expecting `hrt://` on Cloudflare         | Not possible; use the HTTPS API or a Docker/VPS deployment                                                                                              |
| Changing `JWT_SECRET`                    | Every existing session is signed out; plan the rotation                                                                                                 |
| Backing up only the database             | Back up the whole data directory, or D1 + R2, with the service stopped                                                                                  |

## Hardening checklist

- [ ] `JWT_SECRET` generated with `openssl rand -base64 48`, stored as a secret,
      never committed.
- [ ] `ADMIN_PASSWORD` set only with `ADMIN_USERNAME`, with a unique password.
- [ ] HTTPS in front of the app; the app port bound to loopback.
- [ ] `TRUSTED_IP_SOURCE` matches the proxy, and the proxy overwrites the
      client-address header.
- [ ] `PUBLIC_APP_ORIGIN` set when the proxy changes the `Host` header.
- [ ] The deployment is pinned to the `v1.5.0` tag.
- [ ] If `hrt://` is enabled: certificate, key, and service token are mode 600,
      the raw port is published only where clients need it, and the service
      token is long and random.
- [ ] `./data` is owned by uid 1000, backed up with the container stopped, and
      readable only by the operator.
- [ ] The app is not exposed directly to the internet; a TLS proxy or a Tor/I2P
      daemon sits in front.
- [ ] `ENVIRONMENT` is not `development` on a public instance.
- [ ] Backups and exports are stored encrypted and treated as medical data.

See [Security](Security) for the reasoning and for vulnerability reporting.

## Updating

1. Read the release notes and `CHANGELOG.md`.
2. Back up the data directory, or D1 and R2.
3. Check out the new release tag; do not merge `main`.
4. Rebuild and restart. The container reconciles old volumes and applies
   migrations on start. Cloudflare and VPS-native need the migration command
   for the new release.
5. Verify `/api/transparency` returns 200 and log in with a non-admin account.

If a migration fails, stop and restore the backup. Do not delete the database to
"start clean" on a real instance.

## Related pages

- [Deployment-Cloudflare](Deployment-Cloudflare)
- [Deployment-Docker](Deployment-Docker)
- [Deployment-VPS](Deployment-VPS)
- [Deployment-Local](Deployment-Local)
- [Local-Tool](Local-Tool) — loopback-only personal instance
- [Security](Security)
- [Dependencies](Dependencies)
