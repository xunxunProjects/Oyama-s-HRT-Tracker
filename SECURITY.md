# Security Policy 安全政策

This app stores health information, so we take security reports seriously and
are grateful for them.

本应用涉及健康信息，因此我们非常重视安全问题，也非常感谢每一份报告。

---

## Reporting a vulnerability 报告漏洞

**Please do not open a public issue, discussion or pull request for a security
problem.** Report it privately instead:

**请不要通过公开的 issue、讨论或 PR 报告安全问题**，请私下报告：

1. Go to the repository's **Security** tab and choose **Report a vulnerability**,
   or open <https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/security/advisories/new>
   directly.

   打开仓库的 **Security** 标签页并选择 **Report a vulnerability**，或直接访问
   <https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/security/advisories/new>。

2. Describe the problem, how to reproduce it, which version or deployment it
   affects, and what an attacker could do with it. A proof of concept helps, but
   please use test accounts and never access data that is not yours.

   描述问题、复现步骤、受影响的版本或部署，以及攻击者可能借此做什么。附上概念验证会很有帮助，
   但请使用测试账号，切勿访问不属于你的数据。

Only the maintainers can see the report. You can write in English or Chinese.

报告仅维护者可见，中英文皆可。

### What to expect 处理流程

- We aim to acknowledge a report within **7 days** and to share our assessment
  and a plan soon after.

  我们会尽量在 **7 天内**确认收到报告，并随后告知评估结果与处理计划。

- We fix confirmed problems in a new release and publish a GitHub security
  advisory once users can update. We are happy to credit you there unless you
  prefer to stay anonymous.

  确认的问题会在新版本中修复，并在用户可以更新后发布 GitHub 安全公告。除非你希望匿名，
  我们很乐意在公告中致谢。

- Please give us a reasonable chance to fix the problem before disclosing it
  publicly.

  在公开披露之前，请给我们合理的修复时间。

## Supported versions 支持的版本

Security fixes go into the latest release and the hosted site. Please update to
the latest release before reporting, and tell us if an older version you rely
on is affected.

安全修复会进入最新版本与官方托管站点。报告前请先更新到最新版本；如果你依赖的旧版本受影响，也请告诉我们。

| Version 版本 | Supported 支持 |
| --- | --- |
| Latest release 最新版本 | Yes 是 |
| Older releases 旧版本 | No 否 |

## Scope 范围

In scope: the web app, the Cloudflare Worker API (`worker.ts`), the Docker
image and the desktop app in this repository. Problems in a third-party
deployment should go to whoever runs it, though we would like to hear about
anything that comes from our code.

范围包括本仓库中的网页应用、Cloudflare Worker API（`worker.ts`）、Docker 镜像与桌面应用。
第三方部署的问题请联系其运营者；但如果问题源于我们的代码，也欢迎告诉我们。

Questions about the accuracy of a concentration estimate are not security
issues; please use the issue templates for those.

关于浓度估算准确性的问题不属于安全问题，请使用 issue 模板提交。

---

## Self-hosting securely 安全地自托管

If you run your own copy:

如果你自行部署：

- Set `JWT_SECRET` to a random value of at least 32 characters, for example
  `openssl rand -base64 48`. The Worker refuses to start with a missing, short
  or weak secret. Never commit it.

  将 `JWT_SECRET` 设置为至少 32 个字符的随机值，例如 `openssl rand -base64 48`。
  缺少、过短或过弱的密钥会导致 Worker 拒绝启动。切勿将其提交到代码库。

- `ADMIN_USERNAME` and `ADMIN_PASSWORD` are optional. If you use them, set both
  to strong, unique values and store them as secrets
  (`wrangler secret put`, or the `.env` file for Docker).

  `ADMIN_USERNAME` 与 `ADMIN_PASSWORD` 是可选项。如需使用，请同时设置为强且唯一的值，
  并以 Secret 方式保存（`wrangler secret put`，或 Docker 的 `.env` 文件）。

- Serve the app over HTTPS only.

  仅通过 HTTPS 提供服务。

- Keep up with releases; Dependabot and CodeQL watch this repository, and fixes
  ship in new versions.

  及时跟进新版本；本仓库由 Dependabot 与 CodeQL 持续检查，修复会随新版本发布。

The history of past security changes is in [CHANGELOG.md](./CHANGELOG.md).

以往的安全改进记录见 [CHANGELOG.md](./CHANGELOG.md)。
