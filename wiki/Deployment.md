# Deployment

The tracker is one Cloudflare Worker (`worker.ts`) that serves the web app and
every `/api/*` route. The same sources run in a Docker container, where the
Worker runs under Wrangler's local runtime. Choose the path that matches where
you want your data to live.

| Option                                      | Runs on                                      | Data lives in                | Best for                                                |
| ------------------------------------------- | -------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| [Docker](Deployment-Docker)                 | One container (`wrangler dev` + local D1/R2) | `./data`, mounted at `/data` | A home server, a VPS, or a LAN machine you control      |
| [Cloudflare Workers](Deployment-Cloudflare) | Cloudflare's runtime                         | D1 and R2                    | No server to maintain; global HTTPS and a custom domain |
| [Local development](Deployment-Local)       | Vite on `:3000`, Worker on `:8787`           | Local D1/R2 store            | Working on the code                                     |

Plain `docker run` uses the same image and volume as Docker Compose and is
covered on the Docker page.

## Requirements

- **Docker path**: Git, Docker Engine, and Docker Compose v2. The image is built
  from source; the published package is private for now.
- **Cloudflare path**: Node.js 22, npm, a Cloudflare account, and a domain if
  you do not want a `workers.dev` address. D1 and R2 must be enabled.
- **Local path**: Node.js 22 and npm. The desktop app additionally needs a Rust
  toolchain and the Tauri 1 system dependencies.

## What the server stores

Accounts, sessions, encrypted backups, share payloads, avatars, and (when
enabled) F2F keyring material live on the server. Dose records, lab results,
weight, and the model run in the browser by default. Backups and share links
are encrypted before they leave the browser. The server still holds account and
session metadata, so protect the database and the host.

## Decide these first

1. **Address and HTTPS.** A public deployment should be served over HTTPS
   through a TLS-terminating reverse proxy (Caddy, nginx, or a Cloudflare
   custom domain). Browsers restrict app installation, offline use, and passkey
   sign-in on plain http other than localhost.
2. **Who can reach the port.** The Compose file publishes `127.0.0.1:8787`
   only. Keep it loopback-only and put a proxy in front. Do not expose the
   container directly to the internet.
3. **Client address source.** Per-address rate limits need the real client
   address. Set `TRUSTED_IP_SOURCE` to `cf`, `x-forwarded-for`, or `none`
   according to what sits in front. A proxy must overwrite
   `CF-Connecting-IP` or append the address to `X-Forwarded-For`; otherwise a
   client can choose its own address or every visitor shares one.
4. **`JWT_SECRET`.** Generate a long random value and keep it out of git.
   Changing it signs every session out. The Worker rejects weak or well-known
   values with a 503.
5. **Admin account.** `ADMIN_USERNAME` and `ADMIN_PASSWORD` are optional, but
   set both or neither. Setting only the username reserves the name without
   enabling administrator sign-in.
6. **Optional `hrt://` transport.** Only the Docker deployment can expose the
   raw TLS listener. Cloudflare Workers cannot accept a raw TLS connection.
7. **Optional F2F escrow.** Off by default. If you enable it, back up the escrow
   key; without it, stored escrow private keys cannot be recovered.

## Hardening checklist

- [ ] `JWT_SECRET` generated with `openssl rand -base64 48`, stored as a secret,
      never committed.
- [ ] `ADMIN_PASSWORD` set only with `ADMIN_USERNAME`, with a unique password.
- [ ] HTTPS in front of the app; the app port bound to loopback.
- [ ] `TRUSTED_IP_SOURCE` matches the proxy, and the proxy overwrites the
      client-address header.
- [ ] `PUBLIC_APP_ORIGIN` set when the proxy changes the `Host` header.
- [ ] If `hrt://` is enabled: certificate, key, and service token are mode 600,
      the raw port is published only where clients need it, and the service
      token is long and random.
- [ ] `./data` is owned by uid 1000, backed up with the container stopped, and
      readable only by the operator.
- [ ] The container is not exposed directly to the internet; a TLS proxy or a
      Tor/I2P daemon sits in front.
- [ ] `ENVIRONMENT` is not `development` on a public instance.
- [ ] Backups and exports are stored encrypted and treated as medical data.

See [Security](Security) for the reasoning and for vulnerability reporting.

## Updating

Docker: pull the new code and rebuild; migrations run at startup and `./data`
is kept. Cloudflare: apply new migrations and deploy again. Both paths are
described on their pages.

The wiki describes version 1.5.0. Commands and settings were read from the
repository; the Docker and Cloudflare paths were not deployed while writing
these pages, and the "Known limits" sections call out the points that were not
exercised.
