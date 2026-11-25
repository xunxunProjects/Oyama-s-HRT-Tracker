# Security researchers

This page is for people testing the tracker: code review, a local lab, or a
permission-matrix exercise. It tells you which code to use, what was recently
fixed, and how to test without touching real data.

## Which version to use

Use the **latest commit on `main`**, not the release tag. Security fixes land on
`main` first. Check `git log -1` for the current commit and read `git log` and
`CHANGELOG.md` before you start so you know what is new. The latest release is
`v1.5.3` (2026-10-31). It changes `TRUSTED_IP_SOURCE` to default to `none`,
writes that default from the Docker entrypoint, keeps `cf` for Cloudflare, and
fails closed on an unknown value. It builds on `v1.5.2` (2026-10-30), which caps
decompressed share snapshots at 20 MiB, disables Wrangler's Local Explorer and
local observability APIs in the Docker runtime, and refreshes the npm and Rust
dependency trees. The VPS-native unit and proxy example in
[Deployment-VPS](Deployment-VPS) apply the same switches and block `/cdn-cgi/*`;
apply those lines if your unit predates them.

`main` is at 1.5.4 and contains security work that is **not in `v1.5.3`**:
step-up authentication for credential changes, HRT device revocation, a global
storage budget (#292), and encrypted-only shares with deletion step-up and
revocable admin sessions (#321). At the time of writing there is no `v1.5.4`
tag. If a deployment needs those fixes, wait for the 1.5.4 release; do not
deploy `main` to production.

Recent security-relevant changes:

| Date       | Change           | Why it matters                                                                                                          |
| ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 2026-11-17 | #321             | Plaintext share path removed, deletion needs step-up, admin sessions revocable and destructive writes re-authenticated  |
| 2026-11-08 | #292             | MFA/passkey/recovery/password step-up, device revocation deletes the paired session, global storage budget              |
| 2026-10-31 | `v1.5.3`         | Latest release; `TRUSTED_IP_SOURCE` defaults to `none`, Docker writes `none`, unknown values fail closed                |
| 2026-10-30 | `v1.5.2`         | Share-link decompression cap, Docker Local Explorer disabled, dependency refresh                                        |
| 2026-10-28 | `v1.5.1`         | Previous release; contains the two Low-severity fixes from 2026-10-22                                                   |
| 2026-10-22 | `40233a3` (#152) | `alg:none` JWTs now return 401 instead of 500; private session/2FA/passkey responses now send `Cache-Control: no-store` |
| 2026-10-22 | `2f5fd93` (#151) | Wiki and deployment documentation                                                                                       |
| 2026-10-14 | `v1.5.0`         | Previous release; predates the two Low-severity fixes above                                                             |
| 2026-10-21 | Tools #3         | Tools wiki and 0.1.1 release engineering                                                                                |

The latest release, `v1.5.3`, contains the IP-source default and builds on the
`v1.5.2` share and Docker mitigations. The 1.5.4 work above is only on `main`
until a tag is published. Do not deploy `main` to production just to pick up an
unreleased fix.

## Scope

In scope:

- the web app and PWA (`src/`), the Worker and its API (`worker.ts`,
  `src/server/routes/`, `toolApi.ts`, `contentStore.ts`, `f2f.ts`,
  `src/server/storageBudget.ts`), D1/R2 access, auth, sessions, shares, content,
  avatars, 2FA, passkeys, and admin routes;
- the Docker deployment and `hrt-server/` raw transport when enabled;
- the desktop wrapper (`src-tauri/`) where it handles URLs or files.

Out of scope:

- Cloudflare's own infrastructure and third-party hosting;
- denial of service, load testing, and brute force against a live instance;
- social engineering, physical access, and supply-chain attacks on npm,
  Cloudflare, or GitHub;
- data you do not own.

## Safe local lab

Run the app on loopback only. Never point a scanner at a public instance and
never use real medical data.

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
git checkout main

cp .env.docker.example .env
printf 'JWT_SECRET=%s\n' "$(openssl rand -base64 48)" >> .env
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d --build
# http://127.0.0.1:8787
```

The Compose file publishes `127.0.0.1:8787`, and the container's inner Worker
should bind `127.0.0.1` as well (`BIND_HOST=127.0.0.1`). For a completely
throwaway environment, use a dedicated Compose project name and a dedicated
volume, then remove them with `docker compose down -v` when finished. See
[Local-Tool](Local-Tool).

Create two normal accounts in the local instance and use synthetic data. Test
resource ownership with both accounts before testing admin behavior. If you
need an admin account, set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in the local
`.env`; never use a real administrator credential.

## What the 2026-10-22 audit covered

The audit used two local accounts, a permission matrix, and the twelve
categories in the project's test plan: authentication/access control, business
logic, API security, input/injection, configuration disclosure, session and
recovery, mass assignment, legacy/version differences, state machine, SSRF,
cache identity isolation, and error handling.

Results: no Critical or High findings. Two Low findings were reproduced and
fixed:

- **F1** — an `alg:none` JWT caused a 500 from the JWT library instead of a 401. Fixed in `0160cd2`; regression test `tests/workerHardening.test.ts`.
- **F2** — `GET /api/user/sessions`, `/api/user/2fa/status`, and
  `/api/user/passkeys` lacked cache headers. Fixed in `fe2c01d`; regression
  test `tests/privateCacheHeaders.test.ts`.

Not applicable, with evidence: SSRF (no user-controlled outbound fetch), SQL
injection (bound parameters or fixed fragments), and terminal escape injection
in the CLI (imported routes are allowlisted; free-form template names are never
printed). Email/phone recovery flows do not exist. The full matrix and evidence
are in the audit report; this page is a summary, not a claim of exhaustive
coverage.

## Later audit and hardening (November 2026)

A second, owner-authorized audit in November 2026 found one High and two Medium
issues, all fixed before 1.5.4:

- **H-1, legacy plaintext shares.** The share API still accepted and live-synced
  plaintext snapshots. It now rejects plaintext create and live-update requests,
  refuses and scrubs any remaining `encrypted = 0` row at access time, and
  migration `0018_purge_plaintext_shares.sql` expires and blanks old rows.
  Regression tests: `tests/shareEncryptionRequired.test.ts`.
- **M-3, password-only deletion.** A passkey-only account could be deleted with
  only the account password. Deletion now uses the same step-up check as other
  credential changes: a passkey-only account needs a backup code, a TOTP account
  needs a current code or backup code, and an account with no second factor
  still deletes with the password. Regression tests: `tests/stepUp.test.ts`.
- **M-4, non-revocable admin session.** Admin login now creates a revocable
  session, and destructive admin writes require a short-lived, session-bound
  `X-Admin-Reauth` token obtained by re-entering the admin password. Regression
  tests include `tests/toolInterface.test.ts`.

Also merged for 1.5.4: MFA and passkey step-up, device revocation that deletes
the paired session and binds the token to the device fingerprint and tool API,
and the global storage budget (`tests/storageBudget.test.ts`,
`tests/hrtPairing.test.ts`). A follow-up pull request for the remaining audit
findings is open at the time of writing; check its state rather than assuming it
is in `main`.

## Rules

- Test only systems you own or have written permission to test.
- Do not modify or delete real user data. Use a throwaway local volume.
- Do not run denial-of-service or high-volume scans.
- Stop if a tool tries to contact a host other than your loopback lab.
- If you find a vulnerability, report it privately; do not open a public issue
  with exploit details.

## Reporting

Use the repository's private advisory form:
<https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/security/advisories/new>.
The policy in `SECURITY.md` promises an acknowledgement within 7 days and
accepts reports in English or Chinese. Include the commit, prerequisites,
request/response evidence, impact, and a minimal reproduction. See
[Security-Reporting](Security-Reporting) for severity-specific report templates,
and [Security](Security) for self-hosting hardening and the disclosure policy.

## Related pages

- [Architecture](Architecture) — components, request flow, trust boundaries
- [Developers](Developers) — local setup and API conventions
- [Local-Tool](Local-Tool) — loopback-only container setup
- [Security](Security) — operator hardening and reporting
