# OpenPGP backup format

This is the file the site writes under Settings > Export > OpenPGP. It is meant to be read by any OpenPGP tool (GnuPG, Sequoia, Kleopatra) and by the offline recovery tool. The site only ever sees the public key; the private key stays with its owner, and the server never sees the backup or the key.

## The file

- Name: `hrt-backup-YYYY-MM-DD.json.asc` (the date is the export date, UTC).
- Content: one ASCII-armored OpenPGP message (`-----BEGIN PGP MESSAGE-----`), as written by OpenPGP.js 6.
- Encrypted to exactly one recipient: the public key the user pasted, using its current encryption subkey (or the primary key if that is the one that can encrypt). Ciphers follow the key's preferences; OpenPGP.js defaults to AES-256 with integrity protection (SEIPD).
- Not signed. The site holds no private key, so it cannot sign. Integrity comes from the OpenPGP integrity check plus the `payloadSha256` field below.
- Not compressed.
- The literal data packet is named `hrt-backup.json` and holds UTF-8 text.

Decrypting it gives the envelope below, for example with `gpg --decrypt hrt-backup-2026-10-18.json.asc > hrt-backup.json`.

## The envelope (decrypted plaintext)

A UTF-8 JSON object:

```json
{
  "format": "oyama-hrt-backup",
  "version": 1,
  "createdAt": "2026-10-18T16:00:00.000Z",
  "app": "1.5.0",
  "recipient": "0123456789ABCDEF0123456789ABCDEF01234567",
  "payloadSha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "payload": "{\n  \"meta\": { \"version\": 2, ... }\n}"
}
```

| Field           | Type   | Meaning                                                                                                 |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| `format`        | string | Always `oyama-hrt-backup`. Anything else is not this format.                                            |
| `version`       | number | Envelope version, `1` for now. A reader refuses a version it does not know.                             |
| `createdAt`     | string | When the backup was made, ISO 8601 in UTC.                                                              |
| `app`           | string | The app version that wrote it, from package.json. Informational.                                        |
| `recipient`     | string | Fingerprint of the primary key it was encrypted to, uppercase hex with no spaces (40 or 64 characters). |
| `payloadSha256` | string | SHA-256 of `payload`, taken over its UTF-8 bytes, lowercase hex.                                        |
| `payload`       | string | The backup itself: the exact text of the plain JSON export (see below), kept as a string.               |

`payload` is a string rather than a nested object so the checksum covers exact bytes and no reader has to agree on how to re-serialise JSON.

A reader checks, in this order: `format`, then `version`, then that `payloadSha256` matches the SHA-256 of `payload`, then that `payload` parses as JSON. A failure at any step means the file is damaged or is not a backup, and nothing is restored.

## The payload

`payload` is the same JSON the site writes for Settings > Export > JSON, so anything that restores a plain export restores this too. Its shape today (`meta.version` 2):

```json
{
  "meta": { "version": 2, "exportedAt": "2026-10-18T16:00:00.000Z" },
  "mode": "transfem",
  "weight": 60,
  "weightUpdatedAt": 1760803200000,
  "modes": {
    "transfem": { "events": [], "labResults": [], "doseTemplates": [], "deletions": {} },
    "transmasc": { "events": [], "labResults": [], "doseTemplates": [], "deletions": {} }
  },
  "events": [],
  "labResults": [],
  "doseTemplates": [],
  "pkParams": null
}
```

`modes` holds both HRT modes; the flat `events`, `labResults` and `doseTemplates` mirror the active `mode` for older readers. The record shapes are the ones in `logic.ts` (`DoseEvent`, `LabResult`) and `src/hooks/useAppData.ts` (`DoseTemplate`). The importer in `useAppData.ts` (`processImportedData`) is the reference for what is accepted; new fields may appear and readers should keep what they do not understand.

## Restoring

- On the site: decrypt the file with an OpenPGP tool or the offline recovery tool, then import the result under Settings > Import. The site accepts either the envelope (it checks it as above first) or the bare payload. It refuses the still-encrypted `.asc` file and says why, because it has no private key.
- Offline: the recovery tool decrypts with the local private key, runs the checks above, and can show or save `payload` as a plain JSON export.

## Keys

- Any OpenPGP public key that can encrypt and has not expired or been revoked: Curve25519 (v4 or v6) or RSA of 2048 bits or more.
- The site keeps the key on this device only (browser storage) and shows its fingerprint in groups of four. When a different key is pasted later, it shows both fingerprints and asks before replacing it, so a swapped key does not go unnoticed.
- Pasting a private key is refused, and it is never stored.
