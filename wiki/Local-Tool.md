# Run it locally as a tool

You do not need a public server to use the tracker. Run the app and Worker on
`127.0.0.1`, keep the data on your machine, and point `hrt-tool` at the same
loopback address. Nothing is published to the network.

This is the recommended setup for testing, for a private personal instance, or
for using the CLI against a real API without touching a shared deployment.

## What you need

- Docker Engine and Docker Compose v2, or Node.js 22 if you prefer the
  developer setup.
- The **`v1.5.0` release**, not `main`.
- A free loopback port. The examples use `8787`; do not use a port that is
  already serving something else.

## Docker on loopback

```bash
git clone --branch v1.5.0 --depth 1 \
  https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker

cp .env.docker.example .env
printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env
printf 'BIND_HOST=127.0.0.1\n' >> .env

mkdir -p data
sudo chown 1000:1000 data

docker compose -p hrt-local up -d --build
# open http://127.0.0.1:8787
```

`compose.yaml` already publishes `127.0.0.1:8787:8787`; `BIND_HOST=127.0.0.1`
keeps the Worker inside the container on loopback too. Do not change either to
`0.0.0.0` for a local tool.

The container applies D1 migrations on start. The data directory holds the
local database and uploaded content; it is created with the container user's
uid (`1000`).

## Use the CLI against it

Install `hrt-tool` from the Tools releases (the current line is a 0.1.x
pre-release; treat it accordingly), then:

```bash
hrt-tool add-link http://127.0.0.1:8787 local
hrt-tool commit-server local
hrt-tool login --username your-local-user
hrt-tool look
hrt-tool status
```

The CLI only speaks to the server you name. A link stores its own token, and
changing the server origin clears the token. Use `hrt-tool doctor` if a
connection fails.

You can also skip the server entirely for a browser-only session: the app keeps
dose, lab, and weight data in the browser until you enable cloud backup or a
share link. The local server is what gives you accounts, backups, and the CLI
API.

## Keep the environment clean

- Use a dedicated Compose project name (`-p hrt-local`) so the container,
  network, and volume do not collide with another deployment.
- Keep the data in a dedicated volume or directory. Do not mount a directory
  that holds real medical records into a test instance.
- Do not put Cloudflare, GHCR, or other cloud credentials in this `.env`.
- Do not add a router port-forward or a public reverse proxy. If you need
  remote access, use a private overlay network or a Tor/I2P service, and read
  [Security](Security) first.
- Stop the instance when you are done:

```bash
docker compose -p hrt-local down       # keeps ./data
docker compose -p hrt-local down -v    # deletes the test data too
```

## Troubleshooting

| Symptom                         | Check                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `permission denied` on `./data` | `sudo chown 1000:1000 data`; the container runs as uid 1000                             |
| Port already in use             | Change the host side of the Compose port mapping, not the app port inside the container |
| `JWT_SECRET` rejected           | At least 32 characters, at least 8 distinct characters, not a known weak value          |
| CLI cannot connect              | Use `http://127.0.0.1:8787`, not `0.0.0.0`; check `hrt-tool doctor`                     |
| Login fails after a reset       | Changing `JWT_SECRET` signs every session out; log in again                             |

For the full container reference, see [Deployment-Docker](Deployment-Docker).
For the developer setup without Docker, see [Deployment-Local](Deployment-Local).
