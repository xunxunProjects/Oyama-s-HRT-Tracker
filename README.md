# Oyama's HRT Tracker

**Oyama's HRT Tracker** is a privacy-focused tool for logging Hormone Replacement Therapy (HRT) and simulating the hormone levels your doses produce. It has a feminizing mode (estradiol, plus cyproterone acetate) and a masculinizing mode (testosterone), and it can also log other adjunct drugs.

**Oyama's HRT Tracker**（HRT 记录工具）是一个注重隐私的工具，用于记录激素替代疗法（HRT）用药，并模拟这些剂量带来的激素水平。它提供女性化模式（雌二醇，以及醋酸环丙孕酮）和男性化模式（睾酮），也可以记录其他辅助用药。

It runs in the browser and can be installed as a PWA, as a desktop app for macOS and Windows built with Tauri, or as a self-hosted Docker image. Cloud backup (end-to-end encrypted) and share links are optional.

它可以在浏览器中运行并安装为 PWA，也可以作为基于 Tauri 的 macOS 与 Windows 桌面应用使用，或通过 Docker 镜像自行部署。云备份（端到端加密）与分享链接均为可选功能。

> [!WARNING]
> **Not medical advice.** This app shows estimates from a pharmacokinetic model. They can differ a lot from your real hormone levels and are no substitute for blood tests or a clinician. Do not start, stop or change any medication based on this app alone.
>
> **不构成医疗建议。** 本应用展示的是药代动力学模型的估算值，可能与你真实的激素水平相差很大，不能替代抽血检查或医生的判断。请勿仅凭本应用开始、停止或调整任何用药。

**Privacy 隐私说明:** [English](./PRIVACY.md) · [中文](./PRIVACY.zh-CN.md)

---

## Algorithm & Core Logic 算法逻辑

The estradiol pharmacokinetic model is based on `PKcore.swift` and `PKparameter.swift` by **@LaoZhong-Mihari**, from the **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** repository. Its three-compartment structure, two-part injection depot kinetics and sublingual absorption tiers come from there.

雌二醇的药代动力学模型基于 **@LaoZhong-Mihari** 在 **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** 仓库中提供的 `PKcore.swift` 与 `PKparameter.swift`，其中的三室模型、双相肌注库房动力学与舌下吸收分层均来自该仓库。

This project has since adjusted and extended the model: it adds testosterone (injection esters, gel and patch) for the masculinizing mode, cyproterone acetate on its own curve, and estradiol undecylate injections; it revises the gel and sublingual handling; and it can calibrate the estradiol curve against your lab results. See [Algorithm Explanation.md](./Algorithm%20Explanation.md) for the details.

此后本项目对模型做了调整和扩展：为男性化模式加入了睾酮（注射用酯、凝胶与贴片），为醋酸环丙孕酮加入了单独的曲线，并新增了十一酸雌二醇注射；调整了凝胶与舌下给药的处理；还可以用你的检查结果校准雌二醇曲线。详情见 [Algorithm Explanation.md](./Algorithm%20Explanation.md)。

---

## Features 功能

- **Feminizing and masculinizing modes**: in feminizing mode, estradiol by injection (benzoate, valerate, cypionate, enanthate, and undecylate in beta), oral, sublingual, gel and patch, with oral cyproterone acetate on its own curve. In masculinizing mode, testosterone injection (cypionate, enanthate, undecanoate) and gel; a testosterone patch can also be added to the medication plan and supplies.

  **女性化与男性化模式**：女性化模式支持雌二醇的注射（苯甲酸酯、戊酸酯、环戊丙酸酯、庚酸酯，以及 Beta 阶段的十一酸酯）、口服、舌下、凝胶与贴片，口服醋酸环丙孕酮以单独的曲线显示。男性化模式支持睾酮注射（环戊丙酸酯、庚酸酯、十一酸酯）与凝胶；睾酮贴片也可以加入用药方案与药量库存。

- **Other drugs**: in feminizing mode, spironolactone, bicalutamide, medroxyprogesterone acetate, raloxifene and the GnRH agonists leuprorelin and triptorelin can be logged, planned and stocked. They have no level model, so they draw no curve and do not change any estimate.

  **其他药物**：在女性化模式中，螺内酯、比卡鲁胺、醋酸甲羟孕酮、雷洛昔芬，以及 GnRH 激动剂亮丙瑞林与曲普瑞林，可以记录、加入用药方案并管理库存。它们没有浓度模型，因此不会绘制曲线，也不影响任何估算值。

- **Charts**: interactive charts of the estimated level over time (estradiol in pg/mL, cyproterone acetate in ng/mL, total testosterone in ng/dL), with your lab results plotted alongside.

  **图表**：交互式图表展示随时间变化的估算浓度（雌二醇 pg/mL、醋酸环丙孕酮 ng/mL、总睾酮 ng/dL），并在图上标出你的检查结果。

- **Sublingual hold time**: pick one of four hold-time tiers (2 to 15 minutes) or enter your own; the model turns it into the share of the dose absorbed through the lining of the mouth (θ).

  **舌下含服时间**：从四档含服时间（2 到 15 分钟）中选择，或自行填写；模型据此估算经口腔黏膜吸收的剂量比例（θ）。

- **Lab calibration**: log blood test results. Estradiol results can calibrate the model to you, with a choice of estimator (EKF, OU-Kalman or MIPD), and the model parameters can also be edited by hand.

  **模型校准**：记录抽血检查结果。雌二醇结果可用于按你的情况校准模型，可选 EKF、OU-Kalman 或 MIPD 三种方式；也可以手动编辑模型参数。

- **Medication plan**: list what you take and how often. The overview shows what is due today and logs a dose with one tap, and a what-if view compares carrying on as now with a planned change.

  **用药方案**：记下你使用的药物与频率。概览页会显示今天待用的剂量，一键即可记录；方案试算页面可以对比维持现状与计划中的调整。

- **Supplies**: record how much of each medicine you have. The app subtracts the doses you log, estimates when it will run out at your current rate and warns on the overview ahead of time.

  **药量库存**：记录每种药物的存量。应用会扣除已记录的用量，按当前用药频率估算用完的日期，并提前在概览页提醒。

- **Privacy by Default**: Dosage data stays in your browser unless you explicitly use cloud backup or create a share link. Cloud backups are end-to-end encrypted. A share link uploads a read-only copy of the dosage history, modelled curve, and timezone until its expiration; optional live links refresh that copy when the signed-in app is open. Share links never include lab results, weight, profile details, or account data, and like backups they are end-to-end encrypted: the key is only in the link. See the [privacy notice](./PRIVACY.md) for details.

  **默认保护隐私**：用药数据默认保存在浏览器中，只有在你主动使用云备份或创建分享链接时才会上传。云备份采用端到端加密。分享链接会保存一份只读的用药记录、模型曲线和时区副本，直到链接过期；其中不会包含检查结果、体重、个人资料或账户数据，并且和云备份一样是端到端加密的，密钥只在链接里。详见[隐私说明](./PRIVACY.zh-CN.md)。

- **Internationalization**: Interface in **Simplified Chinese**, **Traditional Chinese**, **Cantonese**, **English**, **Japanese**, **Korean** and **Turkish**.

  **多语言支持**：界面支持简体中文、繁体中文、粤语、英语、日语、韩语和土耳其语。

---

## Run Locally 本地运行

This project is built with **React** and **TypeScript**, bundled with [Vite](https://vitejs.dev/).

本项目基于 **React** 与 **TypeScript** 构建，使用 [Vite](https://vitejs.dev/) 打包。

1. **Clone the repository 克隆仓库**

   ```bash
   git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
   cd Oyama-s-HRT-Tracker
   ```

2. **Install dependencies 安装依赖**

   ```bash
   npm install
   ```

3. **Start the dev server 运行项目**

   ```bash
   npm run dev
   ```

   Then open <http://localhost:3000> in your browser.

   然后在浏览器中打开 <http://localhost:3000>。

---

## Docker

The Docker image runs the complete app locally, including the Worker API, D1
database, and R2-compatible avatar storage. Data is kept in the project's `./data`
directory and survives container restarts. The image is built from source on
your machine, so you need Git and Docker with Compose.

Docker 镜像会在本地运行完整应用，包括 Worker API、D1 数据库和兼容 R2 的头像存储。
数据直接保存在项目目录的 `./data` 中，容器重启不会丢失。镜像会在你的机器上从源码构建，
需要先安装 Git 和带 Compose 的 Docker。

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
cp .env.docker.example .env
# Replace JWT_SECRET in .env with the output of:
openssl rand -base64 48
mkdir -p ./data
sudo chown 1000:1000 ./data
docker compose up -d --build
```

Then open <http://localhost:8787>. / 然后访问 <http://localhost:8787>。

The first build takes a few minutes. To update later, pull the new code and
rebuild; your data in `./data` is kept:

第一次构建需要几分钟。以后更新时，拉取新代码并重新构建即可，`./data` 中的数据会保留：

```bash
git pull
docker compose up -d --build
```

### Plain http and https 关于 http 与 https

Opening the app over plain http from another device (for example
`http://192.168.1.5:8787`) works, and backups, exports and share links stay
end-to-end encrypted there too. Browsers do hold back a few features until the
page is served over https (or opened as `localhost`): installing it as an app,
offline use, and passkey sign-in. To get those, put the container behind any
https reverse proxy, such as [Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
(`caddy reverse-proxy --from your.domain --to localhost:8787`) or
[Tailscale Serve](https://tailscale.com/kb/1312/serve).

在其他设备上通过 http 访问（例如 `http://192.168.1.5:8787`）也能正常使用，备份、导出和分享链接
依然是端到端加密的。不过浏览器只在 https（或 `localhost`）下开放少数功能：安装为应用、离线使用和
通行密钥登录。需要这些功能时，可以在容器前面加一个 https 反向代理，例如
[Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
（`caddy reverse-proxy --from 你的域名 --to localhost:8787`）或
[Tailscale Serve](https://tailscale.com/kb/1312/serve)。

### Database schema 数据库结构

The schema is defined only by the files in `migrations/`. The container applies
them on every start, and a volume created by an older image is reconciled first
(`docker/reconcile.mjs`), so upgrading needs nothing from you.

数据库结构只由 `migrations/` 目录定义。容器每次启动都会自动应用迁移；旧版镜像创建的
数据卷会先经过 `docker/reconcile.mjs` 对账，升级无需手动操作。

For a Cloudflare deployment, run the same two steps once before deploying a
build that includes migration `0000`:

在 Cloudflare 上部署时，第一次部署包含 `0000` 迁移的版本之前，先执行一次这两步：

```bash
npm run wrangler:migrate:reconcile
npm run wrangler:migrate:remote
```

`wrangler.toml` carries no D1 database IDs. A Cloudflare Workers Builds deploy
needs two build variables, `PRODUCTION_D1_DATABASE_ID` and
`PREVIEW_D1_DATABASE_ID` (Worker settings, Build, Variables and secrets);
`npm run build` writes them into `wrangler.toml` and stops if one is missing.
Branch builds only get the preview database. See `scripts/cloudflare-ids.mjs`.

`wrangler.toml` 中不保存 D1 数据库 ID。通过 Cloudflare Workers Builds 部署时，需要在
Worker 设置的 Build 中添加两个构建变量 `PRODUCTION_D1_DATABASE_ID` 与
`PREVIEW_D1_DATABASE_ID`；`npm run build` 会把它们写入 `wrangler.toml`，缺少任何一个都会
直接停止构建。非 main 分支的构建只会拿到预览数据库。详见 `scripts/cloudflare-ids.mjs`。

Web and Docker builds use same-origin `/api` requests by default. Desktop and
other custom-protocol builds should set `VITE_API_ORIGIN` to their Worker/API
origin at build time; the release workflow supplies the hosted origin.

To stop the app without deleting its data: / 停止应用但保留数据：

```bash
docker compose down
```

Without Compose, build and run the image with plain Docker: / 不使用 Compose 时，可以直接用 Docker 构建并运行：

```bash
docker build -t hrt-tracker:local .
docker run -d --name hrt-tracker \
  -p 8787:8787 \
  --env-file .env \
  -v "$(pwd)/data:/data" \
  hrt-tracker:local
```

`ADMIN_USERNAME` and `ADMIN_PASSWORD` are optional. When used, set both. The
container uses Wrangler's local workerd runtime and local persistent D1/R2
resources; it does not connect to the Cloudflare production database or bucket.

`ADMIN_USERNAME` 与 `ADMIN_PASSWORD` 是可选项；如需管理员账号，请同时设置。
容器使用 Wrangler 的本地 workerd 运行时以及本地持久化 D1/R2 资源，不会连接
Cloudflare 生产数据库或存储桶。

The workflow in `.github/workflows/docker-publish.yml` validates pull requests
and publishes `linux/amd64` and `linux/arm64` images to GitHub Container Registry
for `main`, version tags, and manual runs. That package is private for now, so
pulling it without access fails; build from source as shown above.

`.github/workflows/docker-publish.yml` 会在 PR 中验证构建，并在 `main`、版本标签或
手动运行时向 GitHub Container Registry 发布 `linux/amd64` 与 `linux/arm64` 镜像。
该镜像包目前是私有的，没有权限时无法拉取，请按上面的步骤从源码构建。

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
python3 scripts/set_version.py 1.5.0
git commit -am "Release 1.5.0"
git tag v1.5.0
git push origin main v1.5.0
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

## Deployment & Hosting 部署与托管

You are **very welcome** to deploy this application to your own personal website, blog, or server!

我们**非常欢迎**你将此应用部署到自己的个人网站、博客或服务器上！

We want this tool to be accessible to everyone who needs it. You do not need explicit permission to host it.

我们希望所有需要这款工具的人都能方便地使用它。你无需额外获得授权即可自行托管与部署。

**Attribution Requirement 署名要求**

If you deploy this app publicly, please: / 如果你将该应用公开部署，请：

1. **Keep the original algorithm credits**: Visibly link back to the [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test) repository.

   **保留原始算法的鸣谢信息**：在显眼位置添加指向 [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test) 仓库的链接。

2. **Respect the license**: Ensure you follow any licensing terms associated with the original algorithm code.

   **遵守许可协议**：确保你遵循原始算法代码所适用的全部许可条款。

---

Wishing steady progress and good health to everyone who uses this tool.

---

## Contributing 参与贡献

Contributions are welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup,
a map of the code and how to add a translation, and please follow the
[Code of Conduct](./CODE_OF_CONDUCT.md). To report a security problem, see
[SECURITY.md](./SECURITY.md).

欢迎参与贡献。开发环境、代码结构与新增翻译的方法见 [CONTRIBUTING.md](./CONTRIBUTING.md)，
请遵守[行为准则](./CODE_OF_CONDUCT.md)。报告安全问题请参阅 [SECURITY.md](./SECURITY.md)。

Thanks to everyone who has contributed 感谢每一位贡献者:

<a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=xunxunProjects/Oyama-s-HRT-Tracker" alt="Contributors 贡献者" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

---

## License 许可

本项目遵守 MIT License。See [LICENSE](./LICENSE) for details.
