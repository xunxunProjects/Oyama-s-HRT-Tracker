# 源代码文件清算审计（2026-11-05）

> 口径：仓库内被 Git 跟踪的源代码文件，单文件 **> 20 KB**。
> 已排除 `node_modules/`、`.git/`、`dist/`、`coverage/`、`.wrangler/`。
> 体积取整到 KB，行数来自 `wc -l`。这不是“代码质量判决”，只是拆分优先级清单。

## 总览

- 共 **42** 个文件超过 20 KB：**35 个生产代码** + **7 个测试/E2E**。
- 两个领域巨石：`logic.ts`（200 KB / 4,898 行）和 `worker.ts`（223 KB / 4,165 行）。
- 七个 UI 巨石（Account、ResultChart、DoseForm、App、Admin、TwoFactor、Home）合计约 **432 KB / 8,557 行**。
- 七个数据/样式巨石（translations、opsec、share、motion.css、index.css、PixelCat、Doodle）合计约 **737 KB**。
- `.wrangler/tmp/dev-yWq0kb/worker.js`（811 KB）是构建产物，**不是清算对象**。

## 优先级

| 级别   | 含义                             | 文件                                                                                                                                                                                                                                                                                          |
| ------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | 先拆，影响面最大或安全敏感       | `logic.ts`、`worker.ts`                                                                                                                                                                                                                                                                       |
| **P1** | 领域/状态核心，拆完收益高        | `backupBundle.ts`、`backupImport.ts`、`syncMerge.ts`、`App.tsx`、`useAppData.ts`、`Account.tsx`、`DoseForm.tsx`、`ResultChart.tsx`                                                                                                                                                            |
| **P2** | 页面/功能模块，按使用频率拆      | `f2f.ts`、`hrtPairing.ts`、`regimen.ts`、`Admin.tsx`、`TwoFactor.tsx`、`Home.tsx`、`CommunityVote.tsx`、`History.tsx`、`F2f.tsx`、`Onboarding.tsx`、`ForecastChart.tsx`、`ShareSettings.tsx`、`PublicShare.tsx`、`Supplies.tsx`、`useCloudSync.ts`、`Forecast.tsx`、`Settings.tsx`、`Lab.tsx` |
| **P3** | 数据/样式/测试，机械拆分，放最后 | `translations.ts`、`opsec.ts`、`share.ts`、`motion.css`、`index.css`、`PixelCat.tsx`、`Doodle.tsx`、7 个测试文件                                                                                                                                                                              |

---

## P0：领域巨石

### `logic.ts` — 200 KB / 4,898 行 / 142 个导出

**内容**：类型与枚举、游离/生物可利用 T、Hct、闭经、体成分、血脂、VTE、性腺切除、5α 还原酶、GnRH、剂量建议、校准栈（EKF/MIPD/OU-Kalman/Full Bayes）、PK 参数表、`getBioavailabilityMultiplier`、`resolveParams`、`PrecomputedEventModel`、`runSimulation`、插值、跨男整合、HPG、加密/压缩、实验室时间。

**问题**：至少 12 个互不相干的关注点；`getBioavailabilityMultiplier` + `resolveParams` 是两层按药/按路线的嵌套 switch；97 个文件从根 `logic.ts` 导入。

**拆法**：见下方“logic.ts 目标结构”。根 `logic.ts` 保留为纯 façade（`export *`），不改 97 个导入点。

### `worker.ts` — 223 KB / 4,165 行

**内容**：Cloudflare Worker 入口与几乎全部 HTTP 路由：登录/注册、JWT、2FA/Passkey、用户资料/头像、会话、分享链接、内容/备份、管理员、公告、投票、HRT/F2F 分发、限流。

**问题**：单个 `fetch` 内是超长 if/else 路由树；认证、分享、管理员、备份逻辑混在一起。已经拆出了 `toolApi.ts`、`hrtPairing.ts`、`f2f.ts`、`communityVoteServer.ts`、`contentStore.ts`，但主文件仍是 4k 行。

**拆法**：先抽纯 handler，再上路由表。

- `src/server/routes/auth.ts`（登录、注册、2FA、Passkey）
- `src/server/routes/account.ts`（资料、密码、头像、会话）
- `src/server/routes/shares.ts`
- `src/server/routes/content.ts`（备份内容）
- `src/server/routes/admin.ts`
- `src/server/routes/notice.ts`
- `src/server/routes/vote.ts`
- `src/server/router.ts`（`path + method -> handler`）
- `worker.ts` 只保留 `Env`、中间件、限流、CORS、静态资源兜底。

**注意**：这是安全敏感路径，必须一个 PR 只搬一组路由，现有 `tests/toolInterface.test.ts`、`tests/f2f.test.ts` 必须全程绿。

---

## P1：领域/状态核心

| 文件                             |     体积/行数 | 现状                                                                                            | 建议拆法                                                                                                                                    |
| -------------------------------- | ------------: | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/backupBundle.ts`      | 91 KB / 2,289 | 校验 + 导出 + 解析/预览 + 合并/替换，35 个导出                                                  | `backup/types.ts`、`backup/validate.ts`、`backup/export.ts`、`backup/parse.ts`、`backup/reconcile.ts`、`backup/merge.ts`、`backup/index.ts` |
| `src/utils/backupImport.ts`      |   23 KB / 598 | 导入数据的 process/merge 两条路径                                                               | 与 `backupBundle` 同目录，按 `process` / `merge` / `reconcile` 拆                                                                           |
| `src/utils/syncMerge.ts`         |   20 KB / 523 | tombstone、normalize、stable stringify、merge、fingerprint，25 个导出                           | `sync/tombstones.ts`、`sync/normalize.ts`、`sync/merge.ts`、`sync/fingerprint.ts`                                                           |
| `src/App.tsx`                    | 59 KB / 1,345 | 63 个 import、20 个 useState、12 个 useEffect；路由、Provider、认证、同步、主题、引导、页面守卫 | `app/routes.tsx`、`app/useAppShell.ts`、`app/useTheme.ts`、`app/guards.tsx`；`App.tsx` 只做组合                                             |
| `src/hooks/useAppData.ts`        |   40 KB / 949 | 存储命名空间、登录后数据迁移、events/labs/templates/quickDoses/supplies/plan、派生 day groups   | `useAppData/storageNamespace.ts`、`useEvents.ts`、`useLabs.ts`、`useTemplates.ts`、`useSupplies.ts`、`usePlan.ts`，在原 hook 里组合         |
| `src/pages/Account.tsx`          | 89 KB / 1,451 | 登录/注册、2FA/Passkey、会话、云备份、同步解锁、头像、删号；26 个 useState                      | `account/AuthPanel.tsx`、`CloudBackupPanel.tsx`、`SessionsPanel.tsx`、`ProfilePanel.tsx`                                                    |
| `src/components/DoseForm.tsx`    | 67 KB / 1,405 | 表单状态机、校验、模板、快速剂量、时间选择；23 个 useState。路线字段已拆到 `dose_form/`         | 继续抽 `useDoseForm.ts`、`TemplatePicker.tsx`、`TimePicker.tsx`、`DoseMetaFields.tsx`                                                       |
| `src/components/ResultChart.tsx` | 71 KB / 1,520 | 图表几何、坐标轴、拖拽/缩放、系列选择、CPA 轴、入场动画；10 个 useState、7 个 useEffect         | `chart/geometry.ts`、`chart/series.ts`、`chart/axes.ts`、`chart/useChartDrag.ts`、`chart/ResultChart.tsx`                                   |

---

## P2：页面/功能模块

| 文件                               |     体积/行数 | 现状                                              | 建议拆法                                                                               |
| ---------------------------------- | ------------: | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `f2f.ts`                           |   32 KB / 830 | F2F service、CLI code exchange、web、cohort sweep | `f2f/service.ts`、`cli.ts`、`web.ts`、`cohorts.ts`、`types.ts`                         |
| `hrtPairing.ts`                    |   30 KB / 754 | capability、service、web、device token            | `hrt/pairing/{capability,service,web,token}.ts`                                        |
| `src/utils/regimen.ts`             |   27 KB / 748 | 方案识别、预测、库存 pack/status，25 个导出       | `regimen/detect.ts`、`forecast.ts`、`supplies.ts`、`types.ts`                          |
| `src/pages/Admin.tsx`              | 58 KB / 1,212 | 公告、用户搜索/分页、用户面板、存储报告、2FA/备份 | `admin/NoticePanel.tsx`、`UsersPanel.tsx`、`UserRow.tsx`、`StoragePanel.tsx`           |
| `src/pages/TwoFactor.tsx`          |   46 KB / 899 | TOTP、Passkey、备份码；31 个 useState             | `twoFactor/TotpPanel.tsx`、`PasskeyPanel.tsx`、`BackupCodesPanel.tsx` + `useTwoFactor` |
| `src/pages/Home.tsx`               |   42 KB / 725 | 首页读数、计划行、今日剂量、库存提醒、猫          | `home/Reading.tsx`、`PlanRows.tsx`、`TodayDoses.tsx`、`SupplyNotice.tsx`               |
| `src/pages/CommunityVote.tsx`      |   38 KB / 784 | 投票 tally 子组件 + 表单                          | `communityVote/Tally*.tsx`、`VoteForm.tsx`                                             |
| `src/pages/History.tsx`            |   35 KB / 709 | 按天分组、批量添加/删除、选择、折叠、滚动定位     | `history/DayGroup.tsx`、`BatchAdd.tsx`、`SelectionBar.tsx`、`useHistoryScroll.ts`      |
| `src/pages/F2f.tsx`                |   29 KB / 594 | 密钥环 UI 的步骤                                  | `f2f/KeyList.tsx`、`UploadForm.tsx`、`Instructions.tsx`                                |
| `src/pages/Onboarding.tsx`         |   29 KB / 611 | 引导流程 + 曲线                                   | `onboarding/Steps.tsx`、`Curve.tsx`、`storage.ts`                                      |
| `src/components/ForecastChart.tsx` |   27 KB / 617 | 方案预测图                                        | `forecastChart/geometry.ts`、`Series.tsx`、`ForecastChart.tsx`                         |
| `src/pages/ShareSettings.tsx`      |   26 KB / 518 | 分享创建/列表/撤销、密码熵、过期                  | `share/CreateShareForm.tsx`、`ShareList.tsx`、`useShareSettings.ts`                    |
| `src/pages/PublicShare.tsx`        |   26 KB / 588 | 公开分享解锁 + 记录展示                           | `publicShare/UnlockGate.tsx`、`SharedRecord.tsx`、`DoseHistoryRow.tsx`                 |
| `src/pages/Supplies.tsx`           |   25 KB / 493 | 库存表单/状态                                     | `supplies/SupplyRow.tsx`、`PackFields.tsx`、`useSupplies.ts`                           |
| `src/hooks/useCloudSync.ts`        |   25 KB / 576 | 同步状态机 + 错误文案                             | `sync/useCloudSync.ts`、`describeSyncError.ts`、`state.ts`                             |
| `src/pages/Forecast.tsx`           |   24 KB / 577 | 方案编辑器 + 场景模拟                             | `forecast/PlanEditor.tsx`、`ScenarioCard.tsx`、`useForecast.ts`                        |
| `src/pages/Settings.tsx`           |   22 KB / 547 | 设置导航 + 表单行                                 | `settings/sections/*.tsx`，保留导航壳                                                  |
| `src/pages/Lab.tsx`                |   20 KB / 373 | 实验室表单/列表，3 个 useState                    | 优先级最低；可拆 `lab/LabForm.tsx`、`LabList.tsx`                                      |

---

## P3：数据/样式/艺术资源

| 文件                          |      体积/行数 | 现状                                                                        | 建议拆法                                                                                                                      |
| ----------------------------- | -------------: | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/translations.ts`    | 450 KB / 7,404 | 7 种语言；`TRANSLATIONS_BASE.zh` + `ZH_TW` + `yue`/`en`/`ja`/`ko`/`tr` 覆盖 | `src/i18n/locales/<lang>.ts`，`index.ts` 负责组合。**保持 spread 顺序和 fallback 语义**（注释明确说 `yue` 缺 key 会漏到简体） |
| `src/content/opsec.ts`        | 159 KB / 2,046 | OpSec 内容块；zh、zh-TW、en，ja/ko/tr 回退 en                               | 按语言 + 章节拆 `opsec/zh.ts`、`opsec/en.ts`、`opsec/zh-TW.ts`、`opsec/types.ts`、`opsec/index.ts`                            |
| `src/i18n/share.ts`           |    33 KB / 561 | 分享页文案，按语言                                                          | `share/en.ts`、`share/zh.ts` 等；`ShareCopy` 类型独立                                                                         |
| `src/styles/motion.css`       |  26 KB / 1,034 | 已按 keyframes/pages/ink/in-place/sidebar/controls/charts/pixel-cats 分节   | `styles/motion/{keyframes,pages,ink,controls,charts,pixel-cats}.css`，原文件 `@import`                                        |
| `src/index.css`               |    24 KB / 775 | Tailwind 入口 + tokens + base + utilities + components                      | 可拆 `base.css`、`utilities.css`、`components.css`；**注意 Tailwind v4 `@layer` 顺序**                                        |
| `src/components/PixelCat.tsx` |    23 KB / 830 | 大量 ASCII 帧常量                                                           | `pixel-cat/frames.ts`、`renderer.tsx`、`types.ts`                                                                             |
| `src/components/Doodle.tsx`   |    22 KB / 434 | `DRAWINGS` SVG 路径数据                                                     | `doodle/drawings.tsx`、`doodle/index.tsx`                                                                                     |

---

## P3：测试/E2E

测试文件不建议单独“为了拆而拆”；跟着对应领域模块一起拆，保证每个 PR 的测试范围清晰。

| 文件                          |     体积/行数 | 现状                     | 建议                                        |
| ----------------------------- | ------------: | ------------------------ | ------------------------------------------- |
| `tests/backupBundle.test.ts`  | 60 KB / 1,311 | 41 个 it                 | 按 validate / export / reconcile / merge 拆 |
| `tests/regressions.test.ts`   |   38 KB / 802 | 10 个 describe、49 个 it | 按回归领域拆                                |
| `tests/backupImport.test.ts`  |   24 KB / 583 | 16 个 it                 | process / merge 两组                        |
| `tests/toolInterface.test.ts` |   22 KB / 541 | 29 个 it                 | 按 Tool API 端点组拆                        |
| `tests/f2f.test.ts`           |   22 KB / 532 | 23 个 it                 | service / web / cohort                      |
| `e2e/complete-backup.spec.ts` |   21 KB / 515 | 8 个 test                | 一条完整用户旅程，可保留单文件              |
| `tests/routes.test.ts`        |   20 KB / 466 | 27 个 it                 | 按 route family 拆                          |

---

## `logic.ts` 目标结构（本次纯搬家）

原则：**不改数值、不改公开 API、不改 97 个导入点**。根 `logic.ts` 变成 façade。

```text
src/domain/
  types.ts                  # Route, Ester, HRTMode, ExtraKey, DoseEvent, SimulationResult, LabResult, ...
  constants.ts              # T_ESTERS, UNMODELLED_DRUGS, GEL_SITE_ORDER, 边界值...
  dispatch.ts               # 父级调度：按 route × ester 选模块
  shared/
    activeParams.ts         # _activePKParams / applyPKOverrides / getActivePKParams
    zero.ts                 # 非法组合的 ZERO_PK_PARAMS（保持现有字段）
    math.ts                 # oneCompAmount, _analytic2C, _analytic3C
    eventModel.ts           # PrecomputedEventModel / computeMaxLifetimeH
    patch.ts                # patchRemovalTimes 等共用配对逻辑
  transfem/
    e2-injection.ts         # EB/EV/EC/EN/EU 注射
    e2-sublingual.ts        # E2 舌下（含 tier/theta）
    e2-gel.ts               # E2 凝胶
    e2-patch.ts             # E2 贴片（apply/remove）
    e2-oral.ts              # E2 口服
    cpa-oral.ts             # CPA 口服
    bica-oral.ts            # BICA 口服
  transmasc/
    t-injection.ts          # T/TC/TE/TU 注射
    t-gel.ts                # T 凝胶（含 gel site）
    t-patch.ts              # T 贴片
    t-oral.ts               # TU 口服
    t-nasal.ts              # T 鼻用
    t-sc.ts                 # T 皮下
    t-pellet.ts             # T 埋植
  features/
    testosterone.ts         # free/bioavailable T
    hct.ts
    amenorrhea.ts
    bodyComp.ts
    lipids.ts
    vte.ts
    gonadectomy.ts
    fiveAlpha.ts
    gnrh.ts
    hpg.ts
    assay.ts
  calibration/
    index.ts
    points.ts
    ekf.ts
    mipd.ts
    ouKalman.ts
    bayes.ts
  simulation/
    runSimulation.ts
    interpolate.ts
    transmascIntegration.ts
  crypto.ts                 # encryptData/decryptData/cloud payload
  labs.ts                   # labDoseContext/rawModelAtLab/labInModelUnit
  advisories.ts             # getDoseAdvisory/getHormoneLevelAdvisory
  index.ts                  # 公共 API 汇总
```

每个 `transfem/*.ts` / `transmasc/*.ts` 模块导出同一套契约（名称可在实现时微调）：

```ts
export interface PkRouteModule {
  route: Route;
  esters: readonly Ester[];
  bioavailability(ester: Ester, extras: Partial<Record<ExtraKey, number>>): number;
  resolveParams(event: DoseEvent, birthYear: number | null): PKParams;
  buildAmount(event: DoseEvent, params: PKParams, allEvents: DoseEvent[]): (tauH: number) => number;
}
```

`dispatch.ts` 只做两件事：

1. `moduleFor(route, ester)`：按 `route + ester` 找模块，找不到返回 `null`；
2. `resolveParams` / `getBioavailabilityMultiplier` / `buildEventModel` 调对应模块，非法组合回退到 `ZERO_PK_PARAMS`。

根 `logic.ts`：

```ts
export * from './src/domain';
```

### 迁移顺序（每一步都可单独跑测试）

1. `types.ts` + `constants.ts`：先搬类型/常量，`logic.ts` 从新文件 re-export。
2. `shared/`：搬 `activeParams`、`zero`、`math`、`eventModel`、`patch`。
3. `transfem/` + `transmasc/`：按 route 搬 `getBioavailabilityMultiplier`、`resolveParams`、`PrecomputedEventModel` 的 case。
4. `dispatch.ts`：替换三处 switch，保持返回值和 fallback 不变。
5. `features/`、`calibration/`、`simulation/`、`crypto.ts`、`labs.ts`、`advisories.ts`：其余关注点搬出。
6. `src/domain/index.ts` + 根 `logic.ts` façade。
7. 全量验证：`npm test`、`npx tsc --noEmit`、`npm run lint`、`npm run format:check`、`npm run build`。

### 验证纯搬家的硬条件

- `logic.ts` 的导出名集合前后一致（142 个）。
- 所有现有测试不改断言、不改 import 路径。
- `shbg.ts` 的 `SimulationResult` 类型导入不能形成运行时循环。
- 非法组合（如 CPA 非口服、BICA 非口服、未知 ester）仍返回原来的零值参数。
- patch apply/remove 配对、舌下 tier/theta、gel site、年龄协变量、PK override 的行为不变。

---

## 建议执行顺序（跨文件）

1. **本次**：`logic.ts` 纯搬家。
2. `worker.ts` 路由组抽取（安全敏感，单独 PR）。
3. backup/sync 三件套（`backupBundle`、`backupImport`、`syncMerge`）。
4. `App.tsx` + `useAppData.ts` + `Account.tsx`。
5. `DoseForm.tsx` + `ResultChart.tsx`。
6. 数据/样式/艺术资源（translations、opsec、share、CSS、PixelCat、Doodle）。
7. 测试跟随对应领域拆，不单独做“大爆炸”。
