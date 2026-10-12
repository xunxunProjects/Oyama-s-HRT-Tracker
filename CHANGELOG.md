# Changelog 更新日志

Notable changes to this project. Full release notes for each version are on the
[GitHub releases page](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases).

本文件记录项目的重要变更。每个版本的完整更新说明见
[GitHub Releases](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases)。

---

## Unreleased 未发布

- Added a contributing guide, a code of conduct, issue and pull request
  templates, and a vulnerability reporting policy in `SECURITY.md`. The security
  history that used to live there moved into this file.

  新增贡献指南、行为准则、issue 与 PR 模板，并将 `SECURITY.md` 改写为漏洞报告政策；
  原先其中的安全改进记录移至本文件。

## 1.4.2

- The desktop app can sign in again: API calls go to `VITE_API_ORIGIN` instead
  of resolving against the app's own protocol.
- Trackpad scrolling in Safari and the macOS app no longer waits on a
  non-passive wheel listener.
- Desktop icons regenerated from the current PWA icon.
- macOS builds are ad-hoc signed, and signed and notarized when Apple Developer
  ID secrets are configured.

## 1.4.1

- CI typechecks and builds every pull request and push to `main`, and checks
  that every file carries the same version.
- Pushing a `vX.Y.Z` tag on `main` builds the macOS and Windows installers and
  publishes a GitHub release.
- CodeQL scanning and weekly Dependabot updates.

---

## Earlier security hardening 早期安全加固

These changes were made before 1.4.1 and were previously listed in
`SECURITY.md`.

以下改进完成于 1.4.1 之前，原先记录在 `SECURITY.md` 中。

- **JWT secret validation.** The Worker used to fall back to a hardcoded secret
  when `JWT_SECRET` was unset. `validateJWTSecret()` now refuses to start
  without a secret, with one shorter than 32 characters, or with a known weak
  value.
- **Timing attack protection.** Admin credentials are compared with a
  constant-time `timingSafeEqual()` instead of `===`.
- **Rate limiting.** Login and registration are rate limited per client and
  return HTTP 429 with `Retry-After` when the limit is hit. This started as an
  in-memory limiter and now uses Cloudflare Workers rate limiting bindings
  (see `wrangler.toml`).
- **Input validation.** Usernames must be 3 to 30 characters of letters, digits,
  `_` or `-`; passwords must be 8 to 128 characters.
- **Content-Type validation.** JSON endpoints reject requests without a JSON
  `Content-Type`.
- **Username enumeration protection.** A wrong username and a wrong password
  both return the same "Invalid credentials" error.
- **Response headers.** JSON responses always carry
  `Content-Type: application/json`.
