# F2F cohort service

The face-to-face (F2F) service is a separate keyring from `hrt-tool`'s backup
path. This document is the implementation contract for the server side.
Public-key registration, cohort/seat allocation, member discovery, the
180-day retirement rule, and **operator-provisioned cohort escrow keys** are
implemented. The client key-generation/encryption flow is the next
milestone.

## Trust model

- Each user generates their own OpenPGP key pair on their own device. The
  private key never reaches the server.
- The server stores the armored **public** key, its fingerprint, and the
  member's seat. It never stores a user's private key.
- Members verify each other's fingerprints out of band (face to face). The
  directory is a distribution aid, not a trust root.
- The server does not cryptographically validate the uploaded key yet: it
  checks the armor framing, size, and fingerprint format. A member must not
  treat a key as authentic until the fingerprint has been verified in person.
- Escrow is opt-in. An operator generates a cohort OpenPGP key pair offline
  and provisions it through a service-token endpoint. The server stores the
  public key and an AES-GCM envelope of the private key under
  `HRT_ESCROW_KEY`; members receive only the public key. No API returns the
  private key, and no recovery/decryption endpoint is exposed yet.
- Without escrow, members encrypt only to each other's public keys. With
  escrow, a sender may encrypt an additional copy to the cohort escrow key.

## Cohorts and seats

- A cohort ("bus") has exactly 100 numbered seats.
- A new member takes the lowest seat with no row. A deleted account leaves a
  tombstone row with `status = 'deleted'`; that seat is **never reused**.
- A cohort becomes `full` when all 100 seats have rows, including tombstones.
  The next member starts a new cohort.
- Cohorts move `active` → `full` → `retired`. The scheduled sweep retires an
  active or full cohort after **180 days** with no key or keyring activity.
  Retired cohorts take no new members but remain readable by their members.
- A cohort with no activity is not deleted here. Escrow-key deletion, when
  escrow exists, is a separate longer-retention job.

## Data model

`migrations/0010_f2f_cohorts.sql`:

- `f2f_cohorts(id, state, created_at, last_used_at, retired_at, revoked_at,
escrow_public_key, escrow_private_key_encrypted, escrow_fingerprint)`
- `f2f_seats(cohort_id, seat 1..100, user_id UNIQUE, status
active|deleted, created_at, updated_at, deleted_at)`
- `f2f_keys(id, user_id, cohort_id, seat, fingerprint UNIQUE, public_key,
status active|retired|revoked, created_at, updated_at, retired_at,
revoked_at)`

`migrations/0011_f2f_escrow.sql`:

- `f2f_escrow_keys(id, public_key, private_key_encrypted, fingerprint UNIQUE,
state available|assigned|retired|deleted, cohort_id, created_at,
assigned_at, retired_at)`

A user has at most one seat. A user may rotate keys without moving seats; the
previous active key becomes `retired` and remains readable. A revoked key
cannot become active again, and its fingerprint is never reused.

Account deletion (self-service or admin) marks the seat `deleted`, revokes the
user's keys, clears the stored public-key material, and keeps the fingerprint
as a tombstone.

## HTTP API

All routes require the normal web session (`Authorization: Bearer ...`) and
are served under the same auth, session-idle, and security-header middleware as
the rest of the app.

### `GET /api/f2f/status`

```json
{
  "registered": true,
  "cohort": { "id": "...", "state": "active", "memberCount": 2, "totalSeats": 2 },
  "seat": 1,
  "escrow": {
    "publicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----...",
    "fingerprint": "40-or-64-hex"
  },
  "key": {
    "id": "...",
    "fingerprint": "40-or-64-hex",
    "publicKey": "-----BEGIN PGP PUBLIC KEY BLOCK-----...",
    "status": "active",
    "createdAt": 1760000000
  }
}
```

`registered` is `false` when the account has no active seat.

### `POST /api/f2f/keys`

```json
{ "public_key": "-----BEGIN PGP PUBLIC KEY BLOCK-----...", "fingerprint": "40-or-64-hex" }
```

Assigns a seat on the first upload, or reuses the caller's existing seat on
rotation. The previous active key is retired. Re-uploading the same active
fingerprint is idempotent. Errors: `INVALID_KEY`, `KEY_EXISTS`, `KEY_LIMIT`,
`SEAT_DELETED`.

### `POST /api/f2f/keys/retire` and `/api/f2f/keys/revoke`

```json
{ "key_id": "uuid" }
```

Only the key's owner can change it. Retiring an already-retired key is
idempotent; revoking is final. A revoked key cannot be retired.

### `GET /api/f2f/cohorts/:id/members`

Only an active member of that cohort may call it. Returns active seats and
their `active`/`retired` keys:

```json
{
  "cohort": {
    "id": "...",
    "state": "active",
    "escrow": { "publicKey": "…", "fingerprint": "…" }
  },
  "members": [
    {
      "seat": 1,
      "username": "Alice",
      "keys": [{ "fingerprint": "…", "publicKey": "…", "status": "active", "createdAt": 1760000000 }]
    }
  ]
}
```

Deleted seats and revoked or empty keys are omitted. The caller's own seat is
included. `cohort.escrow` is `null` when the cohort has no escrow key.
Reading this endpoint counts as cohort activity for the 180-day rule.

### Escrow provisioning (service token)

These routes require `x-hrt-service: <HRT_SERVICE_TOKEN>` and never accept a
web session.

`POST /api/tool/v1/f2f/escrow/keys`

```json
{
  "public_key": "-----BEGIN PGP PUBLIC KEY BLOCK-----...",
  "private_key": "-----BEGIN PGP PRIVATE KEY BLOCK-----...",
  "fingerprint": "40-or-64-hex"
}
```

The private key is encrypted with AES-GCM under `HRT_ESCROW_KEY`
(`v1.<iv>.<ciphertext>`) before it is stored. Fingerprints are unique.
Errors: `INVALID_KEY`, `KEY_EXISTS`, `ESCROW_UNAVAILABLE`.

`GET /api/tool/v1/f2f/escrow/status` returns counts by state and a metadata
list (id, fingerprint, state, cohort id, timestamps). It never returns the
encrypted private key.

### Operator workflow

Generate a cohort escrow key offline, then provision it before enabling
escrow or creating the next cohort:

```sh
gpg --batch --passphrase '' --quick-generate-key 'HRT F2F escrow' future-default default never
FPR=$(gpg --list-keys --with-colons 'HRT F2F escrow' | awk -F: '/^fpr:/ {print $10; exit}')
gpg --armor --export "$FPR" > escrow-public.asc
gpg --armor --export-secret-keys "$FPR" > escrow-private.asc
jq -n --rawfile pub escrow-public.asc --rawfile priv escrow-private.asc \
  --arg fpr "$FPR" '{public_key:$pub, private_key:$priv, fingerprint:$fpr}' \
  | curl -fsS -X POST "$APP/api/tool/v1/f2f/escrow/keys" \
      -H "x-hrt-service: $SERVICE_TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

`HRT_F2F_ESCROW=1` makes each new cohort reserve one available key. If the
pool is empty or `HRT_ESCROW_KEY` is missing, the membership request fails
with `ESCROW_UNAVAILABLE` instead of silently creating a non-escrowed
cohort. Existing cohorts are not retrofitted. Keep `HRT_ESCROW_KEY` backed
up: losing it makes the stored escrow private keys unrecoverable.

## Operational rules

- The scheduled worker job calls `sweepF2fCohorts`: active/full cohorts with
  `last_used_at` older than 180 days become `retired`.
- The raw `hrt://` transport is unrelated to this service; F2F key management
  uses the normal HTTPS API. Do not put private keys in either transport.
- Cloudflare Workers and the Docker image share the same D1 schema and
  handlers. The service does not require the optional raw server.
- Exact abuse thresholds, key caps, and retention values live in code and are
  not a security boundary.

## Tests

`tests/f2f.test.ts` covers seat assignment, cohort sharing, member listing,
rotation, malformed keys, ownership, tombstone behavior after account
deletion, the 100-seat rollover, the 180-day retirement sweep, escrow
provisioning and encryption-at-rest, escrow cohort assignment, empty-pool
failure, and service-token authentication.
