# Contributing 贡献指南

Thank you for helping with **HRT Recorder Web**. Bug reports, translations,
documentation and code are all welcome, and you do not need to be a programmer
to help.

感谢你愿意为 **HRT Recorder Web** 出一份力。无论是报告问题、翻译、完善文档还是写代码，
我们都非常欢迎；不会写代码也一样可以参与。

By taking part you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

参与本项目即表示你同意遵守我们的[行为准则](./CODE_OF_CONDUCT.md)。

---

## Ways to help 参与方式

- **Report a bug**: open an issue with the _Bug report_ template.

  **报告问题**：使用 _Bug report_ 模板提交 issue。

- **Ask about an estimate**: if the modelled concentration looks far from your
  lab result, use the _Question about a concentration estimate_ template. These
  reports help us check the model.

  **询问浓度估算**：如果模型估算的浓度与你的化验结果差距很大，请使用
  _Question about a concentration estimate_ 模板。这类反馈能帮助我们检验模型。

- **Suggest a feature**: use the _Feature request_ template.

  **建议新功能**：使用 _Feature request_ 模板。

- **Translate**: see [Translations](#translations-翻译) below.

  **翻译**：见下方[翻译](#translations-翻译)一节。

- **Report a security problem**: please do **not** open a public issue. Follow
  [SECURITY.md](./SECURITY.md) instead.

  **报告安全问题**：请**不要**公开提交 issue，请按照 [SECURITY.md](./SECURITY.md) 私下报告。

Please never paste real personal or medical data you would not want made public
into an issue. Round numbers or made-up values are fine.

请不要在 issue 中粘贴任何你不希望公开的真实个人信息或医疗数据，用近似值或虚构数据即可。

---

## Local setup 本地开发环境

You need **Node.js 22** (the version CI uses) and npm.

你需要 **Node.js 22**（与 CI 相同的版本）以及 npm。

### Frontend only 仅前端

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
npm install
npm run dev
```

Then open <http://localhost:3000>. Dose records, the chart and all the
modelling work without a backend, because data stays in the browser.

然后打开 <http://localhost:3000>。用药记录、图表与全部建模功能都不需要后端，因为数据默认保存在浏览器中。

### Frontend with the Worker API 前端加 Worker 后端

Accounts, cloud backup, share links and avatars need the Cloudflare Worker in
`worker.ts`. Run it locally with Wrangler, which emulates D1 and R2 on your
machine:

账号、云备份、分享链接与头像需要 `worker.ts` 中的 Cloudflare Worker。可以用 Wrangler
在本地运行它，Wrangler 会在本机模拟 D1 与 R2：

```bash
# Generate a JWT secret and keep it out of git (.dev.vars is ignored)
# 生成 JWT 密钥，.dev.vars 已被 git 忽略
echo "JWT_SECRET=$(openssl rand -base64 48)" > .dev.vars

npm run wrangler:migrate:local   # create the local D1 tables 创建本地 D1 数据表
npm run wrangler:dev             # build, then serve on :8787 构建并在 8787 端口运行
```

In a second terminal run `npm run dev`. The Vite dev server on port 3000
forwards `/api` to the Worker on port 8787, so you get hot reload and a working
backend together.

在另一个终端运行 `npm run dev`。端口 3000 上的 Vite 开发服务器会把 `/api` 请求转发到
8787 端口的 Worker，这样既有热更新，也有可用的后端。

### Docker

To run the complete app the way self-hosters do, follow the Docker section of
the [README](./README.md#docker). To test your own changes in a container,
build the image from your checkout:

如果想像自托管用户那样运行完整应用，请参考 [README](./README.md#docker) 中的 Docker 一节。
若要在容器中测试你自己的修改，请从本地代码构建镜像：

```bash
cp .env.docker.example .env      # then set JWT_SECRET 然后填写 JWT_SECRET
docker build -t hrt-tracker:dev .
docker run --rm -p 8787:8787 --env-file .env -v "$(pwd)/data:/data" hrt-tracker:dev
```

### Desktop app 桌面应用

The desktop app is a [Tauri 1](https://tauri.app/v1/guides/) shell around the
same web build. It needs a Rust toolchain and the Tauri system dependencies for
your platform. Then:

桌面应用是基于同一份网页构建的 [Tauri 1](https://tauri.app/v1/guides/) 外壳，需要安装
Rust 工具链以及对应平台的 Tauri 系统依赖，然后运行：

```bash
npm run tauri:dev
```

---

## Codebase map 代码结构

| Path 路径                               | What it is 说明                                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.tsx`, `src/App.tsx`              | Entry point and app shell (navigation, settings, language list). 入口与应用外壳（导航、设置、语言列表）。                                                                          |
| `src/pages/`                            | One file per screen. 每个页面一个文件。                                                                                                                                            |
| `src/components/`                       | Shared UI pieces, charts and forms. 共享的界面组件、图表与表单。                                                                                                                   |
| `src/contexts/`, `src/hooks/`           | React state: auth, language, app data, cloud sync. React 状态：登录、语言、应用数据、云同步。                                                                                      |
| `src/services/`                         | Calls to the Worker API. 调用 Worker API 的代码。                                                                                                                                  |
| `src/i18n/`                             | Translations (`translations.ts`) and share-page copy (`share.ts`). 界面翻译与分享页文案。                                                                                          |
| `logic.ts`                              | The pharmacokinetic model: dose events, parameters, simulation. See [Algorithm Explanation.md](./Algorithm%20Explanation.md). 药代动力学模型：给药事件、参数与模拟，详见算法说明。 |
| `tests/`                                | Unit tests for `logic.ts` (Vitest). 针对 `logic.ts` 的单元测试（Vitest）。                                                                                                         |
| `worker.ts`, `backupPolicy.ts`          | Cloudflare Worker backend: API, auth, D1 database, R2 avatar storage, scheduled cleanup. Cloudflare Worker 后端：API、认证、D1 数据库、R2 头像存储与定时清理。                     |
| `migrations/`                           | D1 schema. Add a new numbered file; never edit one that has shipped. D1 数据库结构。新增带编号的文件，不要修改已发布的迁移。                                                       |
| `wrangler.toml`                         | Worker configuration and bindings. Worker 配置与绑定。                                                                                                                             |
| `src-tauri/`                            | Tauri desktop app (Rust). Tauri 桌面应用（Rust）。                                                                                                                                 |
| `Dockerfile`, `docker/`, `compose.yaml` | Self-hosted image. 自托管镜像。                                                                                                                                                    |
| `scripts/set_version.py`                | Keeps every version field in step. 保持各文件版本号一致。                                                                                                                          |
| `.github/workflows/`                    | CI, CodeQL, Docker publishing and releases. CI、CodeQL、Docker 发布与版本发布。                                                                                                    |

---

## Proposing a change 提交修改

1. **Open an issue first** for anything larger than a small fix, so we can agree
   on the approach before you spend time on it.

   **先开 issue 讨论**：除了很小的修复，请先开 issue，确认方向后再动手，避免白费功夫。

2. **Fork and branch.** Create a branch from `main` with a short descriptive
   name, for example `fix/patch-removal-time`.

   **Fork 并新建分支**：从 `main` 创建一个名字简短明确的分支，例如 `fix/patch-removal-time`。

3. **Keep the change focused.** One pull request should do one thing. Match the
   style of the code around it. Run `npm run format` before you commit, or
   turn on format on save with Prettier in your editor.

   **保持修改聚焦**：一个 PR 只做一件事，并与周围代码的风格保持一致。提交前请运行 `npm run format`，
   或在编辑器里开启 Prettier 保存时自动格式化。

4. **Check it locally** with the same steps CI runs:

   **本地自查**，执行与 CI 相同的检查：

   ```bash
   npx tsc --noEmit                    # typecheck the app and worker.ts 类型检查
   npm run lint                        # ESLint: errors fail CI, please add no new warnings 代码检查：错误会让 CI 失败，请不要新增警告
   npm run format:check                # Prettier; `npm run format` fixes it 格式检查，可用 `npm run format` 修正
   npm test                            # unit tests for the dose math 剂量计算单元测试
   npm run build                       # production build 生产构建
   python3 scripts/set_version.py --check
   ```

5. **Write a clear commit message.** Say what changed and why in plain words,
   for example `Keep the patch on the chart until it is removed`.

   **写清楚提交信息**：用平实的语言说明改了什么、为什么改，例如
   `Keep the patch on the chart until it is removed`。

6. **Open a pull request** against `main` and fill in the template. Add a
   screenshot for anything you can see in the app.

   **向 `main` 提交 PR** 并填写模板。界面上看得到的修改请附截图。

A few things need extra care:

有几类修改需要格外注意：

- **The model (`logic.ts`).** Changes to pharmacokinetic parameters or equations
  must cite their source (a paper, a label, or the upstream
  [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)
  code) and say how the curve changes. People read these numbers about their
  own bodies. Tests marked `it.fails` in `tests/literature.test.ts` record
  known gaps against published data: when a change fixes one, that test starts
  failing, and the marker should become `it`.

  **模型（`logic.ts`）**：修改药代动力学参数或公式时，必须注明来源（论文、说明书或上游
  [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)
  的代码），并说明曲线会如何变化。用户会根据这些数字理解自己的身体。
  `tests/literature.test.ts` 中标为 `it.fails` 的测试记录的是与已发表数据之间的
  已知差距：修改修复了其中一项时，对应测试会开始失败，此时请把 `it.fails` 改为
  `it`。

- **The database.** Add a new file in `migrations/` rather than editing an old
  one, and make sure an existing database upgrades cleanly.

  **数据库**：在 `migrations/` 中新增文件，不要修改旧文件，并确认已有数据库可以平滑升级。

- **Privacy.** Dosage data stays in the browser unless the user chooses
  otherwise. Do not add anything that sends health data off the device without
  a clear choice from the user.

  **隐私**：除非用户主动选择，用药数据只保存在浏览器中。不要加入任何未经用户明确同意就把健康数据发出设备的功能。

- **Versions.** Do not bump the version in a pull request; maintainers do that
  when they release.

  **版本号**：请不要在 PR 中修改版本号，发布时由维护者统一处理。

---

## Translations 翻译

All interface text lives in [`src/i18n/translations.ts`](./src/i18n/translations.ts).
Each language is an object of `"key": "text"` pairs, and components read them
with `t('key')`.

所有界面文字都在 [`src/i18n/translations.ts`](./src/i18n/translations.ts) 中。每种语言是一组
`"key": "text"` 键值对，组件通过 `t('key')` 读取。

### Improving an existing language 改进已有语言

Find the key in that language's block and edit the text. Keep placeholders such
as `{doses}` exactly as they are. Some blocks are built on others:

在对应语言的区块中找到键并修改文字，`{doses}` 这类占位符请原样保留。部分语言区块建立在其他区块之上：

- `en` spreads `TRANSLATIONS_BASE.en`, and `yue` (Cantonese) spreads `ZH_TW`, so
  a Traditional Chinese change also reaches Cantonese unless `yue` overrides it.

  `en` 展开自 `TRANSLATIONS_BASE.en`，`yue`（粤语）展开自 `ZH_TW`，因此修改正体中文也会影响粤语，除非 `yue` 自己覆盖了该键。

- A key missing from a language falls back along the chain in `FALLBACK` in
  `src/contexts/LanguageContext.tsx`, ending at English or Simplified Chinese.

  某语言缺少的键会按照 `src/contexts/LanguageContext.tsx` 中 `FALLBACK` 的顺序回退，最终落到英语或简体中文。

### Adding a new string 新增文字

Add the key to both `TRANSLATIONS_BASE.zh` and `TRANSLATIONS_BASE.en`. Between
them those two carry every key, so nothing ever shows a raw key. Add the other
languages too if you can; if not, say so in the pull request and the fallback
covers them until someone translates it.

请同时在 `TRANSLATIONS_BASE.zh` 和 `TRANSLATIONS_BASE.en` 中添加该键，这两种语言合起来覆盖所有键，
所以界面上永远不会出现裸键名。能翻译其他语言最好；如果不能，请在 PR 中说明，回退机制会先顶上，直到有人补全。

### Adding a new language 新增语言

1. Add its code to the `Lang` type at the top of `translations.ts` and add a
   block for it in `TRANSLATIONS`. Start by translating the keys you can; the
   rest fall back.

   在 `translations.ts` 顶部的 `Lang` 类型中加入语言代码，并在 `TRANSLATIONS` 中添加对应区块。
   先翻译你能翻译的键，其余会自动回退。

2. Add it to `LANG_LOCALE` and `FALLBACK` in `src/contexts/LanguageContext.tsx`
   (and to `RTL_LANGS` if it is written right to left).

   在 `src/contexts/LanguageContext.tsx` 的 `LANG_LOCALE` 与 `FALLBACK` 中加入该语言（若从右往左书写，也加入 `RTL_LANGS`）。

3. Add it to `LOCALE_MAP` in `src/utils/helpers.tsx`, to the share-page copy in
   `src/i18n/share.ts`, and to the language picker in `src/App.tsx`
   (`languageOptions`).

   在 `src/utils/helpers.tsx` 的 `LOCALE_MAP`、`src/i18n/share.ts` 的分享页文案，以及
   `src/App.tsx` 的语言选择列表（`languageOptions`）中加入该语言。

4. For site notices, add it to `noticeLangs` in `src/pages/Admin.tsx` and to
   `NOTICE_LANGS` in `worker.ts`.

   为了支持站点公告，在 `src/pages/Admin.tsx` 的 `noticeLangs` 与 `worker.ts` 的 `NOTICE_LANGS` 中加入该语言。

The typechecker points out any `Record<Lang, …>` you missed, so run
`npx tsc --noEmit` when you are done.

如果遗漏了某个 `Record<Lang, …>`，类型检查会指出来，完成后请运行 `npx tsc --noEmit`。

---

## Releases 发布版本

Every pull request and push to `main` runs CI: a typecheck, a production build
and a check that every file carries the same version. Dependabot opens weekly
update pull requests for npm, Cargo, GitHub Actions and the Docker base image.

每个 PR 与推送到 `main` 的提交都会运行 CI：类型检查、生产构建，以及检查各文件中的
版本号是否一致。Dependabot 每周为 npm、Cargo、GitHub Actions 与 Docker 基础镜像
提交更新 PR。

To release, set the version, commit it on `main`, and push a matching tag:
/ 发布新版本时，先设置版本号并提交到 `main`，再推送对应的标签：

```bash
python3 scripts/set_version.py 1.5.1
git commit -am "Release 1.5.1"
git tag v1.5.1
git push origin main v1.5.1
```

The tag starts `.github/workflows/release.yml`, which checks that the tag is on
`main` and matches the version files, drafts a GitHub release with generated
notes, builds the macOS (universal `.dmg`) and Windows (`.msi`) installers,
attaches them and publishes the release. The same tag publishes the matching
Docker image.

标签会触发 `.github/workflows/release.yml`：确认标签位于 `main` 且与版本号一致，
生成带更新说明的 GitHub Release 草稿，构建 macOS（通用 `.dmg`）与 Windows（`.msi`）
安装包并上传，然后正式发布。同一标签也会发布对应版本的 Docker 镜像。

macOS only opens apps without a warning when they are signed with an Apple
Developer ID and notarized. Add these repository secrets and releases are
signed and notarized automatically: `APPLE_CERTIFICATE` (base64 of the
Developer ID Application `.p12`), `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (an app-specific
password) and `APPLE_TEAM_ID`. Without them the app is ad-hoc signed, and the
release notes tell users how to allow it once.

macOS 只会直接打开使用 Apple Developer ID 签名并经过公证的应用。添加上述仓库
Secrets 后，发布版本会自动签名并公证；未添加时应用仅做临时（ad-hoc）签名，
发布说明中会附上首次打开的方法。

---

## Questions 有疑问？

If anything here is unclear or out of date, open an issue or ask in your pull
request. Improving this guide is a contribution too.

如果本指南有不清楚或过时的地方，欢迎开 issue 或在 PR 中提问。完善这份指南本身也是一种贡献。
