<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/hero-dark.png" />
    <img src="./docs/images/hero-light.png" alt="Oyama's HRT Tracker on a phone: the current estimated estradiol level, today's dose and the hormone level timeline, next to a month of estradiol levels" />
  </picture>
</p>

<p align="center">
  <b>English</b>
  &nbsp;&nbsp;&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  Log your HRT doses and see the hormone levels they produce. Private, open and free.
</p>

<p align="center">
  <a href="https://hrt.mahiro.uk"><b>Open in your browser</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases/latest"><b>macOS and Windows</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#docker"><b>Self-host with Docker</b></a>
</p>

# Table of Contents

- [Introduction](#introduction)
- [Features](#features)
  - [Why it is different](#why-it-is-different)
  - [Hormone levels](#hormone-levels)
  - [Doses and plans](#doses-and-plans)
  - [Lab results](#lab-results)
  - [Supplies](#supplies)
  - [Backup and sharing](#backup-and-sharing)
  - [Where the model comes from](#where-the-model-comes-from)
- [Self-hosting](#self-hosting)
- [Contributing](#contributing)
- [Support](#support)
- [Legal](#legal)

# Introduction

**Oyama's HRT Tracker** is a privacy-focused tool for logging hormone replacement therapy and simulating the hormone levels your doses produce. It has a feminizing mode (estradiol, plus cyproterone acetate) and a masculinizing mode (testosterone), and it can log other adjunct drugs too.

**Runs in the browser, as an installable app, on macOS and Windows, or on your own server.**

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/gallery-dark.png" />
    <img src="./docs/images/gallery-light.png" alt="Six screens of the app: overview, hormone level timeline, what-if, dose history, lab results and logging a dose" />
  </picture>
</p>

From left to right: the overview with the current estimate, a month of estradiol levels, the what-if planner, the dose history, lab results next to the model, and logging a new dose. The screenshots use sample records; to make them again, see [design/readme](./design/readme/README.md).

> [!WARNING]
> **Not medical advice.** This app shows estimates from a pharmacokinetic model. They can differ a lot from your real hormone levels and are no substitute for blood tests or a clinician. Do not start, stop or change any medication based on this app alone.

# Features

## Why it is different

- **Private by default**: your records stay in your browser unless you turn on cloud backup or make a share link, and both are end-to-end encrypted.
- **Open source**: every line is public under the MIT License, so anyone can check how the estimates are made.
- **Free**: no subscriptions, no paid features, no ads.
- **Speaks your language**: Simplified Chinese, Traditional Chinese, Cantonese, English, Japanese, Korean and Turkish.

## Hormone levels

- See the estimated level over time: estradiol in pg/mL, cyproterone acetate in ng/mL, total testosterone in ng/dL
- Estradiol by injection (benzoate, valerate, cypionate, enanthate, and undecylate in beta), oral, sublingual, gel and patch
- Testosterone by injection (cypionate, enanthate, undecanoate) and gel
- For sublingual doses, pick how long you hold the tablet (2 to 15 minutes) or enter your own time

## Doses and plans

- Write down what you take and how often; the overview shows what is due today and logs it with one tap
- Compare carrying on as now with a planned change in the what-if view
- Log spironolactone, bicalutamide, medroxyprogesterone acetate, raloxifene, leuprorelin and triptorelin as well; they have no level model, so they draw no curve

## Lab results

- Log blood test results and see them on the curve next to the estimate
- Calibrate the estradiol model to you with EKF, OU-Kalman or MIPD, or edit its parameters by hand

## Supplies

- Keep track of how much of each medicine you have
- Logged doses are subtracted automatically, and the overview warns you before you run out

## Backup and sharing

- Back up to the cloud with end-to-end encryption, or export a file
- Share a read-only link to your dose history and curve; the key lives only in the link, and lab results, weight and account details are never included
- Read the [privacy notice](./PRIVACY.md) for every detail

## Where the model comes from

The estradiol pharmacokinetic model is based on `PKcore.swift` and `PKparameter.swift` by **@LaoZhong-Mihari**, from the **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** repository. Its three-compartment structure, two-part injection depot kinetics and sublingual absorption tiers come from there.

This project has since adjusted and extended the model: it adds testosterone (injection esters, gel and patch) for the masculinizing mode, cyproterone acetate on its own curve, and estradiol undecylate injections; it revises the gel and sublingual handling; and it can calibrate the estradiol curve against your lab results. See [Algorithm Explanation.md](./Algorithm%20Explanation.md) for the details.

# Self-hosting

You are **very welcome** to run this app on your own website or server, and you do not need to ask first. The simplest way is Docker; to use your own Cloudflare account instead, see [Cloudflare](#cloudflare).

## Docker

The Docker image runs the complete app locally, including the Worker API, D1
database, and R2-compatible avatar storage. Data is kept in the project's `./data`
directory and survives container restarts. The image is built from source on
your machine, so you need Git and Docker with Compose.

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
cp .env.docker.example .env
# Replace JWT_SECRET in .env with the output of:
openssl rand -base64 48
mkdir -p ./data
sudo chown 1000:1000 ./data
docker compose up -d --build
```

Then open <http://localhost:8787>. The port is published on `127.0.0.1` only,
so the app is not reachable from the LAN by default. Keep it that way unless a
reverse proxy sits in front, or deliberately change the mapping in
`compose.yaml` to `"8787:8787"`.

The first build takes a few minutes. To update later, pull the new code and
rebuild; your data in `./data` is kept:

```bash
git pull
docker compose up -d --build
```

### Plain http and https

To open the app over plain http from another device (for example
`http://192.168.1.5:8787`), publish the port on your LAN interface — change
the compose mapping to `"8787:8787"` — or put the container behind a reverse
proxy first. Backups, exports and share links stay end-to-end encrypted over
plain http too. Browsers do hold back a few features until the
page is served over https (or opened as `localhost`): installing it as an app,
offline use, and passkey sign-in. To get those, put the container behind any
https reverse proxy, such as [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
(`caddy reverse-proxy --from your.domain --to localhost:8787`) or
[Tailscale Serve](https://tailscale.com/kb/1312/serve).

[Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)

### Database schema

The schema is defined only by the files in `migrations/`. The container applies
them on every start, and a volume created by an older image is reconciled first
(`docker/reconcile.mjs`), so upgrading needs nothing from you.

For a Cloudflare deployment, run the same two steps once before deploying a
build that includes migration `0000`:

```bash
npm run wrangler:migrate:reconcile
npm run wrangler:migrate:remote
```

Web and Docker builds use same-origin `/api` requests by default. Desktop and
other custom-protocol builds should set `VITE_API_ORIGIN` to their Worker/API
origin at build time; the release workflow supplies the hosted origin.

To stop the app without deleting its data:

```bash
docker compose down
```

Without Compose, build and run the image with plain Docker:

```bash
docker build -t hrt-tracker:local .
docker run -d --name hrt-tracker \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  -v "$(pwd)/data:/data" \
  hrt-tracker:local
```

The mapping above is loopback-only. Use `-p 8787:8787` only if you intend to
expose the container to the LAN, and never expose it directly to the internet:
put a TLS-terminating reverse proxy (or a Tor/I2P daemon) in front instead.

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are optional. When used, set both. The
container uses Wrangler's local workerd runtime and local persistent D1/R2
resources; it does not connect to the Cloudflare production database or bucket.

`TRUSTED_IP_SOURCE` is optional too. Set it to `x-forwarded-for` when exactly
one reverse proxy you control sits in front of the container (otherwise the
worker sees no client address and every viewer shares one rate-limit bucket),
or to `none` on a Tor/I2P mirror that has no client addresses at all. The
default is `cf`, which reads Cloudflare's `CF-Connecting-IP` header.

The workflow in `.github/workflows/docker-publish.yml` validates pull requests
and publishes `linux/amd64` and `linux/arm64` images to GitHub Container Registry
for `main`, version tags, and manual runs. That package is private for now, so
pulling it without access fails; build from source as shown above.

## Cloudflare

`wrangler.toml` points at the maintainer's own database and bucket. Those IDs
only work inside the maintainer's Cloudflare account, so replace them with
resources you create in yours. Everything below runs from your clone of the
repository.

1. **Sign in**

   ```bash
   npm install
   npx wrangler login
   ```

2. **Create the database**

   ```bash
   npx wrangler d1 create hrt-tracker-prod
   ```

   Copy the `database_id` it prints into the `[[d1_databases]]` block of
   `wrangler.toml`, replacing the one there. Keep the name `hrt-tracker-prod`:
   the npm scripts below use it.

3. **Create the avatar bucket**

   ```bash
   npx wrangler r2 bucket create hrt-tracker-avatars
   ```

   Set `bucket_name` in the `[[r2_buckets]]` block to `hrt-tracker-avatars`
   (or whatever name you chose). R2 has to be enabled once in the Cloudflare
   dashboard before the first bucket can be created.

4. **Remove the preview blocks**

   Delete every `[[previews.*]]` block at the end of `wrangler.toml`. They point
   at the maintainer's preview database and are only used by pull request
   previews in Workers Builds. If you want previews too, create a second
   database and bucket and put their names and ID there instead.

5. **Create the tables**

   ```bash
   npm run wrangler:migrate:remote
   ```

   Run this again after pulling updates that add files to `migrations/`.

6. **Deploy**

   ```bash
   npm run build
   npx wrangler deploy
   ```

   Wrangler prints a `workers.dev` address. To use your own domain, add it under
   the Worker's Settings, Domains & Routes in the Cloudflare dashboard. If share
   links should use a different address than the one people open, set the
   variable `PUBLIC_APP_ORIGIN` (for example `https://hrt.example.com`).

7. **Set the secrets**

   Sign-in needs `JWT_SECRET`, so set it right after the first deploy.

   ```bash
   openssl rand -base64 48 | npx wrangler secret put JWT_SECRET
   # Optional built-in admin account, set both or neither
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   ```

To deploy on every push instead, connect your fork in the Worker's Settings,
Builds, with build command `npm run build` and deploy command
`npx wrangler deploy`, after committing the `wrangler.toml` changes above to
your fork.

## Attribution

If you deploy this app publicly, please:

1. **Keep the original algorithm credits**: Visibly link back to the [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test) repository.

2. **Respect the license**: Ensure you follow any licensing terms associated with the original algorithm code.

# Contributing

Contributions are welcome, and you do not need to be a programmer to help. See [CONTRIBUTING.md](./CONTRIBUTING.md) for running the app locally, a map of the code, adding a translation and making a release, and please follow the [Code of Conduct](./CODE_OF_CONDUCT.md). To report a security problem, see [SECURITY.md](./SECURITY.md).

# Support

<p align="center">
  <b>Maintainer</b>
  <br />
  <a href="https://github.com/SmirnovaOyama">@SmirnovaOyama</a>
  <br />
  <br />
  <b>Original model</b>
  <br />
  <a href="https://github.com/LaoZhong-Mihari">@LaoZhong-Mihari</a>
  <br />
  <br />
  <b><a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/graphs/contributors">Contributors</a></b>
  <br />
  <br />
  <a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=xunxunProjects/Oyama-s-HRT-Tracker" alt="Contributors" />
  </a>
</p>

Found a bug or have an idea? [Open an issue](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/issues/new/choose).

Wishing steady progress and good health to everyone who uses this tool.

# Legal

**Oyama's HRT Tracker is for information only and is not medical advice. Its estimates come from a model and can be far from your real levels. Use it at your own risk, and talk to a clinician about any change to your treatment.**

This project is released under the MIT License; see [LICENSE](./LICENSE). How your data is handled is described in the [privacy notice](./PRIVACY.md).
