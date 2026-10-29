# Recent merged changes

This is a transparency report for the last 40 merged pull requests. It is a
factual index, not a security audit, a release note, or a claim that every change
is equally important.

> **Current release:** `v1.5.2` (2026-10-30) is a security patch release. It
> caps decompressed share snapshots at 20 MiB, disables Wrangler's Local
> Explorer and local observability APIs in the Docker runtime, and refreshes the
> npm and Rust dependencies. The detailed table below remains the 1.5.1
> snapshot.

- **Snapshot:** 2026-10-28
- **Window:** 2026-10-18 to 2026-10-28 (UTC)
- **Pull requests:** #122 to #175, 40 merged
- **Source:** GitHub pull request list, `state=merged`, sorted by merge time
- **Excluded:** pull requests closed without merging, drafts, and direct commits
  that never had a pull request

Only merged pull requests are listed. A closed or abandoned pull request is not
evidence of a change to the app, so it is out of scope for this report.

## At a glance

| Measure             | Value                             |
| ------------------- | --------------------------------- |
| Merged PRs          | 40                                |
| Authors             | @fantuanmtf 23, @SmirnovaOyama 17 |
| Feature work        | 12                                |
| Fixes               | 13                                |
| Documentation       | 7                                 |
| Security-tagged     | 5                                 |
| Release             | 1                                 |
| Chores / governance | 2                                 |
| Date range          | 2026-10-18 to 2026-10-28          |

The type column is a light classification from the pull request title and scope.
It is not a review verdict. A fix can be security-relevant without carrying a
`security` prefix, and a documentation change can describe a security control.

## Security-relevant changes

The following merged changes are worth reading together with
[Security-Researchers](Security-Researchers). The list is based on titles and
touched areas, not on a fresh audit.

- **Release and signing:** #175 documents release signing and key custody;
  #165 is the 1.5.1 release, which contains the two Low-severity fixes from
  2026-10-22.
- **Worker and sessions:** #152 refuses `alg:none` tokens and stops private
  responses from being cached; #122 gives passkey sign-ins a device pass;
  #135 hardens auth throttling and request bodies.
- **Dependencies and runtime:** #155 patches the Node runtime and dependency
  advisories; #156 hardens auth headers and Rust dependencies.
- **F2F and key material:** #147 validates uploaded keys and rate-limits F2F
  routes; #141 adds signed device requests to the raw transport; #142, #143,
  #144, and #148 add the F2F cohort, escrow, keyring export, and one-time CLI
  login codes.
- **Regression fixes:** #162 hardens the calibration axes and fixes security
  regressions found after the first 1.5.1 build.
- **Tool API and backups:** #133 and #134 add and bound the `hrt-tool` API;
  #129 adds verified device backup export/import.
- **Docs:** #123 corrects the entropy figure that assumes every character is
  random; #171 and #173 document the F2F keyring setup.

## Merged pull requests

| Date (UTC) | Pull request                                                           | Author         | Type     | Change                                                                           |
| ---------- | ---------------------------------------------------------------------- | -------------- | -------- | -------------------------------------------------------------------------------- |
| 2026-10-28 | [#175](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/175) | @fantuanmtf    | docs     | docs(security): document release signing and key custody                         |
| 2026-10-28 | [#174](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/174) | @SmirnovaOyama | chore    | chore: stop tracking tsconfig.tsbuildinfo                                        |
| 2026-10-28 | [#173](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/173) | @SmirnovaOyama | docs     | F2F how-to: say what to replace in each command; Turkish strings back in Turkish |
| 2026-10-27 | [#168](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/168) | @SmirnovaOyama | fix      | fix(f2f): keep the CLI login code on one line on phones                          |
| 2026-10-27 | [#166](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/166) | @SmirnovaOyama | fix      | Calm the add buttons: cross-fade to Cancel                                       |
| 2026-10-27 | [#167](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/167) | @SmirnovaOyama | fix      | Records page: pinned day label no longer overlaps an open record                 |
| 2026-10-27 | [#171](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/171) | @SmirnovaOyama | docs     | F2F keyring: a how-to for people new to OpenPGP                                  |
| 2026-10-27 | [#170](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/170) | @SmirnovaOyama | fix      | 1.5.1 follow-ups: no frozen page moves, prompts in the right place               |
| 2026-10-27 | [#165](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/165) | @SmirnovaOyama | release  | Oyama Tracker 1.5.1: drawn by hand, no pop-ups, a motion system                  |
| 2026-10-27 | [#164](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/164) | @SmirnovaOyama | fix      | fix(ui): keep buttons the same size while busy or after copying                  |
| 2026-10-27 | [#162](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/162) | @fantuanmtf    | fix      | fix: harden calibration axes and security regressions                            |
| 2026-10-27 | [#158](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/158) | @SmirnovaOyama | fix      | fix(f2f): explain missing migrations and polish the keyring page                 |
| 2026-10-25 | [#160](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/160) | @fantuanmtf    | fix      | fix(overview): read drifting doses as one regimen (#159)                         |
| 2026-10-23 | [#157](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/157) | @fantuanmtf    | feat     | feat(deploy): add dependency checker and Docker installer                        |
| 2026-10-23 | [#156](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/156) | @fantuanmtf    | security | security: harden auth headers and Rust dependencies                              |
| 2026-10-23 | [#155](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/155) | @fantuanmtf    | security | security(deps): patch Node runtime and dependency advisories                     |
| 2026-10-23 | [#154](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/154) | @fantuanmtf    | feat     | feat(share): allow links to expire through 2100                                  |
| 2026-10-22 | [#153](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/153) | @fantuanmtf    | docs     | docs(wiki): add persona-based entry points and deployment guides                 |
| 2026-10-22 | [#152](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/152) | @fantuanmtf    | security | fix(worker): harden token verification and private response caching              |
| 2026-10-22 | [#151](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/151) | @fantuanmtf    | docs     | docs(wiki): add the usage, deployment, dependency, and security guides           |
| 2026-10-21 | [#150](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/150) | @fantuanmtf    | docs     | docs: link the hrt-tool command-line client                                      |
| 2026-10-20 | [#149](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/149) | @fantuanmtf    | fix      | fix: address website smoke-test findings                                         |
| 2026-10-20 | [#148](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/148) | @fantuanmtf    | feat     | feat(f2f): add one-time CLI login codes                                          |
| 2026-10-20 | [#147](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/147) | @fantuanmtf    | security | fix(f2f): validate uploaded keys and rate-limit F2F routes                       |
| 2026-10-20 | [#144](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/144) | @fantuanmtf    | feat     | feat(f2f): export a GPG-importable cohort keyring                                |
| 2026-10-20 | [#143](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/143) | @fantuanmtf    | feat     | feat(f2f): add operator-provisioned cohort escrow keys                           |
| 2026-10-20 | [#142](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/142) | @fantuanmtf    | feat     | feat(f2f): add the face-to-face cohort registry                                  |
| 2026-10-20 | [#141](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/141) | @fantuanmtf    | feat     | feat(hrt): add the self-hosted raw transport with signed device requests         |
| 2026-10-20 | [#125](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/125) | @SmirnovaOyama | feat     | Age adjustment (beta): year of birth scales estradiol and testosterone clearance |
| 2026-10-20 | [#138](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/138) | @SmirnovaOyama | feat     | Age adjustment (beta), brought up to date with main (replaces #125)              |
| 2026-10-20 | [#137](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/137) | @SmirnovaOyama | fix      | Tidy float tails off stored doses, and pin down the v2 export's flat copy        |
| 2026-10-20 | [#132](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/132) | @SmirnovaOyama | feat     | feat: say whether a complete backup came from this account                       |
| 2026-10-19 | [#136](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/136) | @fantuanmtf    | fix      | fix(ui): correct the lab calibration exclusion message                           |
| 2026-10-19 | [#135](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/135) | @fantuanmtf    | security | fix(security): harden deployment, auth throttling and request bodies             |
| 2026-10-19 | [#134](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/134) | @fantuanmtf    | fix      | fix: bound tool snapshot body reads and map D1 row limits                        |
| 2026-10-19 | [#133](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/133) | @fantuanmtf    | feat     | feat: add hrt-tool /api/tool/v1 interface                                        |
| 2026-10-19 | [#129](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/129) | @fantuanmtf    | feat     | feat: complete device backup export/import with verification preview             |
| 2026-10-19 | [#130](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/130) | @SmirnovaOyama | chore    | Add fantuanmtf as a maintainer                                                   |
| 2026-10-18 | [#123](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/123) | @SmirnovaOyama | docs     | Say which entropy figure assumes every character is random                       |
| 2026-10-18 | [#122](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/pull/122) | @SmirnovaOyama | fix      | Give passkey sign-ins a device pass too                                          |

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
