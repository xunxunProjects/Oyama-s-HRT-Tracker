# Changelog 更新日志

Notable changes to this project. Full release notes for each version are on the
[GitHub releases page](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases).

本文件记录项目的重要变更。每个版本的完整更新说明见
[GitHub Releases](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases)。

---

## Unreleased 未发布

- Made the app friendlier to use without changing its look. The system Back
  gesture now steps back through pages instead of leaving the app. A new dose
  starts on the drug and route used last. Confirms say what they will delete or
  replace, and import warns before it replaces records. History, the Overview
  plan and empty pages use the app's own drawings to tell doses and next steps
  apart. Tapping the running-low line opens Supplies, tapping a chart shows its
  values, and Labs lists results above the plot. The Labs tab is now named
  "Labs" (检查) to match its page.

  在不改变外观的前提下让应用更好用：手机的返回手势会一层层退回，不再直接离开应用；新增剂量
  沿用上一次的药物和途径；确认框写清楚要删除或替换的内容，导入覆盖记录前会先提醒；用药记录、
  概览方案和空页面用应用自己的插画区分药物和下一步；点「快用完」那行直接进药量库存，点曲线能
  看到数值，检查页把结果列在图的上面；底部导航的「校准」改名为「检查」，与页面标题一致。
- Added a contributing guide, a code of conduct, issue and pull request
  templates, and a vulnerability reporting policy in `SECURITY.md`. The security
  history that used to live there moved into this file.

  新增贡献指南、行为准则、issue 与 PR 模板，并将 `SECURITY.md` 改写为漏洞报告政策；
  原先其中的安全改进记录移至本文件。
- Added unit tests for the dose and concentration math in `logic.ts`
  (`npm test`, run in CI). Problems they found, and gaps against published
  data, are recorded as expected failures under `tests/`; no calculation
  changed.

  新增 `logic.ts` 剂量与浓度计算的单元测试（`npm test`，已加入 CI）。
  测试中发现的问题以及与文献数据的差距，以预期失败的形式记录在 `tests/` 中，计算结果没有改动。
- Fixed the calculation problems those tests recorded. Patch removals end the
  patch that is actually on. The current level right after an oral or
  sublingual dose is no longer read off a coarse grid. Lab calibration reports
  the clearance it draws. Dose reminders read each injection ester on its own
  schedule and group doses by local day. Swallowed estradiol now goes through
  an estrone pool, so oral and sublingual levels no longer fall to almost zero
  between doses. Oral cyproterone acetate follows the Androcur label (100 mg
  peaks at about 285 ng/mL). Testosterone injections follow the Xyosted, Aveed
  and Nebido labels (100 mg/week of cypionate or enanthate averages about
  740 ng/dL instead of 430). Sublingual absorption is unchanged.

  修正了这些测试记录下的计算问题：贴片的移除记录会配给真正贴着的那一片；口服和舌下给药后的
  当前浓度不再从稀疏网格上读取；化验校准报告的清除率与画出的曲线一致；剂量提醒按每种注射酯
  各自的周期计算，并按本地日期分组；吞下的雌二醇改为经过雌酮储库，口服与舌下在两次服药之间
  不再降到接近零；口服醋酸环丙孕酮按 Androcur 说明书计算（100 mg 峰值约 285 ng/mL）；
  睾酮注射按 Xyosted、Aveed 与 Nebido 说明书校准（每周 100 mg 环戊丙酸或庚酸睾酮平均约
  740 ng/dL，原为 430）。舌下吸收参数未改。

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
