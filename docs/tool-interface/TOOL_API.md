# hrt-tool API — `/api/tool/v1`

The terminal client `hrt-tool` talks to the same Cloudflare Worker as the
website. This document is the contract for the versioned tool namespace. The
worker treats snapshot payloads as opaque JSON: it never decrypts them,
derives the cloud key, or computes concentrations.

All routes are under `https://<server>/api/tool/v1`. Authentication is the
existing 7-day JWT in `Authorization: Bearer <token>` (session tokens only;
passkey challenge tokens are rejected). CORS is `*`; the CLI does not use
cookies. Times are ISO 8601 UTC in `serverTime`; snapshot `createdAt` values
are Unix seconds.

## Public routes

### `GET /version`

No auth. `200`:

```json
{
  "apiVersion": 1,
  "minToolVersion": "0.1.0",
  "transport": ["tls"],
  "serverTime": "2026-10-20T02:00:00.000Z"
}
```

`transport` lists the request-body envelopes the server supports. This
release supports plain JSON over TLS only; `openssl-v1` is not advertised.

### `POST /login`

No auth. The body is the existing login body:

```json
{ "username": "Alice", "password": "...", "totp_code": "123456", "backup_code": "...", "device_pass": "..." }
```

It runs the same handler as `/api/login`: per-IP and per-account rate limits,
persistent lockout, TOTP/backup codes, passkey-2FA fallback, and device
passes. On success `200` the website fields are present and the tool fields
are added:

```json
{
  "token": "<jwt>",
  "user": { "id": "user-1", "username": "Alice", "isAdmin": false },
  "devicePass": "<signed device pass>",
  "apiVersion": 1,
  "serverTime": "2026-10-20T02:00:00.000Z",
  "transport": ["tls"]
}
```

Errors keep the existing shapes (`INVALID_CREDENTIALS`, `TWO_FACTOR_REQUIRED`,
`TWO_FACTOR_INVALID`, `ACCOUNT_LOCKED`, `RATE_LIMITED`) without the tool
fields.

### `POST /compute`

Reserved. Always `501`:

```json
{ "code": "NOT_IMPLEMENTED", "message": "Server compute is reserved for a future version" }
```

## Authenticated routes

A missing, expired, revoked, or idle-timed-out session returns `401` with
`code: "SESSION_INVALID"` and the `X-Session-Invalid: 1` header. The
`/logout` and snapshot routes also require the session to be live and the
token's `sub` to own the rows.

### `GET /me`

`200`:

```json
{
  "user": { "id": "user-1", "username": "Alice", "isAdmin": false },
  "serverTime": "2026-10-20T02:00:00.000Z",
  "apiVersion": 1
}
```

### `POST /logout`

Deletes the session row named by the token's `sid` (and only that row). A
token with no `sid` (the admin token) is a no-op. `200`:

```json
{ "ok": true }
```

### `GET /snapshot`

Returns the newest retained revision, or `404` `NO_SNAPSHOT` when the account
has never written one.

```json
{
  "id": "<revision id>",
  "createdAt": 1792461600,
  "data": { "cloud": 1, "iv": "...", "data": "..." }
}
```

`data` is exactly the JSON the client stored: the E2E-encrypted
`{cloud:1, iv, data}` bundle, a legacy plaintext payload, or any other JSON
value. The server does not inspect it.

### `GET /snapshots`

Metadata only, newest first:

```json
[{ "id": "<revision id>", "createdAt": 1792461600, "dataSize": 4096 }]
```

`dataSize` is the stored JSON length (characters; for the base64-encoded
bundles the client stores this equals bytes). At most five revisions are
retained per account.

### `GET /snapshot/:id`

One revision, same shape as `GET /snapshot`. A revision owned by another
account is `404` `NO_SNAPSHOT`, never `403` and never the row.

### `PUT /snapshot`

Stores `{ "data": <opaque JSON> }` as a new revision and prunes with the same
retention policy as `/api/content`. The 2 MiB body cap and the
`content-write:<userId>` rate limit (20/min) apply.

Optional conditional write:

- `If-Match: <baseRevisionId>` (or `X-HRT-Base-Revision: <baseRevisionId>`;
  a quoted or `W/`-prefixed id is accepted).
- `If-Match: *` requires that the account already has a revision.
- If supplied and the newest retained revision is different, the write is not
  performed and the response is `409`:

```json
{
  "code": "CONFLICT",
  "message": "Snapshot has changed; merge and retry",
  "current": { "id": "<newest id>", "createdAt": 1792461600 }
}
```

`current` is `null` if the account has no revisions. Without the header the
write is last-writer-wins; the CLI's optimistic loop reads the newest
revision, merges locally, writes conditionally, and refetches on `409`.

Success `201`:

```json
{ "id": "<new revision id>", "createdAt": 1792461600 }
```

Errors: `400 INVALID_REQUEST` (bad JSON or missing `data`), `413 TOO_LARGE`,
`429 RATE_LIMITED`, `409 CONFLICT`. The stream is cancelled as soon as it
passes 2 MiB. D1 also caps a stored string/row at 2,000,000 bytes; a payload
the database refuses for that reason is reported as `413 TOO_LARGE`, not a
500, even when it is just under the request cap.

## Error body

All errors are JSON:

```json
{ "code": "NO_SNAPSHOT", "message": "..." }
```

`code` is the machine-readable value. The CLI maps `SESSION_INVALID` to a
re-login and does not retry other 4xx responses blindly.

## What the server never does

- Decrypt a snapshot, derive the cloud key, or log the payload.
- Parse the payload beyond the outer `{ "data": ... }` request envelope.
- Store the `oyama-hrt-complete-backup` envelope; that is a local file format.
- Compute concentrations in v1.
