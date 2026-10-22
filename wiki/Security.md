# Security

This app stores health information. Treat a deployment as sensitive even when
the data is encrypted, and keep the server and its database private.

## Reporting a vulnerability

Do **not** open a public issue, discussion, or pull request for a security
problem. Use GitHub's private advisory form:

<https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/security/advisories/new>

Include the version or deployment, reproduction steps, and what an attacker
could do. Use test accounts and sample data; never access data that is not
yours. Reports can be written in English or Chinese.

The maintainers aim to acknowledge a report within seven days, fix confirmed
problems with a regression test, and publish an advisory once users can
update. Please allow a reasonable window before public disclosure. The full
policy, scope, and supported versions are in
[`SECURITY.md`](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/blob/main/SECURITY.md).

For the command-line tools, use the Tools repository's advisory form; its
security model is documented in the Tools wiki.

## What the server can see

- **Accounts and sessions.** Usernames, password hashes, session records, and
  login metadata are stored server-side.
- **Encrypted backups and shares.** The browser encrypts them before upload,
  and the key is kept by the user or carried in the share link. The server
  stores ciphertext it is not designed to read.
- **Avatars.** Stored in R2 and served as content.
- **Optional F2F material.** Cohort and escrow records exist only when the
  operator enables F2F; escrow private keys are encrypted with an operator key.
- **Metadata.** The server still learns who has an account, when they sign in,
  and how large their encrypted payloads are. Encryption does not hide that.

Dose records, labs, weight, and the model run in the browser by default. If a
user exports a backup, the file is their responsibility.

## Hardening a self-hosted deployment

The deployment pages carry the exact commands; this is the checklist.

- [ ] Generate `JWT_SECRET` with `openssl rand -base64 48`, store it as a
      secret, and never commit it. Changing it invalidates every session.
- [ ] Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` together or not at all, with a
      unique password. A username alone only reserves the name.
- [ ] Serve the app over HTTPS. Passkeys, installation, and offline use require
      a secure context.
- [ ] Keep the app port on loopback and put a TLS-terminating proxy (or a
      Tor/I2P daemon) in front. Do not expose `:8787` directly.
- [ ] Set `TRUSTED_IP_SOURCE` to match the proxy, and make the proxy overwrite
      the client-address header. Otherwise clients can choose their own
      address, or every visitor shares one rate-limit bucket.
- [ ] Set `PUBLIC_APP_ORIGIN` when the proxy changes the `Host` header.
- [ ] If `hrt://` is enabled, keep the certificate, key, and service token at
      mode `600`, publish the raw port only where clients need it, and use a
      long random token.
- [ ] If F2F escrow is enabled, back up the escrow key. Without it, stored
      escrow private keys cannot be recovered.
- [ ] Own `./data` with uid 1000, keep it readable only by the operator, and
      back it up with the container stopped.
- [ ] Do not run with `ENVIRONMENT=development` on a public instance.
- [ ] Treat backups and exports as medical data even though they are encrypted.
- [ ] Keep up with releases. Dependabot and CodeQL watch the repository, and
      fixes ship in new versions.

The Worker sends a strict Content-Security-Policy with `script-src 'self'`.
Cloudflare features that inject scripts (Web Analytics, the JS
detection/challenge bootstrap) are blocked by it; disable them for the zone or
add a nonce/hash. Do not weaken the policy with `'unsafe-inline'`.

## Rate limiting and abuse

The Worker declares per-minute rate-limit classes and applies them per endpoint
and, where possible, per account and client address. In the Docker deployment
the binding depends on the local runtime; treat local enforcement as
best-effort and put connection limits at the proxy as well. Rate limits reduce
brute force and bulk abuse; they are not an authorization boundary.

## If something goes wrong

1. Rotate `JWT_SECRET` to invalidate sessions, then rotate the administrator
   password and any `hrt://` service token.
2. If a backup or share key may have leaked, tell affected users to rotate the
   share and re-create the backup; rotating the server secret does not re-encrypt
   payloads.
3. Preserve logs and the affected database before cleaning up, and follow the
   private advisory process above.
4. Restore from a known-good backup if data was modified. Do not delete
   evidence before the impact is understood.

## Scope and honesty

There has been no independent third-party security audit of this project.
The absence of a published advisory is not proof that the code is free of
problems. Dependency alerts cover known CVEs in libraries, not logic flaws in
this application. The security model is described in the code and in the Tools
wiki; treat claims there as design intent, and verify them for your deployment.

Related pages: [Deployment](Deployment),
[Docker](Deployment-Docker),
[Cloudflare Workers](Deployment-Cloudflare),
[Local development](Deployment-Local).
