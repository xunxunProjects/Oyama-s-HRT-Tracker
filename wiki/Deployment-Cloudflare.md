# Cloudflare Workers

This is the serverless deployment: the web app is served by a Cloudflare
Worker, accounts and metadata live in D1, and avatars live in R2. You do not
run a machine, but you do own the Cloudflare account, the database, and the
bucket.

The steps below are the same as the "Cloudflare" section of the repository
README, expanded with the decisions that are easy to miss. Run everything from
a clone of your fork.

## Before you start

- Node.js 22 and npm.
- A Cloudflare account with D1 and R2 available. R2 has to be enabled once in
  the dashboard before the first bucket can be created.
- A domain is optional; without one the Worker gets a `workers.dev` address.
  Passkeys, installation, and offline use need HTTPS, which Cloudflare
  provides on both.

## 1. Sign in

```bash
npm install
npx wrangler login
```

`wrangler login` opens a browser and stores an OAuth token for your account.
For CI or a headless machine, use `CLOUDFLARE_API_TOKEN` instead.

## 2. Create the D1 database

```bash
npx wrangler d1 create hrt-tracker-prod
```

Copy the `database_id` it prints into the `[[d1_databases]]` block of
`wrangler.toml`, replacing the maintainer's ID. **Keep the name
`hrt-tracker-prod`**: the npm migration scripts pass that name explicitly.

The repository ships 13 migrations (`migrations/0000` through `0012`). They
create the account, session, backup, share, invitation, rate-limit, pairing,
and F2F tables. Do not create tables by hand.

## 3. Create the avatar bucket

```bash
npx wrangler r2 bucket create hrt-tracker-avatars
```

Set `bucket_name` in the `[[r2_buckets]]` block to that name. Only avatars are
stored there; dose, lab, and weight data stay in the browser unless the user
exports a backup.

## 4. Remove the preview blocks

Delete every `[[previews.*]]` block at the end of `wrangler.toml`. They point
at the maintainer's preview database, bucket, and rate-limit namespaces and
only work inside the maintainer's account. If you want pull-request previews,
create your own second database and bucket and put their names and IDs there
instead.

## 5. Apply the migrations

```bash
npm run wrangler:migrate:remote
```

Run it again after pulling a release that adds files to `migrations/`.
`wrangler d1 migrations list hrt-tracker-prod --remote` shows what is pending.

## 6. Build and deploy

```bash
npm run build
npx wrangler deploy
```

The Worker serves `dist/` through the `ASSETS` binding, with a single-page
fallback and `run_worker_first` for `/api/*`. Wrangler prints the deployed
address. To use a custom domain, add it under the Worker's **Settings →
Domains & Routes** in the dashboard.

If share links should use a different address than the one users open, set
`PUBLIC_APP_ORIGIN` (for example `https://hrt.example.com`) as a variable in
the dashboard or in a `[vars]` block. Passkey sign-in also accepts that origin
when a proxy does not pass the browser's `Host` header through.

## 7. Set the secrets

Sign-in needs `JWT_SECRET`; set it immediately after the first deploy.

```bash
openssl rand -base64 48 | npx wrangler secret put JWT_SECRET
# Optional built-in administrator; set both or neither
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
```

The Worker rejects a missing, short, or low-diversity `JWT_SECRET` with a 503,
so a misconfigured deployment fails closed instead of signing tokens with a
guessable key. Changing the secret signs every session out.

Secrets are not the same as variables:

| Kind     | Set with                                     | Examples                                                |
| -------- | -------------------------------------------- | ------------------------------------------------------- |
| Secret   | `wrangler secret put` or the dashboard       | `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`        |
| Variable | `[vars]` in `wrangler.toml` or the dashboard | `PUBLIC_APP_ORIGIN`, `TRUSTED_IP_SOURCE`, `ENVIRONMENT` |

`TRUSTED_IP_SOURCE` defaults to `cf`, which reads `CF-Connecting-IP`. On
Cloudflare that header is set by the edge. Only change it if you put another
proxy in front of the Worker.

## Deploy on every push (optional)

Connect the fork in the Worker's **Settings → Builds**:

- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`

Commit the `wrangler.toml` changes first. The `[build]` block in
`wrangler.toml` also builds `dist/` when it is missing, because Workers Builds
checks out a clean tree.

## Scheduled housekeeping

`wrangler.toml` declares the cron `17 */6 * * *`. The Worker's `scheduled()`
handler removes dead sessions and expired share payloads. It runs in
Cloudflare's runtime after deploy; there is nothing to install.

The five rate-limit bindings (`RL_PER_MINUTE_10` through `300`) are also
declared in `wrangler.toml` and deploy with the Worker. Keys are prefixed per
endpoint inside the Worker, so two endpoints on the same class do not share a
bucket.

## What this deployment cannot do

- **No `hrt://` raw transport.** Workers cannot accept a raw TLS connection.
  Pairing and the raw protocol need the Docker deployment or a separate
  `hrt-server`; see [Docker](Deployment-Docker).
- **No local filesystem.** Everything persistent must be D1, R2, or a Worker
  binding. Do not expect a `/data` directory.
- **No long-lived processes.** Work happens per request or in the scheduled
  handler.

## Updating

```bash
git pull
npm install
npm run wrangler:migrate:remote
npm run build
npx wrangler deploy
```

Read `CHANGELOG.md` before a major release. If a release changes
`wrangler.toml`, merge those changes into your copy rather than overwriting it:
your database ID, bucket name, and preview blocks are yours.

## Troubleshooting

- **`database_id` errors.** The ID in `wrangler.toml` belongs to another
  account. Re-run `npx wrangler d1 create` and replace it.
- **`assets.directory does not exist`.** Run `npm run build` first; Workers
  Builds does this through the `[build]` command.
- **503 on sign-in.** `JWT_SECRET` is missing or rejected. Set it with
  `wrangler secret put` and redeploy.
- **Missing tables.** Run `npm run wrangler:migrate:remote`; check pending
  migrations with `npx wrangler d1 migrations list hrt-tracker-prod --remote`.
- **Share links point at the wrong host.** Set `PUBLIC_APP_ORIGIN`.
- **Cloudflare injects scripts and the page breaks.** The Worker sends
  `script-src 'self'`; disable Web Analytics and the JS challenge bootstrap
  for the zone, or add a nonce/hash. Do not add `'unsafe-inline'`.

See [Security](Security) for the hardening checklist.
