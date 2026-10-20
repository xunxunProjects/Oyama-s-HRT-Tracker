# F2F cohort service

The face-to-face (F2F) service is a separate keyring from `hrt-tool`'s backup
path. This document is the implementation contract for the server side. It is
deliberately narrower than the long-term design: public-key registration,
cohort/seat allocation, member discovery, and the 180-day retirement rule are
implemented; cohort escrow keys and the client key-generation/encryption flow
are the next milestones.

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
- The cohort escrow columns are reserved for an opt-in, operator-provisioned
  escrow key. No escrow private key is created, used, or returned by the API
  in this milestone.

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
  "cohort": { "id": "...", "state": "active" },
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
included. Reading this endpoint counts as cohort activity for the 180-day
rule.

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
deletion, the 100-seat rollover, and the 180-day retirement sweep.
