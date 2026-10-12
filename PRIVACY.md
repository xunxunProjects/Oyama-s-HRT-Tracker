# Privacy

[中文版](./PRIVACY.zh-CN.md)

This page describes what HRT Recorder Web stores, where, and who can read it.
Every statement here was checked against the code in this repository
(`worker.ts`, `migrations/`, `backupPolicy.ts`, `logic.ts`, `src/`). Points we
could not confirm from the code are marked **Unverified**.

"The server" means whoever runs the Worker you sign in to. For the public
instance that is this project's maintainer, on Cloudflare Workers (D1 database,
R2 object storage). If you use someone else's deployment, or run the Docker
image yourself, that operator is the one holding the data described below.

## Summary

| What | Where it lives | Can the server operator read it? |
| --- | --- | --- |
| Doses, lab results, weight, dose templates, model settings | Your browser (`localStorage`) | No, unless you turn on cloud backup or create a share link |
| Cloud backups | D1 `content` table | No. Encrypted on your device before upload |
| Share links | D1 `dosage_shares` table | **Yes.** Stored unencrypted so recipients can open them |
| Account (username, password hash, 2FA) | D1 `users`, `passkeys`, `backup_codes` | Username yes; password no (bcrypt hash only) |
| Signed-in devices | D1 `sessions` | Yes: IP address and browser user agent |
| Avatar | R2 bucket | Yes, and it is public to anyone who knows your username |

## Without an account

All records stay in your browser's `localStorage`. Nothing about your doses is
sent anywhere.

The app still talks to the server for two public, anonymous endpoints:
`/api/notice` (the site announcement banner, fetched when the app loads) and
`/api/transparency` (only when you open the Transparency page). These requests
carry no personal data, but like any web request they reveal your IP address to
Cloudflare and the server.

The page loads no third-party scripts, fonts, analytics or trackers. The
Content Security Policy set in `worker.ts` only allows scripts from the app's
own origin.

To delete local data, clear the site's data in your browser. The app also has
"clear all" actions for doses and lab results.

## Account

Creating an account stores in D1:

- **`users`**: a random user id, your username, a bcrypt hash of your password,
  creation time, and, if you enable an authenticator app, the TOTP secret and
  the last accepted code step. The TOTP secret is stored as is (not hashed),
  because the server needs it to check codes.
- **`passkeys`**: for each passkey, its credential id, public key, signature
  counter and the device name you gave it.
- **`backup_codes`**: HMAC hashes of your 2FA backup codes and when each was
  used. The codes themselves are not stored.
- **`sessions`**: one row per signed-in device with the browser user agent (up
  to 500 characters), the IP address it signed in from, and when it was created
  and last used. You can see and end these on the Sessions page.

Sessions expire 7 days after sign-in, or after 3 days without use. A scheduled
job runs every 6 hours and deletes expired sessions.

Your password is sent to the server over HTTPS when you register, sign in,
change it, or delete your account, so the server can check it. It is never
stored in readable form.

## Cloud backup

When cloud backup is on, the app uploads a full copy of your data a few seconds
after each change: doses, lab results, dose templates and deletion markers for
both modes, weight, and model parameter overrides.

**Encryption.** The copy is encrypted in your browser before upload, with
AES-256-GCM. The key is derived from your account password and your user id
using PBKDF2-SHA256 with 600,000 iterations (`deriveCloudKey` in `logic.ts`).
The derived key is cached in this browser's `localStorage` so you do not have to
re-enter your password; the password itself is not cached. If the device has no
key (for example after signing in with a passkey), the app refuses to upload
and asks you to unlock with your password instead of sending plaintext.

**What the server sees.** The ciphertext, its size, the time it was uploaded,
and which account it belongs to. The admin panel shows backup counts, sizes and
times, never contents.

**Limits of this protection.** It protects your backups if the database leaks
or is read by an administrator. It does not protect against a server operator
who deliberately changes the server or app code, because your password passes
through the server when you sign in and the app's code is served by the same
server. If you need protection against the operator, self-host.

**Changing your password** derives a new key. Backups encrypted under the old
key can no longer be decrypted by anyone, and are replaced by the next upload.

**Retention.** At most 5 backups are kept per account. After each upload the
server keeps the newest one plus roughly one from an hour, a day, a week and a
month earlier, and deletes the rest (`backupPolicy.ts`). Each backup is limited
to 2 MiB. You can delete individual backups from the Account page.

**Unverified: older backups.** Code comments in `src/utils/cloudBackup.ts`
record that earlier versions could upload a backup without encryption when no
key was available (passkey sign-in, or a non-HTTPS origin). Current versions
refuse. We cannot tell from the code which backups, if any, were stored that
way. If you used cloud backup with a passkey before late August 2026, deleting
your old backups from the Account page removes any such copy.

## Share links

A share link lets someone see your dosage history without an account. Share
links are **not end-to-end encrypted**: the server must be able to hand the
data to whoever opens the link, so it stores the data in readable form.

**What a link contains.** Your HRT mode, your time zone, every dose in that
mode (route, time, amount, ester and route-specific details such as patch wear
time), and the modelled concentration curve. Dose ids are replaced with random
ones. Lab results, weight, username, avatar and account details are not
included. The estradiol curve is the calibrated one, so it reflects your lab
results indirectly, but the lab values themselves are not sent.

**How the link works.** The server makes a random 32-byte token and stores only
its SHA-256 hash. The token is placed after `#` in the link, so browsers do not
send it in requests or `Referer` headers; the share page posts it in a request
body. Anyone who has the link can view the share. If you set a password, it is
stored as a bcrypt hash and viewers must enter it; wrong guesses are rate
limited.

**Who can see it.** Anyone with the link (and password, if set), and the server
operator, who can read the stored copy in the database.

**Expiry and deletion.** Every link must have an expiry, at most 365 days
ahead. When it expires, the scheduled job (every 6 hours) or the next visit
erases the dose data and password hash. A small record of the link's existence
stays so visitors see "expired" rather than "not found": its id, your user id,
the token hash, mode, live flag, and creation, update and expiry times. The 20
most recent expired records per account are kept; older ones are deleted.
Deleting a link yourself removes its whole row immediately. You can have at
most 20 active links.

**Live links.** A live link is refreshed with your latest doses while you are
signed in and the app is open. Each refresh updates the server copy and its
"last updated" time, which anyone with the link and password can see. People
who hold the link but not the password cannot see that time.

## Avatar

If you upload an avatar (JPEG or PNG, up to 5 MiB), it is stored in R2 under
your user id. It is served **publicly** at `/api/user/avatar/<username>` to
anyone who knows your username, without signing in. The app has no button to
remove an avatar without deleting the account; you can replace it, and an
administrator can delete it.

## What the administrator can see and do

If the deployment has an admin account, the admin panel shows each user's
username, sign-up time, whether 2FA is on, passkey count, and backup count,
total size and last backup time. The admin can rename users, reset passwords
(which ends all their sessions and makes existing backups unreadable), turn off
2FA, delete an avatar, delete backups, delete accounts, and post the site
announcement. The admin panel never shows TOTP secrets or backup contents.

Anyone with direct access to the database (the operator) can additionally read
everything the tables hold, including share link contents and session IPs.

## Public statistics

The Transparency page shows aggregate counts: total users and backups, sign-ups
in the last day and week, and account deletions by reason. It also lists the 10
most recent sign-ups as a 4-character fragment of the user id and the hour of
sign-up. No usernames are shown.

## Deleting your data

**Delete account** (Account page) requires your password, plus an
authenticator or backup code if TOTP is on. It immediately deletes your share
links, cloud backups, sessions, passkeys, backup codes, account row and avatar.

One anonymous row is then added to `deletion_log`: whether you or an admin
deleted the account, when the account was created, and when it was deleted. It
contains no user id or username and is kept for the Transparency statistics.

Data in your browser is not touched by account deletion; clear it in your
browser if you want it gone too.

**Unverified: infrastructure copies.** Cloudflare D1 keeps its own point-in-time
recovery history (Time Travel), and the hosted instance has Cloudflare Workers
observability turned on (`wrangler.toml`), which records request logs. How long
those copies and logs are kept is set by Cloudflare and the account plan, not by
this code. Deleted rows may remain in that history until it ages out.

## Rate limiting

Rate limits use Cloudflare's Workers Rate Limiting binding, keyed by IP address
or account. These counters live in Cloudflare's memory and are not written to
the database.

## Self-hosting

The Docker image runs the Worker, D1 and R2 locally, with data in `./data` on
your machine. It does not connect to the hosted instance's database or storage.
Everything above still applies, with you as the operator.

## Questions

Open an issue, or for security problems follow [SECURITY.md](./SECURITY.md).
