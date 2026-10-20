# hrt-raw-server

The optional TLS 1.3 / mTLS adapter for the `hrt/1` protocol. It is
**disabled by default** and is not available on Cloudflare Workers/Pages or
other edge platforms that cannot expose a raw TLS listener.

The web app remains the source of truth for accounts, pairing requests,
devices, holds, and trusted IPs. This process only owns the TLS listener,
the framed protocol, and the allowlisted loopback bridge to
`/api/tool/v1/*`. It stores no health data and no account database.

## Status

The transport, framing, allowlists, device-fingerprint authorization, and
tests are implemented. The web app's pairing/device endpoints and the CLI
raw client are the next phase. Do not expose this listener to the internet
until those are in place.

## Running

Generate a server certificate, private key, and service token on the
persistent volume:

```sh
install -d -m 700 /data/hrt
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -nodes -keyout /data/hrt/server-key.pem \
  -out /data/hrt/server-cert.pem -days 365 \
  -subj "/CN=hrt.example.com"
chmod 600 /data/hrt/server-key.pem
openssl rand -base64 48 > /data/hrt/service-token
chmod 600 /data/hrt/service-token
```

Environment:

```text
HRT_RAW_ENABLED=1
HRT_RAW_PORT=9443
HRT_RAW_CERT=/data/hrt/server-cert.pem
HRT_RAW_KEY=/data/hrt/server-key.pem
HRT_SERVICE_TOKEN_FILE=/data/hrt/service-token
HRT_WEB_ORIGIN=http://127.0.0.1:8787
HRT_RAW_MAX_CONNECTIONS=8
```

`HRT_WEB_ORIGIN` must stay on loopback. The TLS private key and the service
token must be mode `0600`; the process refuses to start otherwise. The
web app must accept the same service token on its internal
`/api/tool/v1/hrt/*` endpoints.

Start manually:

```sh
HRT_RAW_ENABLED=1 ... node hrt-server/server.mjs
```

In Docker the entrypoint starts this process only when
`HRT_RAW_ENABLED=1`; otherwise the image behaves as before.

## Wire protocol

See [`../docs/hrt-protocol/DEV_GUIDE.md`](../docs/hrt-protocol/DEV_GUIDE.md).
Frames are a 4-byte big-endian length plus one JSON envelope, capped at
24 MiB. Only `pair.start`, `pair.poll`, `ping`, and allowlisted
`/api/tool/v1/*` requests are accepted. A client certificate is required
for `request`; its SHA-256 DER fingerprint must be authorized by the web
app.

## Limits

- ALPN `hrt/1`; TLS 1.3 only.
- Maximum 8 concurrent connections by default; each frame is bounded to
  24 MiB.
- Idle timeout 30 seconds; backend timeout 30 seconds; handshake timeout
  15 seconds.
- No redirects, no compression, no pipelining, no general forward proxy.

## Tests

```sh
node node_modules/vitest/vitest.mjs run tests/hrtServer.test.ts
```

The test generates short-lived self-signed certificates in a temporary
directory with the `openssl` CLI; no private key is committed to the
repository. The suite is skipped when `openssl` is unavailable.
