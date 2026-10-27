# Changelog 更新日志

Notable changes to this project. Full release notes for each version are on the
[GitHub releases page](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases).

本文件记录项目的重要变更。每个版本的完整更新说明见
[GitHub Releases](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases)。

---

## 1.5.1

- A new look, drawn by hand. Every icon in the app is now its own, drawn with
  the same pen as the doodles, and the icon library it used before is gone.
  Injections are drawn as a syringe with real volume: the dose in a plump
  barrel, its underside in shadow, a glint along the top, the stopper and the
  plunger. Labs is a test tube. Passkeys are drawn as the devices they live
  on, with no fingerprint or key anywhere. Fields are lines that ink themselves in from left
  to right as you type, instead of boxes that light up. Nothing glows on focus
  or turns red on an error: the line under the field says what is wrong.

  全新的手绘外观。应用里的每个图标都换成了自己画的，和插画出自同一支笔，原先使用的图标库已经移除。
  针剂画成了饱满、有立体感的针管：针筒里的药液、背光的下侧、上沿的反光，还有胶塞和推杆。“检查”换成了
  试管。通行密钥画成它所在的设备，不再使用指纹或钥匙图标。输入框改成一条线，打字时
  墨线会从左往右画上，不再是会发光的方框；聚焦时不发光，出错时也不变红，错误写在线下的提示里。

- No more pop-ups. A question like "Delete this dose?" now appears as a line in
  the page right under what you pressed, with Keep it and Delete, and passwords
  are asked for the same way. Choices unfold in place as a list with a tick.
  The date picker is a small calendar that circles the day you pick. Editing a
  dose from the chart opens it in History, signing in happens on Account (and
  carries on to Share when that is what asked), the plan's questions run inside
  the page with the sidebar still there, and the disclaimer and the estimate's
  explanation have a page and a fold of their own.

  不再有弹窗。像“删除这条记录？”这样的确认，现在会作为一行文字出现在你刚按下的位置下方，配有
  “保留”和“删除”；需要输入密码时也是这样。选项会在原地展开成带对勾的列表。日期选择改成了小日历，
  选中的那天会被手绘的圈圈住。从曲线上编辑剂量会直接在“记录”里展开；登录统一在“账户”页完成，
  如果是“分享”要求登录，登录后会接着进入分享；添加用药方案的问题在页面内进行，侧边栏一直都在；
  免责声明和估算说明分别成了独立页面和原地展开的说明。

- Motion that says what changed. On a phone, opening a page slides it in
  over the one you were on and going back slides it away again; on a wide
  window the new page settles into place from a few pixels to the side. Pages
  never fade through each other, so nothing flashes. A tab chosen in the
  sidebar or the bottom bar is simply there: in the bottom bar the pill glides
  to the tab you tap, and the sidebar never moves. Nothing bounces, a wait only
  shows its mark after 300 ms, and with reduced motion everything lands in
  place at once.

  有意义的动效。在手机上，打开页面会从侧面滑入盖住当前页，返回时再滑开；在宽屏上，新页面从旁边几个像素
  的位置轻轻落到位。页面之间不会互相淡入淡出，所以不会闪屏。在侧边栏或底部导航选中的页面会直接出现：
  底部导航的高亮胶囊会滑到你点的那一项，侧边栏始终不动。没有弹跳；等待超过 300 毫秒才会出现转圈；
  开启“减弱动态效果”时，所有变化都会直接到位。

- Any rhythm on the plan (#161). Besides the usual ones, "Another rhythm" takes
  a whole number of days between doses (2 to 180) or of doses a day (2 to 8).
  Each step of adding a drug only waits on its own answer, so a half-typed
  rhythm can no longer strand the steps before it. Thanks to @NAKlama for
  asking, and to @xingqimiao, whose pull request #163 and its review mapped out
  what this needed.

  用药方案支持任意频率（#161）。除了常用频率，“其他频率”可以填写两次用药之间隔几天（2 到 180）
  或每天几次（2 到 8），都是整数。添加药物的每一步只检查这一步自己的答案，没填完的频率不会再卡住
  前面的步骤。感谢 @NAKlama 提出需求，也感谢 @xingqimiao 的 #163 和其中的审阅理清了需要做的事。

- Reminders in your own calendar. The plan page can save your plan as a
  calendar file. Open it, and your calendar app reminds you when each dose is
  due, at the time of day you usually take it. Nothing is sent anywhere, and
  saving it again after the plan changes updates the reminders instead of
  doubling them.

  用日历提醒自己。方案页可以把用药方案存成日历文件，打开后日历 App 会在每次该用药时提醒你，时间是
  你平时用药的钟点。不会发送到任何地方；方案改了之后再存一次，提醒会更新，不会重复。

- Clearer words. Settings has a short heading over each group, every title is
  in sentence case, facts are written as phrases ("4 mg of estradiol valerate")
  instead of being joined with dots, and the Chinese text addresses you as 你.

  文字更清楚。设置里每组都加了简短的小标题；英文标题统一为句首大写；信息不再用圆点拼接，而是
  写成短语；中文统一用“你”。

- Also in this release, merged since 1.5.0:
  - Sign-in and security. An account locks for a while after repeated failed
    sign-ins, except on devices that have signed in to it before, and passkey
    sign-ins count as such a device too. New passwords are checked against a
    stronger policy with a strength meter. Sign-in, share and F2F requests are
    rate-limited, a token signed with `alg: none` is refused with 401, private
    responses are never cached, and the Node runtime, dependencies, auth
    headers and Rust crates are patched (#119, #121, #122, #123, #135, #147,
    #152, #155, #156, #162).
  - Complete device backup: export and import everything on a device, with a
    preview that says what it adds, changes or skips and whether it came from
    this account (#129, #132). Stored doses no longer keep floating-point tails
    (#137).
  - Age adjustment (beta), under Settings: the year of birth adjusts how fast
    estradiol and testosterone are cleared (#138).
  - For self-hosting: the Docker image is built from source (#103), with a
    dependency checker and an installer script (#157); the hrt-tool
    command-line interface and its self-hosted transport (#133, #134, #141);
    and the F2F keyring for groups who meet in person, with escrow keys, a GPG
    keyring export and one-time CLI sign-in codes (#142, #143, #144, #148,
    #158). Self-hosters and the Cloudflare deployment need migrations `0007` to
    `0012` (the Docker image applies them on start).
  - Fixes: share links can expire as late as 2100 (#154); encryption and copy
    work on a self-host opened over plain http (#106); the shared record lists
    doses in one column like History (#114); the Overview reads doses that
    drift a little as one regimen (#160); the calibration plot stays readable
    with an extreme lab value (#162); the lab calibration exclusion message is
    right again (#136); buttons keep their size while busy or after copying (#164).

  这个版本还包含 1.5.0 之后合并的以下改动：
  - 登录与安全：连续登录失败后账户会暂时锁定，但曾经登录过的设备不受影响，通行密钥登录也算这样的
    设备；新密码按更严格的规则检查，并显示强度；登录、分享和 F2F 请求有频率限制；用 `alg: none`
    签名的令牌会被拒绝（401）；私密响应不再被缓存；Node 运行时、依赖、认证响应头和 Rust 依赖都已
    修补（#119、#121、#122、#123、#135、#147、#152、#155、#156、#162）。
  - 完整设备备份：导出、导入设备上的全部数据，导入前预览会写明新增、修改和跳过的内容，以及备份是否
    来自这个账户（#129、#132）。保存的剂量不再带浮点尾数（#137）。
  - 年龄调整（Beta），在设置里：出生年份会调整雌二醇和睾酮的清除速度（#138）。
  - 自行部署：Docker 镜像改为从源码构建（#103），并提供依赖检查和安装脚本（#157）；hrt-tool 命令行
    接口及其自托管传输（#133、#134、#141）；供线下见面小团体使用的 F2F 密钥环，支持托管密钥、导出
    GPG 公钥环和一次性命令行登录码（#142、#143、#144、#148、#158）。自行部署和 Cloudflare 部署需要
    执行迁移 `0007` 至 `0012`（Docker 镜像启动时会自动执行）。
  - 修复：分享链接最晚可设到 2100 年过期（#154）；用普通 http 打开的自托管站点上，加密和复制按钮
    可以正常使用（#106）；分享出去的记录像“记录”页一样单列显示（#114）；剂量时间略有漂移时，概览会
    当作同一个方案（#160）；遇到极端化验值时校准图仍然清楚可读（#162）；化验校准的排除提示恢复正确
    （#136）；按钮在处理中或复制后保持原来的大小（#164）。

---

## 1.5.0

- Labs on the chart now say how they compare with the model: tap or hover a
  lab's diamond and the readout adds the lab and how far above or below the
  model, before calibration, it is. Each lab in the Labs list shows how many
  hours after the last dose it was drawn, labs can note their test method
  (immunoassay or LC-MS/MS), and "Copy as table" copies every lab with its
  dose, sublingual hold time, timing, method and the model's estimate, to paste
  into a spreadsheet or an issue; nothing is sent anywhere. Testosterone labs
  get the same comparison in Masculinizing HRT.

  曲线上的化验点现在会显示和模型的对照：点一下或悬停在菱形上，读数会加上化验值，以及它比校准前的模型
  高或低多少。检查列表里每条化验会写出是用药后多少小时抽的血，还可以记下检测方法（免疫法或质谱法
  LC-MS/MS）。“复制为表格”会把每条化验连同剂量、舌下含服时间、间隔、检测方法和模型估算一起复制，
  方便贴到表格或 issue 里，不会发送到任何地方。男性化 HRT 下睾酮化验也有同样的对照。

- Share links are now end-to-end encrypted. The app encrypts the copy in your
  browser with a key that exists only in the link, after the `#`, so the server
  stores data it cannot read. Live links keep updating from any of your devices
  that can read your cloud backups. Links made before this keep working until
  they expire and are marked "Not encrypted" in the list; revoke and recreate
  one to encrypt it. You can also remove your avatar now, from the avatar page
  under Account. Self-hosters and the Cloudflare deployment need migration
  `0006` (the Docker image applies it on start).

  分享链接现在是端到端加密的。应用在浏览器里用一把只存在于链接 `#` 之后的密钥加密副本，服务器
  保存的是它读不了的数据。实时链接仍能从任何一台能读取你云备份的设备上继续更新。之前创建的链接
  在过期前照常可用，并在列表里标为“未加密”，撤销后重新创建即可加密。另外现在可以在“账户”的
  头像页面删除头像。自行部署和 Cloudflare 部署需要执行迁移 `0006`（Docker 镜像启动时会自动执行）。

- Added a Credits page under Settings, About. It credits LaoZhong-Mihari's
  original projects, the maintainer, contributors, the community resources the
  model draws on, and the open source software the app uses. It loads nothing
  from other sites, and it is in English in every language.

  在设置的「关于」里加了致谢页面：致谢小中（LaoZhong-Mihari）的原作、维护者、各位贡献者、模型参考的
  社区资料，以及应用用到的开源软件。页面本身不从其他网站加载任何内容，并且在所有语言下都显示英文。

- The app now tells you when a new version is out. It checks when it opens,
  when you come back to the tab, and every half hour, and shows a small line at
  the top with a Refresh button. It no longer reloads on its own, so nothing you
  are typing gets lost. Installs without a service worker (the desktop app, or
  a Docker install opened over plain http) behave as before.

  应用有新版本时会提示你了：打开时、切回页面时和每半小时检查一次，有新版本就在顶部显示一行提示和
  刷新按钮。它不会再自己刷新页面，正在填写的内容不会丢。没有 service worker 的环境（桌面版，或用
  普通 http 打开的 Docker 部署）和以前一样。

- Fixed Docker containers that would not start after upgrading from an image
  older than September 2026. Such a volume often has the 2FA secret column but
  not the newer replay-guard column, so migration `0005` failed on the column
  that exists. The reconcile step now adds the missing column first. It is the
  same step `npm run wrangler:migrate:reconcile` runs for Cloudflare.

  修复了从 2026 年 9 月之前的镜像升级后 Docker 容器起不来的问题：这类数据卷常常已有两步验证
  密钥那一列，却没有后来加的防重放那一列，迁移 `0005` 会因为已存在的那一列失败。对账步骤现在会
  先补上缺的那一列；Cloudflare 部署用 `npm run wrangler:migrate:reconcile` 运行的也是同一步。

- Made the app friendlier to use without changing its look. The system Back
  gesture now steps back through pages instead of leaving the app. A new dose
  starts on the drug and route used last. Confirms say what they will delete or
  replace, and import warns before it replaces records. History, the Overview
  plan and empty pages use the app's own drawings to tell doses and next steps
  apart. Tapping the running-low line opens Supplies, tapping a chart shows its
  values, and Labs lists results above the plot. The bottom tab for lab
  results is renamed from "Calibration" to "Labs" to match its page.

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
  schedule, read cyproterone taken every few days by its daily average, and
  group doses by local day. Swallowed estradiol now goes through an estrone
  pool, so oral and sublingual levels no longer fall to almost zero between
  doses. Oral cyproterone acetate follows the Androcur label (100 mg peaks at
  about 285 ng/mL). Testosterone injections follow the Xyosted, Aveed and
  Nebido labels (100 mg/week of cypionate or enanthate averages about
  740 ng/dL instead of 430), also for anyone who saved the model parameters
  page before. Sublingual absorption is unchanged, but sublingual estradiol
  peaks are lower, most on the shorter hold times, because the swallowed part
  now rises slowly.

  修正了这些测试记录下的计算问题：贴片的移除记录会配给真正贴着的那一片；口服和舌下给药后的
  当前浓度不再从稀疏网格上读取；化验校准报告的清除率与画出的曲线一致；剂量提醒按每种注射酯
  各自的周期计算，隔几天服用的醋酸环丙孕酮按日均量计算，并按本地日期分组；吞下的雌二醇改为
  经过雌酮储库，口服与舌下在两次服药之间不再降到接近零；口服醋酸环丙孕酮按 Androcur 说明书
  计算（100 mg 峰值约 285 ng/mL）；睾酮注射按 Xyosted、Aveed 与 Nebido 说明书校准（每周
  100 mg 环戊丙酸或庚酸睾酮平均约 740 ng/dL，原为 430），以前保存过模型参数页的用户也会用上
  新值。舌下吸收参数未改，但舌下雌二醇的峰值变低，含服时间越短越明显，因为吞下的部分现在上升得慢。

- Updated dependencies so `npm audit` reports nothing, including a critical
  advisory in the test runner (Vitest 3 to 4). React's type packages match
  React 18 again, and `autoprefixer` is gone because Tailwind 4 adds the
  prefixes it needs. On Safari 17 and older, glass panels now keep their
  see-through look instead of falling back to a solid colour. The icon set
  (lucide-react) moved to 1.x, so a few icons are drawn slightly differently.

  更新依赖，`npm audit` 不再报告任何问题，其中包括测试工具中的一个严重级别漏洞（Vitest 3 升到 4）。
  React 的类型包重新与 React 18 对应；移除了 `autoprefixer`，Tailwind 4 会自行添加所需的前缀。
  在 Safari 17 及更早版本上，半透明面板不再退回为不透明的纯色。
  图标库 lucide-react 升级到 1.x，个别图标的画法略有不同。

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
