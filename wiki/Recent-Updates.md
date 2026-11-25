# Recent merged changes

This is a transparency report for the last 40 merged pull requests. It is a
factual index, not a security audit, a release note, or a claim that every change
is equally important.

> **Current release:** `v1.5.3` (2026-10-31) is a security patch release. It
> defaults `TRUSTED_IP_SOURCE` to `none`, writes that default from the Docker
> entrypoint, keeps `cf` for Cloudflare, and fails closed on an unknown value.
> It builds on `v1.5.2`, which caps share decompression at 20 MiB and disables
> Wrangler's Local Explorer in the Docker runtime. `main` is at 1.5.4 and
> contains unreleased security work (#292 and #321); there is no 1.5.4 tag yet.

- **Snapshot:** 2026-11-25
- **Window:** 2026-11-07 to 2026-11-25 (UTC)
- **Pull requests:** #283 to #334, 40 merged
- **Source:** GitHub pull request list, `state=merged`, sorted by merge time
- **Excluded:** pull requests closed without merging, drafts, and direct commits
  that never had a pull request

Only merged pull requests are listed. A closed or abandoned pull request is not
evidence of a change to the app, so it is out of scope for this report.

## At a glance

| Measure         | Value                             |
| --------------- | --------------------------------- |
| Merged PRs      | 40                                |
| Authors         | @SmirnovaOyama 23, @fantuanmtf 17 |
| Feature work    | 19                                |
| Fixes           | 10                                |
| Documentation   | 2                                 |
| Security-tagged | 2                                 |
| Refactors       | 3                                 |
| Performance     | 2                                 |
| Chores          | 2                                 |
| Release         | 0                                 |
| Date range      | 2026-11-07 to 2026-11-25          |

The type column is a light classification from the pull request title and scope.
It is not a review verdict. A fix can be security-relevant without carrying a
`security` prefix, and a documentation change can describe a security control.

## Security-relevant changes

The following merged changes are worth reading together with
[Security-Researchers](Security-Researchers). The list is based on titles and
touched areas, not on a fresh audit.

- **Unreleased security patches:** #292 adds step-up authentication for MFA,
  passkeys, recovery codes, and password changes; revoking an HRT device now
  deletes its paired session; paired tokens are bound to the device fingerprint
  and limited to the tool API; a global storage budget bounds D1 writes. #321
  removes the legacy plaintext share path, requires step-up for account
  deletion, makes admin sessions revocable, and requires a fresh admin password
  for destructive writes. Both are on `main` for 1.5.4, not in `v1.5.3`.
- **Availability of backup writes:** #298 keeps backups working when the storage
  budget migration has not been applied, instead of failing every write.
- **Admin controls:** #301 lets an administrator keep an account as a memorial;
  #286 polishes the admin page and fixes its scrolling on phones.
- **Offline and bundle surface:** #332 limits the install precache to the app
  shell and keeps `/api` responses out of Cache Storage; #334 keeps a lazy
  `index` chunk from being mistaken for the entry and installed eagerly; #325
  splits page bundles by route so an unvisited page is not downloaded at
  startup.
- **Type safety:** #324 enables TypeScript strict mode across the app and Worker.
- **Privacy guidance:** #295, #296, #297, and #312 expand and translate the OpSec
  guide, including network diagrams and self-justification traps.
- **Model integrity:** #282 adds a chemiluminescence assay and a PK
  cross-validation tool; #290 corrects numbers in the model demos; #308 and
  #310 settle the sublingual mucosal-exposure change.

## Merged pull requests

| Date (UTC) | Pull request                                                           | Author         | Type     | Change                                                                                         |
| ---------- | ---------------------------------------------------------------------- | -------------- | -------- | ---------------------------------------------------------------------------------------------- |
| 2026-11-25 | [#334](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/334) | @fantuanmtf    | fix      | fix(pwa): keep lazy index chunks out of the precache                                           |
| 2026-11-25 | [#333](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/333) | @fantuanmtf    | refactor | refactor(admin): split admin page into focused panels                                          |
| 2026-11-25 | [#332](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/332) | @fantuanmtf    | perf     | perf(pwa): precache only the app shell                                                         |
| 2026-11-25 | [#331](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/331) | @fantuanmtf    | refactor | refactor(app): split app shell into focused modules                                            |
| 2026-11-25 | [#330](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/330) | @fantuanmtf    | refactor | refactor(i18n): split translations into locale modules                                         |
| 2026-11-19 | [#328](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/328) | @SmirnovaOyama | feat     | Animate changing home readings with soft vertical motion                                       |
| 2026-11-19 | [#326](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/326) | @SmirnovaOyama | fix      | Fix transparency center layout and registration times                                          |
| 2026-11-18 | [#325](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/325) | @fantuanmtf    | perf     | perf(web): split page bundles by route                                                         |
| 2026-11-18 | [#324](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/324) | @fantuanmtf    | chore    | chore(types): enable TypeScript strict mode                                                    |
| 2026-11-17 | [#321](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/321) | @fantuanmtf    | security | fix(security): encrypt shares, require deletion step-up, and revoke admin sessions             |
| 2026-11-16 | [#319](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/319) | @fantuanmtf    | feat     | feat(pk): add allometric body-weight scaling to clearance                                      |
| 2026-11-16 | [#317](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/317) | @fantuanmtf    | feat     | feat(age): replace the under-19 clearance clamp with bands and a puberty ramp                  |
| 2026-11-15 | [#314](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/314) | @SmirnovaOyama | fix      | Keep the field lines when the browser fills a field in                                         |
| 2026-11-14 | [#313](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/313) | @SmirnovaOyama | chore    | Credits: new maintainer avatar                                                                 |
| 2026-11-14 | [#311](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/311) | @fantuanmtf    | feat     | feat(vote): accept donations via Monero and Trocador                                           |
| 2026-11-14 | [#312](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/312) | @fantuanmtf    | feat     | Add an OpSec scenario on self-justification traps                                              |
| 2026-11-12 | [#310](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/310) | @SmirnovaOyama | fix      | Revert "Give sublingual esters the same mucosal exposure as estradiol" (#309)                  |
| 2026-11-12 | [#309](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/309) | @SmirnovaOyama | feat     | Give sublingual esters the same mucosal exposure as estradiol                                  |
| 2026-11-12 | [#308](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/308) | @SmirnovaOyama | feat     | Let the mucosal share of sublingual estradiol fall at its own rate                             |
| 2026-11-11 | [#307](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/307) | @SmirnovaOyama | fix      | Slide the phone bottom bar away while reading down a page                                      |
| 2026-11-11 | [#306](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/306) | @SmirnovaOyama | feat     | Personal PK calibration: per-route levels, absorption speed, MCMC                              |
| 2026-11-11 | [#305](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/305) | @SmirnovaOyama | feat     | Make the lab test method a dropdown                                                            |
| 2026-11-11 | [#304](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/304) | @fantuanmtf    | docs     | docs: add PK model references to Credits                                                       |
| 2026-11-10 | [#300](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/300) | @SmirnovaOyama | feat     | Sync the calibration method and age beta between devices                                       |
| 2026-11-09 | [#301](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/301) | @SmirnovaOyama | feat     | Let admins keep an account as a memorial                                                       |
| 2026-11-09 | [#296](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/296) | @fantuanmtf    | feat     | feat(opsec): add Mermaid network guidance and protocol sections                                |
| 2026-11-09 | [#299](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/299) | @SmirnovaOyama | feat     | Let the device simulator show the app on the live site                                         |
| 2026-11-09 | [#298](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/298) | @SmirnovaOyama | fix      | Keep backups working when the storage budget migration is missing                              |
| 2026-11-09 | [#297](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/297) | @SmirnovaOyama | feat     | Translate the OpSec guide into every language and tidy its formatting                          |
| 2026-11-09 | [#295](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/295) | @fantuanmtf    | feat     | feat(opsec): expand high-threat, body-safety, and transmasculine guidance                      |
| 2026-11-08 | [#292](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/292) | @fantuanmtf    | security | Security fixes for 1.5.4: MFA step-up, HRT device revocation, storage budget                   |
| 2026-11-08 | [#291](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/291) | @SmirnovaOyama | feat     | Add Russian and Ukrainian                                                                      |
| 2026-11-08 | [#290](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/290) | @SmirnovaOyama | fix      | Fix wrong numbers in the model demos                                                           |
| 2026-11-08 | [#289](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/289) | @SmirnovaOyama | feat     | Move the Overview reading into the sidebar on wide short touch screens, add a device simulator |
| 2026-11-08 | [#287](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/287) | @SmirnovaOyama | fix      | Make the wide layout work with a touch laptop screen                                           |
| 2026-11-08 | [#288](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/288) | @SmirnovaOyama | fix      | Fit onboarding and the sidebar to wide short screens                                           |
| 2026-11-08 | [#286](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/286) | @SmirnovaOyama | fix      | Polish the admin page and fix its scrolling on phones                                          |
| 2026-11-08 | [#285](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/285) | @SmirnovaOyama | feat     | Glide the model explanation charts between states                                              |
| 2026-11-08 | [#284](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/284) | @SmirnovaOyama | feat     | Open the model explanation as an in-app page                                                   |
| 2026-11-07 | [#283](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/283) | @fantuanmtf    | docs     | docs: add optional donation addresses (Monero + BTC)                                           |

## How to refresh this page

The table is generated from GitHub, not maintained by hand. From a checkout with
`gh` authenticated:

```bash
gh pr list --repo xunxunProjects/Oyama-s-HRT-Tracker \
  --state merged --limit 100 \
  --json number,title,mergedAt,author,url \
  --jq 'sort_by(.mergedAt) | reverse | .[0:40]'
```

Take the 40 newest entries, keep the same columns, and update the snapshot date.
Do not include a pull request that was closed without merging, even if its title
looks important. If a change was made directly on `main` without a pull request,
say so in the release notes rather than inventing a row for it.

## What this page does not claim

- It does not claim that every change was independently reviewed or tested.
- It does not claim that the listed security changes are the only ones that
  matter; use the security advisory and `CHANGELOG.md` for the canonical record.
- It does not rank contributors. Pull request counts are not a measure of work,
  and many changes arrive through review, testing, translation, and design.
- It does not replace the release notes or the commit log.

Related pages: [Home](Home), [Developers](Developers),
[Security-Researchers](Security-Researchers), [Security](Security).
