<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/hero-dark.png" />
    <img src="./docs/images/hero-light.png" alt="手机上的 Oyama's HRT Tracker：当前估算的雌二醇浓度、今天的剂量和浓度曲线，旁边是一个月的雌二醇曲线" />
  </picture>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;&nbsp;&nbsp;
  <b>简体中文</b>
</p>

<p align="center">
  记录 HRT 用药，看见它们带来的激素水平。私密、开源、免费。
</p>

<p align="center">
  <a href="https://hrt.mahiro.uk"><b>在浏览器中打开</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/releases/latest"><b>macOS 与 Windows 桌面版</b></a>
  &nbsp;&nbsp;&nbsp;
  <a href="#docker"><b>用 Docker 自行部署</b></a>
</p>

# 目录

- [介绍](#介绍)
- [功能](#功能)
  - [有什么不同](#有什么不同)
  - [激素水平](#激素水平)
  - [用药与方案](#用药与方案)
  - [检查结果](#检查结果)
  - [药量库存](#药量库存)
  - [备份与分享](#备份与分享)
  - [模型来源](#模型来源)
- [命令行工具](#命令行工具)
- [自行部署](#自行部署)
- [参与贡献](#参与贡献)
- [给 AI 开发者](#给-ai-开发者)
- [支持](#支持)
- [法律信息](#法律信息)

# 介绍

**Oyama's HRT Tracker**（HRT 记录工具）是一个注重隐私的工具，用于记录激素替代疗法用药，并模拟这些剂量带来的激素水平。它提供女性化模式（雌二醇，以及醋酸环丙孕酮）和男性化模式（睾酮），也可以记录其他辅助用药。

**可以在浏览器中使用，也可以安装为应用、在 macOS 与 Windows 上运行，或部署到你自己的服务器。**

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/images/gallery-dark.png" />
    <img src="./docs/images/gallery-light.png" alt="应用的六个页面：概览、浓度曲线、方案试算、用药记录、检查结果和记录剂量" />
  </picture>
</p>

从左到右依次是：当前估算浓度的概览、一个月的雌二醇曲线、方案试算、用药记录、与模型对照的检查结果，以及记录新的剂量。截图使用的是示例数据，重新生成的方法见 [design/readme](./design/readme/README.md)。

> [!WARNING]
> **不构成医疗建议。** 本应用展示的是药代动力学模型的估算值，可能与你真实的激素水平相差很大，不能替代抽血检查或医生的判断。请勿仅凭本应用开始、停止或调整任何用药。

# 功能

## 有什么不同

- **默认私密**：记录保存在你的浏览器里，只有在你开启云备份或创建分享链接时才会上传，而且两者都是端到端加密的。
- **开源**：全部代码以 MIT 许可公开，任何人都可以查看估算是怎么算出来的。
- **免费**：没有订阅，没有付费功能，也没有广告。
- **多语言**：简体中文、繁体中文、粤语、英语、日语、韩语和土耳其语。

## 激素水平

- 查看随时间变化的估算浓度：雌二醇 pg/mL、醋酸环丙孕酮 ng/mL、总睾酮 ng/dL
- 雌二醇支持注射（苯甲酸酯、戊酸酯、环戊丙酸酯、庚酸酯，以及 Beta 阶段的十一酸酯）、口服、舌下、凝胶与贴片
- 睾酮支持注射（环戊丙酸酯、庚酸酯、十一酸酯）与凝胶
- 舌下给药时，可以选择含服时间（2 到 15 分钟）或自行填写

## 用药与方案

- 记下你使用的药物与频率，概览页会显示今天待用的剂量，一键即可记录
- 在方案试算中对比维持现状与计划中的调整
- 也可以记录螺内酯、比卡鲁胺、醋酸甲羟孕酮、雷洛昔芬、亮丙瑞林与曲普瑞林；它们没有浓度模型，因此不会绘制曲线

## 检查结果

- 记录抽血检查结果，并在曲线上与估算值对照
- 用 EKF、OU-Kalman 或 MIPD 按你的情况校准雌二醇模型，也可以手动编辑参数

## 药量库存

- 记录每种药物的存量
- 记录的用量会自动扣除，快用完时概览页会提前提醒

## 备份与分享

- 使用端到端加密的云备份，或导出为文件
- 分享一个只读链接，包含用药记录与曲线；密钥只在链接里，检查结果、体重和账户信息都不会包含在内
- 完整细节见[隐私说明](./PRIVACY.zh-CN.md)

## 模型来源

雌二醇的药代动力学模型基于 **@LaoZhong-Mihari** 在 **[HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)** 仓库中提供的 `PKcore.swift` 与 `PKparameter.swift`，其中的三室模型、双相肌注库房动力学与舌下吸收分层均来自该仓库。

此后本项目对模型做了调整和扩展：为男性化模式加入了睾酮（注射用酯、凝胶与贴片），为醋酸环丙孕酮加入了单独的曲线，并新增了十一酸雌二醇注射；调整了凝胶与舌下给药的处理；还可以用你的检查结果校准雌二醇曲线。详情见 [Algorithm Explanation.md](./Algorithm%20Explanation.md)。

# 命令行工具

离线工具位于独立仓库 **[Oyama-s-HRT-Tracker-Tools](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools)**。其中的 [`hrt-tool`](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools/blob/main/tools/hrt-tool/README.md) 是面向同一份数据的预发布命令行客户端：

- 用 `status` 查看当前估算值、未来各时间点的预测浓度与最近的检查结果；
- 用 `add dose` 交互式记录一次用药；
- 用 `proxy socks5://…` 通过 Tor 或 I2P 连接，域名由代理解析；
- 保管库、会话和具名连接均加密存储。

命令行工具仍在实验阶段，网站不依赖它，也不会接触 OpenPGP 密钥或口令。构建方式与发布下载见 [Tools 仓库](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker-Tools)。

# 自行部署

我们**非常欢迎**你把这个应用部署到自己的网站或服务器上，无需事先询问。最简单的方式是 Docker；如果想部署到自己的 Cloudflare 账号，请看 [Cloudflare](#cloudflare)。

## Docker

Docker 镜像会在本地运行完整应用，包括 Worker API、D1 数据库和兼容 R2 的头像存储。
数据直接保存在项目目录的 `./data` 中，容器重启不会丢失。镜像会在你的机器上从源码构建，
需要先安装 Git 和带 Compose 的 Docker。

```bash
git clone https://github.com/xunxunProjects/Oyama-s-HRT-Tracker.git
cd Oyama-s-HRT-Tracker
cp .env.docker.example .env
# 把 .env 里的 JWT_SECRET 换成下面这条命令的输出：
openssl rand -base64 48
mkdir -p ./data
sudo chown 1000:1000 ./data
docker compose up -d --build
```

然后访问 <http://localhost:8787>。端口只发布在 `127.0.0.1` 上，默认局域网内无法
访问；除非前面有反向代理，或者你确实需要，否则不要改成 `compose.yaml` 里的
`"8787:8787"`。

第一次构建需要几分钟。以后更新时，拉取新代码并重新构建即可，`./data` 中的数据会保留：

```bash
git pull
docker compose up -d --build
```

### 关于 http 与 https

在其他设备上通过 http 访问（例如 `http://192.168.1.5:8787`）时，需要先把端口发布到
局域网接口——把 compose 里的映射改成 `"8787:8787"`——或在前面加一个反向代理。
通过普通 http 访问时，备份、导出和分享链接依然是端到端加密的。不过浏览器只在
https（或 `localhost`）下开放少数功能：安装为应用、离线使用和
通行密钥登录。需要这些功能时，可以在容器前面加一个 https 反向代理，例如
[Caddy](https://caddyserver.com/docs/quick-starts/reverse-proxy)
（`caddy reverse-proxy --from 你的域名 --to localhost:8787`）或
[Tailscale Serve](https://tailscale.com/kb/1312/serve)。

### 数据库结构

数据库结构只由 `migrations/` 目录定义。容器每次启动都会自动应用迁移；旧版镜像创建的
数据卷会先经过 `docker/reconcile.mjs` 对账，升级无需手动操作。

在 Cloudflare 上部署时，第一次部署包含 `0000` 迁移的版本之前，先执行一次这两步：

```bash
npm run wrangler:migrate:reconcile
npm run wrangler:migrate:remote
```

Web 与 Docker 版本默认使用同源的 `/api` 请求。桌面版和其他使用自定义协议的版本，需要在构建时把
`VITE_API_ORIGIN` 设为对应的 Worker 或 API 地址；发布流程会自动填入官方托管的地址。

停止应用但保留数据：

```bash
docker compose down
```

不使用 Compose 时，可以直接用 Docker 构建并运行：

```bash
docker build -t hrt-tracker:local .
docker run -d --name hrt-tracker \
  -p 127.0.0.1:8787:8787 \
  --env-file .env \
  -v "$(pwd)/data:/data" \
  hrt-tracker:local
```

上面的映射只绑定本机回环地址。确实需要暴露到局域网时再用 `-p 8787:8787`，
并且永远不要把端口直接暴露到公网：请在前面放一个负责 TLS 的反向代理（或
Tor/I2P 守护进程）。

`ADMIN_USERNAME` 与 `ADMIN_PASSWORD` 是可选项；如需管理员账号，请同时设置。
容器使用 Wrangler 的本地 workerd 运行时以及本地持久化 D1/R2 资源，不会连接
Cloudflare 生产数据库或存储桶。

`TRUSTED_IP_SOURCE` 也是可选项。默认是 `none`，因为客户端可以自己设置
`CF-Connecting-IP` 或 `X-Forwarded-For`。只有当 Cloudflare 确实在前面、并且
其边缘会覆盖 `CF-Connecting-IP` 时才设为 `cf`；只有当恰好一层可信反向代理在前面、
并且它会追加客户端地址时才设为 `x-forwarded-for`。设为 `none` 时，每个接口共用
一个限额，而不是按地址分别限额。`docker-install.sh` 会按模式设置对应的值；如果
手工配置代理，要让代理覆盖对应的头，而不是把客户端的值原样传进来。

`PUBLIC_APP_ORIGIN`（例如 `https://hrt.example.com`）也是可选项。分享链接会用这个
地址；代理没有把浏览器的 `Host` 头传进来时，通行密钥登录也认这个地址。

`.github/workflows/docker-publish.yml` 会在 PR 中验证构建，并在 `main`、版本标签或
手动运行时向 GitHub Container Registry 发布 `linux/amd64` 与 `linux/arm64` 镜像。
该镜像包目前是私有的，没有权限时无法拉取，请按上面的步骤从源码构建。

## Cloudflare

`wrangler.toml` 里写的是维护者自己的数据库和存储桶，这些 ID 只在维护者的 Cloudflare
账号里有效，所以需要换成你在自己账号里创建的资源。下面的命令都在你克隆下来的仓库里运行。

1. **登录**

   ```bash
   npm install
   npx wrangler login
   ```

2. **创建数据库**

   ```bash
   npx wrangler d1 create hrt-tracker-prod
   ```

   把命令输出的 `database_id` 填进 `wrangler.toml` 的 `[[d1_databases]]` 中，替换原来的值。
   请保留 `hrt-tracker-prod` 这个名字，下面的 npm 脚本会用到它。

3. **创建头像存储桶**

   ```bash
   npx wrangler r2 bucket create hrt-tracker-avatars
   ```

   把 `[[r2_buckets]]` 中的 `bucket_name` 改成 `hrt-tracker-avatars`（或你取的名字）。第一次创建
   存储桶之前，需要先在 Cloudflare 控制台里开通一次 R2。

4. **删除预览配置**

   删除 `wrangler.toml` 末尾所有 `[[previews.*]]` 开头的配置。它们指向维护者的预览数据库，
   只给 Workers Builds 的拉取请求预览使用。如果你也需要预览，可以再建一个数据库和存储桶，把它们的
   名字和 ID 填在那里。

5. **创建数据表**

   ```bash
   npm run wrangler:migrate:remote
   ```

   以后拉取的更新如果在 `migrations/` 里加了新文件，请再运行一次。

6. **部署**

   ```bash
   npm run build
   npx wrangler deploy
   ```

   Wrangler 会输出一个 `workers.dev` 地址。想使用自己的域名，可以在 Cloudflare 控制台的 Worker
   设置里的 Domains & Routes 添加。如果分享链接需要使用与访问地址不同的域名，可以设置变量
   `PUBLIC_APP_ORIGIN`（例如 `https://hrt.example.com`）。

7. **设置密钥**

   登录功能需要 `JWT_SECRET`，请在第一次部署后马上设置。

   ```bash
   openssl rand -base64 48 | npx wrangler secret put JWT_SECRET
   # 可选的内置管理员账号，要么都设置，要么都不设置
   npx wrangler secret put ADMIN_USERNAME
   npx wrangler secret put ADMIN_PASSWORD
   ```

如果希望每次推送都自动部署，先把上面对 `wrangler.toml` 的修改提交到你的分叉仓库，再在 Worker
设置的 Builds 里连接仓库，构建命令填 `npm run build`，部署命令填 `npx wrangler deploy`。

## 署名要求

如果你将该应用公开部署，请：

1. **保留原始算法的鸣谢信息**：在显眼位置添加指向 [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test) 仓库的链接。

2. **遵守许可协议**：确保你遵循原始算法代码所适用的全部许可条款。

# 参与贡献

欢迎参与贡献，不会写代码也一样可以帮忙。本地运行、代码结构、新增翻译与发布新版本的方法见 [CONTRIBUTING.md](./CONTRIBUTING.md)，请遵守[行为准则](./CODE_OF_CONDUCT.md)。报告安全问题请参阅 [SECURITY.md](./SECURITY.md)。

# 给 AI 开发者

如果你是正在这个仓库里工作的 AI agent，请先阅读 [docs/AI-GUIDE.md](./docs/AI-GUIDE.md)，再修改代码。这份文档说明了仓库结构与模块边界、数据与信任边界、CI 会运行的检查，以及修改模型、数据库、API 和部署脚本时必须遵守的规则。

这份指南使用英文，方便不同的 AI agent 与工具共用同一份规范；面向人的 README 与 [CONTRIBUTING.md](./CONTRIBUTING.md) 仍保留中英双语。

# 支持

<p align="center">
  <b>维护者</b>
  <br />
  <a href="https://github.com/SmirnovaOyama">@SmirnovaOyama</a>
  <br />
  <a href="https://github.com/fantuanmtf">@fantuanmtf</a>
  <br />
  <br />
  <b>原始模型</b>
  <br />
  <a href="https://github.com/LaoZhong-Mihari">@LaoZhong-Mihari</a>
  <br />
  <br />
  <b><a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/graphs/contributors">贡献者</a></b>
  <br />
  <br />
  <a href="https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=xunxunProjects/Oyama-s-HRT-Tracker" alt="贡献者" />
  </a>
</p>

发现问题或有新想法？欢迎[提交 issue](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/issues/new/choose)。

祝每一位使用这个工具的人一切顺利，身体健康。

# 法律信息

**Oyama's HRT Tracker 仅供参考，不构成医疗建议。估算值来自模型，可能与你真实的激素水平相差很大。使用风险由你自行承担，任何治疗调整请先咨询医生。**

本项目遵守 MIT License，详见 [LICENSE](./LICENSE)。数据的处理方式见[隐私说明](./PRIVACY.zh-CN.md)。
