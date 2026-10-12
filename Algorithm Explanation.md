# Oyama's HRT Tracker: Pharmacokinetic Models

This document explains the algorithms used for each drug/route, key parameters and units, what was tuned, why we tuned it, and how the implementation evolved. It describes the TypeScript code in `logic.ts`; where a value can be overridden on the in-app PK parameters page, the number given here is the default.

> 模型结构与早期参数来自 **@LaoZhong-Mihari** 的原生 Swift 实现 [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)（`PKcore.swift` / `PKparameter.swift`）。本仓库是它的 TypeScript 移植与扩展。Swift 版的类名与函数名（如 `ParameterResolver`、`ThreeCompartmentModel`、`SimulationEngine`、`dualAbsAmount`、`dualAbs3CAmount`、`injAmount`）在本仓库中不存在，对应的 TS 名称见 §0 与 §12；§8 中较早的条目仍沿用 Swift 版的名称。

---

## 0) 总览（模型架构）

**目标**：用一套轻量的、可解释的 PK 近似模型，覆盖常见雌激素制剂与给药途径（以及口服 CPA 与跨男模式的睾酮），在本地（浏览器或 App 内）实时算出血药浓度-时间曲线与 AUC。

**核心构件（与 `logic.ts` 中的代码对应）**
- **`DoseEvent`**：一次给药事件，带路由 `route`、时间 `timeH`（自 1970 年起的小时数）、剂量 `doseMG`、酯别 `ester` 与附加字段 `extras`（如凝胶部位 `gelSite`、贴片标称释放速率 `releaseRateUGPerDay`（µg/day）、计划佩戴时长 `patchWearH`、舌下档位 `sublingualTier` 或分流系数 `sublingualTheta`）。
- **`resolveParams` + `getBioavailabilityMultiplier`**：把事件映射为具体参数 `PKParams`（`k1_fast`/`k1_slow`/`k2`/`k3`、`F`、双库或双通路比例 `Frac_fast`、分支生物利用度 `F_fast`/`F_slow`、零阶速率 `rateMGh`）。可由用户覆盖的数值从 `DEFAULT_PK_PARAMS` 读取（经 `applyPKOverrides` 校验合并为 `_activePKParams`）。
- **解析核**：
  - `_analytic3C`：三室模型（吸收 k₁ → 酯水解 k₂ → 游离药物清除 k₃）的解析式；速率重合时先由 `_separateRates` 错开。
  - `_analytic2C` 与 `oneCompAmount`：单室 Bateman 形式（吸收 → 清除，无水解步）。
- **`PrecomputedEventModel`**：为每个事件按路由选用解析核，生成“时间 → 中心室药量”的函数：
  - 注射：快/慢两库各一个 `_analytic3C`（k₂ = 0 时改用 `_analytic2C`）。
  - 口服、凝胶：`oneCompAmount`。
  - 舌下双通路（快：口腔黏膜；慢：吞咽 = 口服）：**E2 两支均为 `_analytic2C`；EV 快支 `_analytic3C`、慢支 `_analytic2C`**。
  - 贴片：零阶输入在佩戴窗口内，移除后按 k₃ 衰减；或一阶“假库”（未填标称释放率时）。
- **`runSimulation`**：先剔除未建模的药物，再把其余 `DoseEvent` 预编译为上述函数，遍历时间点，按 E2 / CPA / 睾酮三组线性叠加各事件的中心室药量，再以各自的分布容积换算为浓度；AUC 用梯形法则积分。

**单位与换算**
- 剂量 `doseMG` 按**所记录化合物（酯）的 mg** 存储，**不是** E2 等效量（见 `DoseEvent.doseMG` 的注释）。记录表单可以输入酯 mg 或 E2 等效 mg，保存时一律换算回酯 mg。中心室药量的计算单位也是 mg。
- 各路由的 `F` 都乘以 `getToE2Factor(ester)` = MW(E2) / MW(酯)，把酯 mg 换算为 E2 mg；对睾酮酯，同一函数返回 MW(T) / MW(酯)。例外：口服 CPA 的 `F` 固定为 0.7，不乘此因子（§13）。

| 酯 | EB | EV | EC | EN | EU | TC | TE | TU |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `getToE2Factor` | 0.7235 | 0.7640 | 0.6868 | 0.7083 | 0.6181 | 0.6990 | 0.7200 | 0.6315 |

E2 与未酯化 T 为 1.0。分子量取自 `EsterInfo`：E2 272.38、EB 376.50、EV 356.50、EC 396.58、EN 384.56、EU 440.66、T 288.42、TC 412.60、TE 400.59、TU 456.70。
- 浓度输出：
  - E2：pg/mL，`conc = amountMG × 1e9 / Vd_ml`。
  - CPA：ng/mL，`conc = amountMG × 1e6 / Vd_CPA_ml`（§13）。
  - 总睾酮：ng/dL，`conc = amountMG × 1e8 / Vd_T_ml`（§14）。
- 体分布体积：`Vd = vdPerKG × BW`。E2 的 `vdPerKG` 为 **2.0 L·kg⁻¹**（固定常量；用户只能设置体重 BW），CPA 为 14.0 L·kg⁻¹，睾酮为 1.0 L·kg⁻¹。

---

## 1) 公共参数（`logic.ts :: CorePK` 与 `DEFAULT_PK_PARAMS`）

| 名称 | 含义 | 默认值 | 备注 |
| --- | --- | --- | --- |
| `vdPerKG` | 表观分布容积（每 kg） | 2.0 L·kg⁻¹ | 固定常量；用于 mg → pg/mL 换算 |
| `vdPerKG_CPA` | CPA 表观分布容积（每 kg） | 14.0 L·kg⁻¹ | 固定常量；CPA 输出 ng/mL，见 §13 |
| `kClear`（运行时读 `e2_kClear`） | 游离 E2 清除速率常数 k₃ | 0.41 h⁻¹ | 对应 t½ ≈ 1.69 h；为经验标定值，用于与项目中目标曲线贴合；可在 PK 参数页修改 |
| `kClearInjection`（运行时读 `e2_kClearInj`） | 注射专用游离 E2 清除速率常数 k₃（仅 injection 路由使用） | 0.041 h⁻¹ | 对应 t½ ≈ 16.9 h；保持 flip‑flop 形状以匹配 EEN/EV/EC 的 Tmax/Cmax，不等同于生理清除；可在 PK 参数页修改 |
| `depotK1Corr` | 注射两库 k₁ 的全局校正系数 | 1.0 | 固定代码常量，界面未开放；改峰/拖尾时可整体缩放 E2 注射的 k₁ |

`CorePK.kClear` 与 `CorePK.kClearInjection` 仍以同样的数值留在代码中，但 `resolveParams` 实际读取的是 `_activePKParams.e2_kClear` 与 `e2_kClearInj`（PK 参数页允许的范围分别为 0.001-5 与 0.001-1 h⁻¹）。

> 注：`kClear` 是游离 E2 中心室的表观清除常数，其锚点来自贴片移除后的终末半衰期（≈ 1-2 h），在此基础上取中间值 **0.41 h⁻¹** 以兼顾舌下与贴片的日内回落。它服务于本项目的简化模型与多路叠加稳定性，并不等价于群体生理清除率，不应外推到人群参数。

**关于 kClear 的来龙去脉**
- **锚点来源**：最初把 `kClear` 定在 1-2 小时的半衰期区间，是依据某些雌二醇贴片的说明书与审评资料对“移除贴片后”的血药下降描述。贴片移除时外源输入为零，后续的下降主要由系统清除主导，因此该时段的终末斜率可以近似视为清除常数 k₃ 的体现。
- **数值选择**：按 `t½ = 1-2 h` 反推 `k = ln2 / t½ ≈ 0.35-0.69 h⁻¹`，本项目选择中间值 `kClear = 0.41 h⁻¹`（`t½ ≈ 1.69 h`），既能匹配贴片移除后的回落节奏，也与舌下日内回落经验相符。
- **为什么不用口服去估**：口服 Bateman 场景下常见 flip‑flop 现象，当吸收速率 `ka` 与或小于清除速率 `ke` 时，终末相斜率反而更像 `ka` 而非 `ke`，因此不适合作为清除常数的锚点。相对地，贴片在移除后 `ka = 0`，终末相更干净。

**注射专用 `kClearInjection`（有效参数说明）**  
注射油剂的末端斜率主要受“从油性贮库进入血液”的缓慢输入所支配（flip‑flop）。为在简化一室清除的前提下复现文献级别的 EEN/EV/EC 峰时与长尾，注射路径使用了 **`kClearInjection = 0.041 h⁻¹`**（当前默认值，可在 PK 参数设置中调整）。它是为**形状校准**而设的有效参数，并不等同于生理清除。  
- 仅在 `event.route === Route.injection` 时使用（`resolveParams` 中的 `defaultK3`）；其他路由继续使用 `kClear = 0.41 h⁻¹`。CPA 与睾酮另有各自的 k₃（§13、§14）。  
- 这样可在不增加额外分布/代谢池的情况下，保持注射曲线的吸收限速形状（天级 Tmax、较平稳的稳态）。  
- 若需生理可解释性更强的估计，应考虑在模型中显式加入贮库/结合/可逆代谢池而非调整清除常数。

---

## 2) 注射油剂（EB/EV/EC/EN/EU，及未酯化 E2）

### 2.1 模型与参数路径
- **模型**：两并联“库”吸收 → 酯水解 → 清除。
- “快库”控制峰时与峰高（Tmax/Cmax），“慢库”控制尾相（半衰期）。
- 解析解使用三室模型：吸收 k₁、酯水解 k₂、清除 k₃。
- **参数来源**：`TwoPartDepotPK`（`Frac_fast`、`k1_fast`、`k1_slow`）、`EsterPK.k2`、形成分数 `e2_ff_*`（`DEFAULT_PK_PARAMS`，可在 PK 参数页修改；未酯化 E2 取 `InjectionPK.formationFraction[E2] = 1.0`）、`getToE2Factor`、`e2_kClearInj`、`CorePK.depotK1Corr`。
- **代码入口**：`resolveParams`（`case Route.injection`）→ `PrecomputedEventModel` → 快/慢库各一个 `_analytic3C`；`k2 = 0` 时两项都改为 `_analytic2C`。
- 记录表单的注射酯列表是 EB/EV/EC/EN/EU（另有不建模的 LEUP/TRIP，见 §15）。未酯化 E2 不在列表中，只有记录里已有 E2 注射事件时才会用到下表最后一行。

### 2.2 关键数值（默认）

| 酯 | Frac_fast | k1_fast (h⁻¹) | t½_fast (h) | k1_slow (h⁻¹) | t½_slow (h) | k2 (h⁻¹) | t½_hydrolysis (h) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EB | 0.90 | 0.144 | 4.81 | 0.114 | 6.08 | 0.090 | 7.70 |
| EV | 0.40 | 0.0216 | 32.09 | 0.0138 | 50.23 | 0.070 | 9.90 |
| EC | 0.229164549 | 0.005035046 | 137.66 | 0.004510574 | 153.67 | 0.045 | 15.40 |
| EN | 0.05 | 0.0010 | 693.15 | 0.0050 | 138.63 | 0.015 | 46.21 |
| EU（Beta） | 0.08 | 0.0060 | 115.52 | 0.0022 | 315.07 | 0.012 | 57.76 |
| E2（未酯化） | 1.0 | 0.5 | 1.39 | 0 | 不适用 | 0 | 不适用 |

*注：注射路径的清除常数采用 `k3 = e2_kClearInj = 0.041 h⁻¹`（未酯化 E2 也一样）。未酯化 E2 没有可水解的酯（k₂ = 0），而 `_analytic3C` 整体乘以 k₂，k₂ = 0 时恒为 0，因此改用 `_analytic2C`，全部剂量走快库。EU 在界面中标为 Beta，因为其人体药代数据仍非常有限（见 §9）。*

### 2.3 生物利用度（形成分数 F）
- 形成游离 E2 的经验分数 `formationFraction[ester]`（运行时读 `e2_ff_*`）。剂量按酯 mg 存储，**因此 `F = formationFraction × toE2Factor`**。

**当前 `formationFraction` 默认值（乘 `toE2Factor` 之前；可在 PK 参数页通过 `e2_ff_*` 覆盖）**  
| 酯 | formationFraction |
| --- | ---: |
| EB | 0.1092 |
| EV | 0.0623 |
| EC | 0.1173 |
| EN | 0.12 |
| EU | 0.040 |
| E2（未酯化） | 1.0（固定，不在 PK 参数页） |

这些数值为经验标定项，用于在不同酯别间保持相对关系的同时，将单次给药的 $C_{\max}/T_{\max}$ 和稳态峰谷对齐到文献级别的量级。

- **调参缘由**：临床/社区曲线显示注射后总体暴露较口服/经皮显著更高，且不同酯别水解率不同，故在保持相对关系的同时加入了经验倍数以贴实峰值与 AUC。

### 2.4 数学形式（概念）
- 两个并联吸收库按 `Frac_fast` 和 `1 − Frac_fast` 分药量，分别以 `k1_fast` 与 `k1_slow` 进入“酯”室，水解为 E2 后以 `k₃` 清除。
- 解析解采用三指数线性组合。当任意两个速率常数几乎相等时，`_separateRates` 先把它们错开约 1e‑6·max(k)，使闭式解收敛到正确的极限值，避免除零与数值抵消（见 §8 的 2026‑07‑06）。
- k₂ = 0（未酯化 E2）时改用 `_analytic2C`（吸收 → 清除，无水解步）。

### 2.5 模型尝试与取舍
- 先前的“单库吸收”很难同时兼顾峰与长尾，因此改为两库模型。
- 尝试过浓度依赖的清除（早期“hill/浓度反馈”想法），在实际叠加多事件时容易引入非物理解耦与数值不稳，最终回退为常数 `k₃`。
- 保留 `depotK1Corr` 作为一键全局微调旋钮（代码常量，目前为 1.0，界面未开放），用于不同品牌或溶剂粘度的整体系数修正。它只作用于 E2 注射，睾酮注射不使用。

---

## 3) 贴片（E2）

### 3.1 路由与参数
- **两种实现**：  
  1) **零阶输入**：当事件带 `extras.releaseRateUGPerDay` 时（表单按释放速率填写），按标称 µg/day 转 mg/h 注入中心室：`rateMGh = releaseRateUGPerDay / 24 / 1000 × F`，`F = 1.0 × toE2Factor`；移除后按 `k₃` 衰减。  
  2) **一阶近似（遗留）**：若未提供标称释放率（表单按剂量填写，`doseMG` 为贴片载药量），则用 `resolveParams` 内的一阶 `k1 = 0.0075 h⁻¹` 作为高载量贴片的近似。
- 女性化模式下，表单保存的贴片事件酯别总是 E2；`k₃ = e2_kClear = 0.41 h⁻¹`。睾酮贴片见 §14。
- **佩戴窗口 `wearH`**（`resolvePatchWearH`）：
  1. 按时间顺序把每个 `patchRemove` 配给尚未配对的最早一片 `patchApply`（先进先出，`patchRemovalTimes`），移除时刻减去贴上时刻即为 `wearH`。`patchRemove` 事件本身不指明对应哪一片，所以只能按顺序配对。配对不看 `patchWearH`：按计划时长已经到期、但还没有配到移除事件的贴片，仍会领走之后的第一个移除事件，并被视为一直贴到那个时刻。
  2. 没有配对的移除事件时，使用贴上事件上的计划佩戴时长 `extras.patchWearH`（表单里按天填写，存为小时）。
  3. 两者都没有，则视为一直佩戴。

- **零阶**：  
  佩戴期（`0 ≤ t ≤ wearH`）：
  
  $$
  A(t) = \frac{\text{rateMGh}}{k_3} \,(1 - e^{-k_3 t})
  $$
  
  移除后（`t > wearH`）：
  
  $$
  A(t) = A(\text{wearH})\, e^{-k_3 (t - \text{wearH})}
  $$
  
- **一阶**：以 `k₁` 做“假库”吸收（`oneCompAmount`），`F = 1.0 × toE2Factor`；移除后中心室药量按 $A(\text{wearH})\,e^{-k_3 (t - \text{wearH})}$ 衰减，贴片中尚未吸收的药量随贴片移除，不再进入血液。

### 3.3 调参与选择
- 文献与说明书以 µg/day 标称，实际贴补图形更接近零阶，因此默认优先零阶，仅在缺乏数据时降级为一阶近似。
- **`F = 1.0`（相对标称释放率）的依据**：现代基质型贴片（Vivelle-Dot、Climara、Alora 等）按设计使其"体内标称释放率"即为实际递送速率（FDA 说明书将其称为 nominal in vivo delivery rate），故零阶模型直接取 `F = 1.0 × toE2Factor`，不再额外打折。已于 2026-07 移除 UI 中的 Beta 标记。

---

## 4) 经皮凝胶（E2 / T）

### 4.1 路由与参数
- **模型**：单室一阶吸收 + 清除，`F` 为经皮可达的系统暴露分数。
- **吸收速率 `k₁`**：在 flip-flop 动力学下（`k₁ ≪ k₃`），末端衰减速率由吸收主导，故 `k₁` 取自说明书报告的凝胶表观消除半衰期（~36 h）：`k₁ = ln(2)/36 ≈ 0.0193 h⁻¹`。注意 36 h 出自 **EstroGel** 说明书（"about 36 hours following administration of 1.25 g EstroGel"，NDA 021166），此前本文档与代码注释均误标为 Divigel；Divigel 说明书写的是 "about 10 hours"（NDA 022038）。两份说明书确有分歧（产品、剂型、涂抹部位皆不同），36 h 属于二选一而非共识值。`k₁` 不影响暴露量（AUC = F·D/k₃ 与 `k₁` 无关），只决定 Tmax 与峰谷形状。
- **`F`（生物利用率）按涂抹部位**：手臂/大腿 ≈ 5%，阴囊/生殖器部位 ≈ 25%（约 5×，外推自阴囊贴片给药数据 Premoli et al. 2005，因缺乏阴囊凝胶给药的直接人体研究）。
  - 手臂/大腿的 5% 由**说明书自身的稳态血药浓度反推**得出，而非引用任何现成百分比：美国的雌二醇凝胶说明书根本未给出百分比（Divigel NDA 022038、EstroGel NDA 021166 对吸收只有定性描述）。Divigel 0.25/0.5/1.0 mg/day 的 Cavg 为 9.8/21/30.5 pg/mL，EstroGel 0.75 mg/day 为 28.3 pg/mL；本模型在 65-70 kg 下需 F = 0.039-0.058（均值 0.050）才能复现。说明书数值未做基线校正，故属上限，真值可能更接近 0.04。
  - **不应引用 Järvinen et al. 1999 来支撑这个数**：其"61% 片剂 / 109% 贴片"是**相对**生物利用率，无法确定绝对分数。不过贴片一侧可佐证量级：1.09 × 50 µg/day ÷ 1.5 mg 应用量 ≈ 3.6%。
  - **常见的"10%"是另一个量，不可直接代入 `F`**：那是在厂商大面积涂抹法（Oestrogel SmPC，750 cm² 整条手臂）下**穿过皮肤**的比例；Wikipedia "Pharmacokinetics of estradiol" 也给出 10%（引 Sitruk-Ware 1989），但针对的是醇溶液这一类别。同一款 0.06% 凝胶的德国 Gynokadin Fachinformation 则写 5-6% "Bioverfügbarkeit"，而两者报告的血药浓度相同（2.5 g 给药 60-80 pg/mL）。`F` 在模型中线性且只出现一次，改成 0.10 会让所有预测值翻倍；由于用户按预测值调整剂量，偏高的 `F` 会把实际用量推向偏低。
- **睾酮凝胶（T）**：手臂/大腿 ≈ 10%（AndroGel/Testim FDA 说明书），阴囊 ≈ 50%（保守取 Iyer et al. 2017, *Andrology*；Kuhnert et al. 2005 报道的 5-8× 范围下限）。2026-07 之前，T 凝胶未按部位区分（`t_gel_F` 恒为 0.10，UI 的部位选择器对 T 无效），现已修复为与 E2 对称的按部位实现。睾酮凝胶的 `k₁`、`k₃` 与 E2 凝胶不同，见 §14。
- **代码入口**：`getBioavailabilityMultiplier`（`Route.gel`：按 `extras.gelSite` 取 `e2_gel_*` 或 `t_gel_*`，再乘 `toE2Factor`）→ `resolveParams` → `oneCompAmount`。E2 凝胶的 `k₃ = e2_kClear = 0.41 h⁻¹`。

### 4.2 局限与后续方向
- 仍忽略涂抹面积/剂量密度的非线性饱和效应（Swift 原型中的饱和参数 `sigmaSat ≈ 0.008 mg·cm⁻²` 没有移植到本仓库的 `logic.ts`，见 §8 2025‑08‑初；调试阶段曾出现"低剂量偏低、高剂量偏高"的系统性误差）；当前按部位的常量 `F` 是文献支持的简化，而非该非线性效应的完整还原。`ExtraKey.areaCM2` 仍在枚举中，但模拟不读取它，表单也不提供面积输入。
- 阴囊/生殖器 E2 凝胶的 `F` 外推自阴囊 E2 贴片数据（Premoli et al. 2005），并以阴囊睾酮凝胶数据佐证，并非 E2 凝胶的直接人体数据。这一来源写在代码注释中；PK 参数页只显示可编辑的数值。
- 待办：恢复面积/剂量依赖，并引入皮肤贮库的短暂零阶泄放以更好描述涂抹后前数小时的平台。

---

## 5) 口服（E2/EV）

### 5.1 模型与参数
- **模型**：单室 Bateman 吸收-清除（`oneCompAmount`）。**EV 的水解效应已折叠进更小的 `kAbsEV`，不单独建 `k₂`。**（`resolveParams` 虽为口服 EV 填入 `k2 = 0.070`，但口服路径的 `oneCompAmount` 不使用 k₂。）
- **默认参数**：  
  `kAbsE2 = 0.32 h⁻¹`（E2 片，模型 `Tmax ≈ 2.8 h`）。  
  `kAbsEV = 0.05 h⁻¹`（EV 片，模型 `Tmax ≈ 5.8 h`）。  
  `e2_oral_bio = 0.03`（口服首过后系统暴露，E2 与 EV 近似相同量级；`OralPK.bioavailability` 保留同值，运行时读 `e2_oral_bio`，可在 PK 参数页修改）。  
  `F = e2_oral_bio × toE2Factor`，`k₃ = e2_kClear = 0.41 h⁻¹`。
- 口服 CPA 走同一路由但参数完全不同，见 §13。

### 5.2 调参说明
- `F = 0.03` 体现了口服首过代谢的强烈损耗；与常见文献 2-5% 的数量级一致。
- `kAbs` 调整使曲线在 2-7 小时区间达到合理峰位。

---

## 6) 舌下（E2/EV）

### 6.1 模型与参数（路线图）
- **双通路**：把剂量按分流系数 **θ** 分为两支：
  - **快通路（口腔黏膜）**：$k_{1,\text{fast}} = k_{\text{SL}} = 1.8\ \mathrm{h}^{-1}$，**绕过首过**。剂量按酯 mg 存储，因此快支 **$F_{\text{fast}}=\text{toE2Factor}$**（E2 为 1，EV ≈ 0.764）。
  - **慢通路（吞咽→胃肠）**：$k_{1,\text{slow}} = k_{\text{Abs,E2/EV}}$（0.32 / 0.05 h⁻¹），**进入首过**，**$F_{\text{slow}}=F_{\text{oral}}\times\text{toE2Factor}$**，其中 $F_{\text{oral}}$ = `e2_oral_bio` = 0.03。
- **EV 与 E2 的差异**：
  - **舌下 E2**：无水解步（$k_2=0$），两支路均用 Bateman 形式（`_analytic2C`）叠加。
  - **舌下 EV**：黏膜快支**进血后仍需水解为 E2**（$k_2=k_{2,\text{EV}}=0.070\ \mathrm{h}^{-1}$），走「吸收 ($k_1$) → 水解 ($k_2$) → 清除 ($k_3$)」的三室解析式（`_analytic3C`）；吞咽慢支与口服 EV 相同，水解已折叠进 `kAbsEV`，用 `_analytic2C`，不再额外乘 $k_2$（2026‑02‑16 起，见 §8）。
  - **清除**：中心室游离 E2 的清除常数 $k_3 = 0.41\ \mathrm{h}^{-1}$（见§1），与贴片移除后回落节奏一致。
- **θ 的取值顺序**（`resolveParams`）：事件带 `extras.sublingualTheta` 时直接使用（截在 [0, 1]）；否则按 `extras.sublingualTier`（0-3）取对应档位的 `e2_sl_*`；两者都没有时用 Standard 档 `e2_sl_standard`。

### 6.2 黏膜分流 θ 的**行为建模**（取代早期 RF 反推法）
早期文档用 $\theta=\frac{F_{\text{oral}}(RF-1)}{1-F_{\text{oral}}}$ 从相对生物利用度 RF 反推 θ。该做法只能匹配 **AUC 比例**，会误估 **峰值/达峰时间**，因此已弃用。

我们显式建模**溶解**与**吞咽清除**，把口腔当作最小可用系统（以下为离线推导，App 运行时只使用它的结果，见下方“计算实现”）：
- 固体剂量 ($S$) 以速率 $k_{\text{diss}}$ 溶到口腔液相 \(D\)；
- 溶解相 ($D$) 面临两个竞争路径：**黏膜吸收** $(k_{\text{SL}})$ 与**吞咽清除** $(k_{\text{sw}})$。

连立常微分方程（单位 h）：
$$
\begin{aligned}
\frac{dS}{dt}&=-k_{\text{diss}}\,S\\
\frac{dD}{dt}&=k_{\text{diss}}\,S-(k_{\text{SL}}+k_{\text{sw}})\,D
\end{aligned}
$$

在用户的“含服窗口” $T_{\text{hold}}$ 内，**真正走黏膜**的比例定义为
$$
\boxed{\ \theta(T_{\text{hold}})=\frac{1}{\text{Dose}}\int_{0}^{T_{\text{hold}}} k_{\text{SL}}\,D(t)\,dt\ }
$$
超过 $T_{\text{hold}}$ 的残留（未吸收固体与溶解相）一律视为吞咽，进入口服通道（即我们的**慢支**）。

**参数锚点与合理区间**
- $k_{\text{SL}}$ 以**实测达峰**锚定：舌下 E2 常见 $T_{\max}\approx 1\ \mathrm{h}$。一室解析
  $T_{\max}=\frac{\ln(k_a/k_e)}{k_a-k_e}$，代入 $k_e=k_3=0.41\ \mathrm{h}^{-1}$ 反推 $k_a\approx 1.8\text{-}2.0\ \mathrm{h}^{-1}$。本项目取 **$k_{\text{SL}}=1.8\ \mathrm{h}^{-1}$**（`OralPK.kAbsSL`）。
- $k_{\text{diss}}$：口腔制剂溶解/崩解的**分钟级**过程，经验半衰期选 **3/5/10 min** 三档（速崩/常规/偏慢），便于随配方微调。
- $k_{\text{sw}}$：**有效**唾液清除率（非吞咽频次），经验区间 **0.8 / 1.8 / 3.0 h⁻¹** 代表低/中/高个体差异，后续可用外部数据回归精化。

**计算实现**
- App 运行时**不做**数值积分。四档 θ 由上式在中档场景下离线算出，作为常量写在 `logic.ts` 的 `SublingualTierParams` 与 `DEFAULT_PK_PARAMS.e2_sl_*`，可在 PK 参数页通过 `e2_sl_quick` / `e2_sl_casual` / `e2_sl_standard` / `e2_sl_strict` 覆盖。
- 为便于直观理解，我们也提供一个保守的闭式近似（作为上界/直觉，不用于计算）：

$$
\theta_{\text{eff}}\ \approx\ \frac{k_{\text{SL}}}{k_{\text{SL}}+k_{\text{sw}}}\Bigl(1-e^{-(k_{\text{SL}}+k_{\text{sw}})T_{\text{hold}}}\Bigr)\Bigl(1-e^{-k_{\text{diss}}T_{\text{hold}}}\Bigr)
$$

**UI 档位（不再使用 `theta_default`；表单默认 Standard 档，可改选其他档位或“自定义含服时长”）**  
采用中档场景（$k_{\text{sw}}=1.8\ \mathrm{h}^{-1}$，溶解半衰期 5 min）计算，并给出跨场景范围作参考：

| 档位 | 建议含服时长 | θ 推荐 | 典型范围（跨不同 $k_{\text{sw}}$/$k_{\text{diss}}$） |
| --- | ---: | ---: | ---: |
| Quick | ≈ 2 min | **0.01** | 0.004-0.012 |
| Casual | ≈ 5 min | **0.04** | 0.021-0.057 |
| Standard | ≈ 10 min | **0.11** | 0.064-0.156 |
| Strict | ≈ 15 min | **0.18** | 0.115-0.253 |

- 选档时，事件写入 `extras.sublingualTier`（0-3 依次对应 Quick/Casual/Standard/Strict），模拟时再取该档的 `e2_sl_*`（默认即上表推荐值）。
- 选“自定义含服时长”（至少 1 min）时，表单的 `thetaFromHold`（`src/components/DoseForm.tsx`）在上表四个点 (2 min, 0.01)、(5 min, 0.04)、(10 min, 0.11)、(15 min, 0.18) 之间线性插值，两端按端点斜率线性外推，结果截在 [0, 1]，写入 `extras.sublingualTheta`。这条路径使用 `SublingualTierParams` 的内置常量，不读取 PK 参数页对 `e2_sl_*` 的覆盖。
- **不再读取/依赖 `theta_default`**。

**一致性校验（慢支=口服）**  
当 $\theta=0$ 时，快支剂量为 0，舌下模型**按构造退化为口服**：慢支的 $k_{1,\text{slow}}$、$F_{\text{slow}}$、$k_3$ 与对应口服路由（`resolveParams` 的 `Route.oral` 分支）完全相同，两者使用同一 Bateman 闭式解，且都不使用 $k_2$，因此整轨迹一致。仓库目前没有对应的自动化测试。

### 6.3 数学形式（实现对照）
- **舌下 E2（无水解）**：两支路的 Bateman 叠加（`_analytic2C`）  
  $$
  A(t)=A_{\text{fast}}(t)+A_{\text{slow}}(t),\quad
  A_{\text{branch}}(t)=\frac{F_{\text{branch}}\,k_{1,\text{branch}}}{k_{1,\text{branch}}-k_3}\,\text{Dose}_{\text{branch}}\bigl(e^{-k_3 t}-e^{-k_{1,\text{branch}} t}\bigr)
  $$
- **舌下 EV（仅快支含水解）**：快支三室解析式 + 慢支 Bateman  
  $$
  A(t)=A^{(3C)}_{\text{fast}}(t)+A^{(2C)}_{\text{slow}}(t),\quad
  A^{(3C)}_{\text{fast}}(t)=\texttt{\_analytic3C}\bigl(t;\ \text{Dose}_{\text{fast}},F_{\text{fast}},k_{\text{SL}},k_{2,\text{EV}},k_3\bigr),\quad
  A^{(2C)}_{\text{slow}}(t)=\texttt{\_analytic2C}\bigl(t;\ \text{Dose}_{\text{slow}},F_{\text{slow}},k_{\text{Abs,EV}},k_3\bigr)
  $$
  其中 $\text{Dose}_{\text{fast}}=\theta\cdot\text{Dose},\ \text{Dose}_{\text{slow}}=(1-\theta)\cdot\text{Dose}$，且 $F_{\text{fast}}=\text{toE2Factor},\ F_{\text{slow}}=F_{\text{oral}}\cdot\text{toE2Factor}$。

---

## 7) AUC 计算与稳态
- **AUC**：`runSimulation` 对合成后的浓度轨迹 `concPGmL` 采用梯形法积分（单位 `pg·h/mL`）。`concPGmL` 是 E2（pg/mL）与 CPA（ng/mL × 1000，换算为 pg/mL）之和，不含睾酮。界面目前不显示 AUC，它只随分享快照（`src/services/shareSnapshot.ts`）一并保存。
- **稳态**：模型为线性系统（在当前常数 `k₃` 设定下），重复给药时叠加自然收敛至稳态。注射两库与贴片零阶输入也保持线性可叠加性。
- **注意**：由于本项目对若干参数做了经验缩放使 `Cmax/Tmax` 更贴近观测，AUC 的绝对值在不同路由间比较时需谨慎，适合作为同一路由下的相对比较与个体内优化。

---

## 8) 探索历程（摘记）
以下按时间线回顾，方便未来溯源与复现。2025‑11 之前的条目早于本仓库（首个提交为 2025‑11‑23），时间基于内部项目记录与代码注释，沿用原生 Swift 实现中的类名与函数名（`ParameterResolver`、`SimulationEngine`、`dualAbs3CAmount` 等），这些名称在本仓库的 TypeScript 代码中不存在。2025‑12 起的条目与本仓库的 git 提交日期对应，括号内为提交号。

- **2025‑06**：完成三室解析解（注射/口服/凝胶的公共内核），最初版本采用单库吸收。实现 AUC 计算与 pg/mL 输出。
- **2025‑07‑中**：  
  - 贴片新增零阶输入路径，UI 支持 `releaseRateUGPerDay`。未提供标称时继续启用一阶近似。  
  - 舌下路由从“含服时长”降维到固定双通路分流 θ，以减少用户面板的负担并稳定曲线。（此做法已在 2025‑09‑22 废弃，见下文）
- **2025‑07‑末**：注射改为两库模型（`TwoPartDepotPK`），分别用 `k1_fast` 与 `k1_slow` 控制峰与尾；为贴合真实暴露，`formationFraction` 引入经验放大因子并与 `toE2Factor` 相乘作为 `F`。
- **2025‑08‑初**：  
  - 尝试“浓度反馈清除”（早期 hill/抑制式 k），在多事件叠加时出现不稳定与过拟合风险，回退为常数 `k₃` 并在注释中保留方案。  
  - 凝胶在进行“剂量/面积”非线性修正时出现系统性偏差（低剂量低估、高剂量高估），临时回退为 `(k₁ = 0.045, F = 0.05)` 常量实现，并在代码旁保留 `sigmaSat` 等参数以待重启。
- **2025‑08‑中**：统一由 `ParameterResolver` 把各路由映射到 `PKParams`，`SimulationEngine` 以事件窗口裁剪贴片贡献（`patchApply → patchRemove`），AUC 梯形法稳定。
- **2025‑09‑03**：  
  - 为注射路径加入 `CorePK.kClearInjection = 0.05 h⁻¹`，并在 `ParameterResolver` 中按路由切换 `k3`。  
  - 重新标定注射两库参数：`Frac_fast`、`k1_fast`、`k1_slow`（详见 2.2 表），以复现 EV ≈ 2.1 d、EC ≈ 4 d、EN ≈ 6.5 d 的单剂达峰与稳态形状。  
  - 更新 `InjectionPK.formationFraction` 为分酯别经验值（见 2.3），并在 README 中明确其“有效参数”属性与适用范围。
- **2025‑09‑22**：
  - 舌下：**废弃 RF→θ 的反推与固定 θ**；引入**行为驱动**的 θ 计算（显式建模溶解 $k_{\text{diss}}$ 与吞咽清除 $k_{\text{sw}}$），按 $T_{\text{hold}}$ 数值积分得到 \(\theta\)。（本仓库的实现不在运行时积分，而是使用离线算出的四档常量，见 §6.2）
  - UI：移除 `theta_default`，改为**四档可选**（Quick/Casual/Standard/Strict），默认显示建议含服时长与推荐 θ。
  - 舌下 EV：两支路均加入水解 \(k_2\)，实现切换为 `dualAbs3CAmount`；舌下 E2 继续用 `dualAbsAmount`。（吞咽支的水解已于 2026‑02‑16 去掉，见下文）
  - 一致性：θ=0 时舌下慢支与口服路由参数相同，整轨迹按构造重合。本仓库没有对应的自动化测试（见 §6.2）。
- **2025‑12‑04 至 2025‑12‑05**：剂量口径统一为酯 mg。口服、舌下、凝胶与一阶贴片的 `F` 也乘以 `toE2Factor`（此前只有注射乘），`DoseEvent.doseMG` 注明为酯 mg、不是 E2 当量（b1e407a、d07bc35）。
- **2025‑12‑23**：加入化验值校准，用用户录入的 E2 化验值调整模拟结果（956ff38）。
- **2026‑01‑02**：新增口服醋酸环丙孕酮（CPA）的浓度计算与曲线，参数见 §13（712aef6）。
- **2026‑01‑04**：舌下记录新增“自定义含服时长”，在四档的 (含服时长, θ) 点之间线性插值得到 θ（89349c7）。
- **2026‑02‑16**：舌下 EV 吞咽支去掉重复水解。此前两支都走 `_analytic3C`，吞咽支在已折叠水解的 `kAbsEV` 之上又多算了一次 k₂；现快支 `_analytic3C`、慢支 `_analytic2C`（34abefc、922680c，PR #16）。
- **2026‑04‑20**：模拟时间网格改为自适应点数，并在每次给药后加密采样；按各事件的速率常数估算贡献寿命，跳过已衰减到可忽略的事件（aebda17、7732ea2）。
- **2026‑04‑22**：新增跨男模式与睾酮 PK（TC/TE/TU 注射、T 凝胶与贴片，见 §14），同时加入十一酸雌二醇（EU）的注射参数（4a552c2）。
- **2026‑04‑27**：PK 参数可在界面中覆盖（`PKCustomParams` / `DEFAULT_PK_PARAMS`，8c79a17）。
- **2026‑06‑25**：贴片支持计划佩戴时长 `patchWearH`；化验校准改为 off / EKF / OU-Kalman / Hybrid MIPD 四种方法，并新增 forward / retrospective 两种历史模式（c2de2d0），见 §16。
- **2026‑07‑06**（dc233a2）：
  - 三室解析核 `_analytic3C` 的**可去奇点**处理修复：当任意两个速率常数（k₁/k₂/k₃）几乎相等时，旧实现直接返回 0（造成曲线掉零或数值抵消不稳）。新实现先用 `_separateRates` 将重合速率分开 ~1e‑6·max(k) 的极小量，使解析式收敛到正确的 l'Hôpital 极限。该提交在本文档中写明曾用 RK4 数值积分交叉验证（最坏相对误差 < 5e‑6），但仓库中没有对应的测试或脚本。对 E2，默认参数曲线没有改动：默认参数下（包括校准清除网格 kMul∈[0.5,2] 的 21 个点）最接近的两个速率也相差约 0.005·max(k)，远大于阈值 1e‑6·max(k)；只有在 PK 参数页把 `e2_kClear` 或 `e2_kClearInj` 改到（或经网格缩放后落到）与某个 k₁ 或 k₂ 几乎相等时才会触发。睾酮则不同：默认参数下 TE 注射快库的 `k1_fast` 与 `t_kClearInj` 都是 0.035 h⁻¹，旧实现对这一库恒返回 0，修复后才计入，所以 TE 注射的默认曲线因此改变（快库占剂量的 40%）。
  - 文档与代码对齐：`kClearInjection` 现记为默认 **0.041 h⁻¹**（t½ ≈ 16.9 h），口服 `kAbsE2` 记为 **0.32 h⁻¹**（与其 `Tmax ≈ 2-3 h` 一致），修正早前文档中的过时数值。
- **2026‑07‑21**（ef4ef02）：
  - 凝胶（E2）：吸收速率由经验常量 `k₁ = 0.022 h⁻¹` 改为按文献表观半衰期反推 `k₁ = ln(2)/36 ≈ 0.0193 h⁻¹`（见 §4.1）。
  - 凝胶（T）：修复部位选择器对睾酮凝胶无效的问题：此前无论选择手臂/大腿/阴囊，`t_gel_F` 恒为 0.10；现按部位区分为 `t_gel_arm`/`t_gel_thigh`/`t_gel_scrotal`（默认 0.10 / 0.10 / 0.50），阴囊值外推自 Iyer et al. 2017、Kuhnert et al. 2005 的睾酮凝胶部位对比数据。PK 自定义参数面板同步更新。
  - 凝胶（E2）阴囊/生殖器部位的 `e2_gel_scrotal` 由 0.40 调整为 0.25（约 5× 手臂/大腿），改为直接对齐 Premoli et al. 2005 阴囊贴片给药的实测倍数，而非睾酮凝胶类比的上限。
  - 移除了未使用的死代码常量 `GelSiteParams`（与 `_getGelBio`/`_activePKParams` 的实际实现重复且未被引用）。
  - UI：移除 Gel、Patch Apply、Patch Remove 路由标签与提示文案中的 "(Beta)" 标记及相应免责声明。上述路由的核心假设（零阶贴片以标称释放率为 `F=1.0`；凝胶按部位生物利用率）均可追溯到具体文献/官方说明书，不再视为实验性功能。`ester.EU`（十一酸雌二醇）保留 Beta 标记，因其人体药代数据仍非常有限（个体间差异可达 10 倍，终末半衰期未知）。
- **2026‑07‑31**：贴片移除事件改为先进先出配对，每个 `patchRemove` 配给尚未配对的最早一片（配对不考虑 `patchWearH`，见 §3.1）。此前每片取其后的第一个移除事件，交错佩戴两片时，第二片会在第一片取下时一并停止给药（5052432）。
- **2026‑08‑01**：未酯化 E2 注射（k₂ = 0）改用 `_analytic2C`。修复前 `_analytic3C` 乘以 k₂ 恒为 0，这类剂量对曲线没有任何贡献（84c906e）。
- **2026‑08‑28**：更正 E2 凝胶 `F` 与 `k₁` 的文献出处（36 h 半衰期出自 EstroGel 而非 Divigel；5% 改由说明书稳态浓度反推），数值不变（f8744ef）。
- **2026‑10‑01**：新增辅助用药的记录（SPIRO、BICA、MPA、LEUP、TRIP、RLX）。它们不建模，`runSimulation` 会先把它们剔除，以免被当作雌二醇计算（a57e671），见 §15。

---

## 9) 参考与依据（部分）
下列仅列出常用且与实现高度相关的部分参考，非详尽清单。

**社区与技术文档**
- mtf.wiki：雌二醇凝胶（含经皮半衰期、实用注意事项）<https://mtf.wiki/zh-cn/docs/medicine/estrogen/gel>
- Transfem Science（含注射曲线汇总、舌下综述、不同途径比较等）
- Injectable E2 meta-analysis（注射曲线的非正式荟萃）<https://transfemscience.org/articles/injectable-e2-meta-analysis/>
- Sublingual estradiol overview（舌下作为替代途径的综述）<https://transfemscience.org/articles/sublingual-e2-transfem/>
- Approximate comparable doses（不同途径的近似等效剂量）<https://transfemscience.org/articles/e2-equivalent-doses/>
- Oral vs transdermal estradiol（口服与透皮比较）<https://transfemscience.org/articles/oral-vs-transdermal-e2/>
- estrannai.se：对于Injection的三室模型和Patch的相关算法参考<https://estrannai.se/docs/ingredients/>
- hrt.transmtf.com：化验校准的三种学习方法（EKF、OU-Kalman、Hybrid MIPD）参照该站提供的校准模型，本项目针对可识别的两个参数重新实现（见 §16）。
- 仓库内 `transmasc_hrt_modeling_document.md`：跨男（睾酮）建模的设计文档，§14 的参数结构以它为参照。

**官方说明书/监管资料**
- Climara®（Bayer）说明书：移除贴片后约 12 h 回落至基线，表观半衰期约 4 h（FDA 标签）<https://www.accessdata.fda.gov/drugsatfda_docs/label/2001/20375s16lbl.pdf>
- FDA NDA 临床药理综述与产品手册：透皮相对口服的生物利用度、部位差异、周内曲线稳定性等（多份，示例）  
  <https://www.accessdata.fda.gov/drugsatfda_docs/nda/99/020994_clinphrmr.pdf>  
  <https://www.accessdata.fda.gov/drugsatfda_docs/label/2008/020375s026lbl.pdf>

**期刊/综述（示例）**
- Ginsburg ES et al. Half-life of estradiol in postmenopausal women. Fertil Steril. 1998：贴片移除后终末半衰期约 161 min（107-221 min）。<https://pubmed.ncbi.nlm.nih.gov/9473164/>
- Kuhl H. Pharmacology of estrogens and progestogens: influence of different routes of administration. *Climacteric*. 2005. <https://pubmed.ncbi.nlm.nih.gov/16112947/>
- Oinonen et al. / Järvinen et al. Absorption and bioavailability of oestradiol from a gel, a patch and a tablet. *Maturitas*. 1999：凝胶生物利用率为片剂的 61%、贴片的 109%。**这是相对值**，仅用于佐证量级（贴片一侧折算约 3.6%），不作为 `e2_gel_arm` 的依据。<https://pubmed.ncbi.nlm.nih.gov/10465378/>
- Premoli MC et al. Scrotal transdermal estradiol delivery, 2005：阴囊贴片给药雌二醇水平约为前臂给药的 5 倍。
- Iyer R et al. Pharmacokinetics of testosterone cream applied to scrotal skin. *Andrology*. 2017：阴囊皮肤睾酮吸收显著高于腹部。<https://onlinelibrary.wiley.com/doi/full/10.1111/andr.12357>
- Kuhnert B et al. Testosterone substitution with a new transdermal, hydroalcoholic gel applied to scrotal or non-scrotal skin. 2005：阴囊 vs 非阴囊皮肤睾酮凝胶吸收比较。
- transfemscience.org: Genital Application via the Scrotum and Neolabia for Greatly Enhanced Absorption of Transdermal Estradiol in Transfeminine People（汇总阴囊/外阴部位给药的证据与外推依据）<https://transfemscience.org/articles/genital-e2-application/>
- 比较矩阵与储库型贴片的生物利用度与速率差异的研究（如 Menorest® vs Estraderm®）。

**官方说明书（补充）**
- EstroGel® 0.06% (estradiol gel) FDA 说明书：表观终末消除半衰期 **36 h**（`k₁` 即取自此处）；1.25 g/day 稳态 Cavg 28.3 pg/mL。<https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/021166s019lbl.pdf>
- Divigel® 0.1% (estradiol gel) FDA 说明书：表观终末半衰期 **10 h**（与 EstroGel 不一致）；每日涂抹于大腿于第 12 天达稳态；0.25/0.5/1.0 mg/day 稳态 Cavg 9.8/21/30.5 pg/mL（未做基线校正）。<https://www.accessdata.fda.gov/drugsatfda_docs/label/2007/022038lbl.pdf>
- 两份美国雌二醇凝胶说明书均**未**给出任何吸收百分比或生物利用率数字。
- Vivelle-Dot® / AndroGel® FDA 说明书：贴片按"体内标称递送速率"设计（0.025-0.1 mg/day），凝胶睾酮系统生物利用率约 10%。

**百科与药学数据库**
- Wikipedia: Pharmacokinetics of estradiol（路由差异、凝胶 36 h 表观半衰期等聚合条目）<https://en.wikipedia.org/wiki/Pharmacokinetics_of_estradiol>
- Wikipedia: Estradiol undecylate（人体药代数据有限、终末半衰期未知、个体差异可达 10 倍；这是 `ester.EU` 保留 Beta 标记的依据）<https://en.wikipedia.org/wiki/Estradiol_undecylate>
- DrugBank: Estradiol（透皮生物利用度对比口服、部位差异）<https://go.drugbank.com/drugs/DB00783>

> 说明：实现中还参考了多份品牌说明书与审评文档、二级综述与数据手册，此处不一一列举。

---

## 10) 局限
- 个体差异未建模：肝功能、SHBG、年龄、体脂、并用药等可能改变 `F` 与各速率常数。化验校准（§16）只能事后修正 E2 的整体幅度与清除。
- 凝胶的面积/负荷非线性：当前未在模型中体现；存在低剂量低估与高剂量高估的潜在风险。
- 注射溶剂/体积影响：对扩散 `k₁` 的影响尚未显式参数化，现仅能通过代码常量 `depotK1Corr` 整体近似。
- 口服/舌下仅建模游离 E2：雌酮及其硫酸酯的储库效应未纳入。
- AUC 的跨路由可比性有限：参数含经验缩放，AUC 适合于相同路由内的相对比较与个体内优化。
- CPA 与睾酮的参数是经验标定值，且不经化验校准；螺内酯、比卡鲁胺等辅助用药只记录不建模（§13 至 §15）。

---

## 11) 快速对照：各路由实现要点

| 路由 | 解析/数值 | 输入 | 模型 | 关键参数 | F 的来源 |
| --- | --- | --- | --- | --- | --- |
| 注射（油剂 EB/EV/EC/EN/EU） | 解析 | mg（酯） | 两库吸收 + k₂ 水解 + k₃ 清除（`_analytic3C` × 2） | `Frac_fast, k1_fast, k1_slow, k2, k3 (= e2_kClearInj = 0.041)` | `formationFraction`（`e2_ff_*`）× `toE2Factor` |
| 注射（未酯化 E2） | 解析 | mg | 单库 Bateman（`_analytic2C`），k₂ = 0 | `k1_fast = 0.5, k3 = 0.041` | 1.0 × `toE2Factor`（= 1） |
| 贴片（零阶） | 解析 | µg/day → mg/h | 零阶恒速输入 + k₃ 清除；移除后指数衰减 | `rateMGh, k3 = 0.41`；`wearH` 见 §3.1 | 固定 1.0 × `toE2Factor` |
| 贴片（一阶遗留） | 解析 | mg | 一阶“假库” + k₃ 清除；移除时截断 | `k1 = 0.0075, k3 = 0.41` | 固定 1.0 × `toE2Factor` |
| 凝胶（E2） | 解析 | mg + 涂抹部位 | 单室 Bateman | `k1 = ln2/36 ≈ 0.0193, k3 = 0.41` | 按部位：手臂/大腿 0.05、阴囊 0.25（`e2_gel_*`）× `toE2Factor` |
| 口服 E2 | 解析 | mg | 单室 Bateman | `kAbsE2 = 0.32, k3 = 0.41` | `e2_oral_bio` 0.03 × `toE2Factor` |
| 口服 EV | 解析 | mg（酯） | 单室 Bateman（水解折叠进 `kAbsEV`） | `kAbsEV = 0.05, k3 = 0.41` | `e2_oral_bio` 0.03 × `toE2Factor` |
| 舌下 E2/EV | 解析 | mg（酯） | 双通路：快 = 黏膜、慢 = 吞咽→口服；**E2 两支均 `_analytic2C`；EV 快支 `_analytic3C`、慢支 `_analytic2C`** | `θ` 来自四档（2/5/10/15 分钟）或自定义时长插值；`kAbsSL = 1.8`，`kAbsE2/EV`，`k2(EV) = 0.070`（仅快支），`k3 = 0.41` | 快 `toE2Factor`；慢 `F_oral = 0.03` × `toE2Factor` |
| 口服 CPA | 解析 | mg | 单室 Bateman | `k1 = 1.0, k3 = 0.017`，Vd 14 L/kg | 固定 0.7 |
| 睾酮注射 TC/TE/TU | 解析 | mg（酯） | 两库吸收 + k₂ 水解 + k₃ 清除 | 见 §14；`k2 = 0.20, k3 = t_kClearInj = 0.035` | `t_ff_*` 0.025 × toT 因子 |
| 睾酮凝胶 | 解析 | mg + 涂抹部位 | 单室 Bateman | `k1 = 0.05, k3 = t_kClear = 0.5` | 按部位：手臂/大腿 0.10、阴囊 0.50（`t_gel_*`）× toT 因子（T 为 1） |

---

## 12) 实现细节摘抄
- **`PrecomputedEventModel`**（每个事件一个闭包，`tau` 为距给药的小时数，`tau < 0` 时为 0）：
  - 注射：`_analytic3C(tau, doseFast, F, k1_fast, k2, k3) + _analytic3C(tau, doseSlow, F, k1_slow, k2, k3)`；`k2 = 0` 时两项都换成 `_analytic2C`。
  - 凝胶/口服：`oneCompAmount(tau, dose, p)`（把 `k1_fast` 视作该路由的 `ka`）。
  - 舌下：`doseF = dose × θ`、`doseS = dose × (1 − θ)`；快支在 `k2 > 0` 时为 `_analytic3C(tau, doseF, F_fast, k1_fast, k2, k3)`，否则为 `_analytic2C`；慢支总是 `_analytic2C(tau, doseS, F_slow, k1_slow, k3)`。
- **贴片**：
  - `resolvePatchWearH` 决定 `wearH`：先取 `patchRemovalTimes` 按先进先出配给这一片的移除时刻，再取 `extras.patchWearH`，都没有则为 `Number.MAX_VALUE`（一直佩戴）。
  - 零阶：佩戴内 `rateMGh/k3 × (1 − e^{−k3 t})`；移除后按 `e^{−k3 Δt}` 衰减。
  - 一阶：用 `oneCompAmount` 计算佩戴内药量；移除后取 `oneCompAmount(wearH)` 再按 `e^{−k3 Δt}` 衰减，使吸收在 `wearH` 处截断。
- **`runSimulation`**：
  - 先用 `isUnmodelledDrug` 剔除未建模药物与本版本不认识的药物代码（§15）；没有剩余事件或体重 ≤ 0 时返回 null。
  - 时间范围：首个事件前 24 h 到 max(最后一个事件 + 14 天, 当前时刻 + 24 h)。均匀网格点数为 `min(100000, max(2000, ceil(总小时数)))`，约每小时一个点；再并入每个事件的时刻，以及事件后 0.25/0.5/1/2/4/6/8/12/24/48 h 的加密采样点（早已衰减完的事件不加）。
  - 贡献寿命（`computeMaxLifetimeH`）：取事件最小的非零速率常数 `k_min`，`maxLifetimeH = ceil(13.816 / k_min)`（13.816 ≈ ln 1e6，即 e^{−k_min·τ} < 1e‑6）；贴片为 `wearH + ceil(13.816 / k3)`，一直佩戴的贴片始终计算。超过寿命的事件不再求值。
  - 逐点按药物分组累加药量：CPA 一组，睾酮各形式一组，其余（雌二醇各形式）一组；分别换算为 E2 pg/mL、CPA ng/mL、总睾酮 ng/dL（§0）。
  - **AUC**：梯形法累计（§7）。

---

## 13) 环丙孕酮（CPA，口服）
- **入口**：记录表单只在口服路由提供 CPA。`resolveParams` 的 `Route.oral` 分支为 CPA 单独返回参数，`PrecomputedEventModel` 用 `oneCompAmount` 计算。
- **参数**（代码常量，不在 PK 参数页）：`k1 = 1.0 h⁻¹`，`k3 = 0.017 h⁻¹`（t½ ≈ 40.8 h），`F = 0.7`（固定经验值，不乘 `toE2Factor`）。
- **分布容积与单位**：`vdPerKG_CPA = 14.0 L·kg⁻¹`，`conc(ng/mL) = amountMG × 1e6 / Vd_ml`。
- **不校准**：化验只测 E2，校准倍数不作用于 CPA；CPA 的 `k3` 也不随 `e2_kClear` 或校准的清除网格变化。
- **显示**：首页读数中低于 `CPA_MIN_NGML = 0.1 ng/mL` 的估计值显示为 "--"；图表右侧的 CPA 坐标轴只在可见窗口内的 CPA 估计达到该阈值时才标注，曲线本身照常绘制。

---

## 14) 睾酮（跨男模式）
- **范围**：`T_ESTERS` 包括 T（未酯化，用于凝胶/贴片）、TC、TE、TU。`runSimulation` 把它们单独累加为总睾酮曲线 `concNGdL_T`（ng/dL）。跨男模式下，单次记录表单只提供注射（TC/TE/TU）与凝胶（T）；计划与预测页的药物列表另含 T 贴片。口服、舌下睾酮与未酯化 T 注射不建模（`resolveParams` 返回零参数）。
- **剂量与 F**：剂量同样按酯 mg 存储；`getToE2Factor` 对睾酮酯返回 MW(T)/MW(酯)（TC 0.6990、TE 0.7200、TU 0.6315、T 1.0），各路由的 `F` 都乘以它。
- **注射**：两库吸收 + 水解，快/慢库各一个 `_analytic3C`（`T_DepotPK`、`T_EsterPK`；不乘 `depotK1Corr`）。

| 酯 | Frac_fast | k1_fast (h⁻¹) | t½_fast (h) | k1_slow (h⁻¹) | t½_slow (h) | k2 (h⁻¹) | t½_hydrolysis (h) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TC | 0.35 | 0.025 | 27.73 | 0.005 | 138.63 | 0.20 | 3.47 |
| TE | 0.40 | 0.035 | 19.80 | 0.008 | 86.64 | 0.20 | 3.47 |
| TU | 0.10 | 0.008 | 86.64 | 0.0009 | 770.16 | 0.20 | 3.47 |

- 注射的 `k3 = t_kClearInj = 0.035 h⁻¹`（t½ ≈ 19.8 h，flip‑flop 下的有效值）；形成分数 `t_ff_TC` / `t_ff_TE` / `t_ff_TU` 默认均为 0.025，`F = t_ff × toT 因子`。
- **凝胶**：`k1 = 0.05 h⁻¹`（`T_GelPK`），`k3 = t_kClear = 0.5 h⁻¹`（t½ ≈ 1.39 h），`F` 按部位取 `t_gel_arm` / `t_gel_thigh` / `t_gel_scrotal` = 0.10 / 0.10 / 0.50（来源见 §4.1）。
- **贴片**：有标称释放率时为零阶输入，`F = T_PatchPK.F = 1.0`；否则为一阶 `k1 = 0.03 h⁻¹`；`k3 = 0.5 h⁻¹`；佩戴窗口规则同 §3.1。
- **分布容积与单位**：`T_CorePK.vdPerKG = 1.0 L·kg⁻¹`（总睾酮的表观分布容积），`conc(ng/dL) = amountMG × 1e8 / Vd_ml`。nmol/L 的化验值按 × 28.842 换算为 ng/dL。
- **可调参数**：PK 参数页可改 `t_kClear`、`t_kClearInj`、`t_ff_*`、`t_gel_*`；两库参数与 `k2` 是代码常量。
- **标定目标**（`logic.ts` 注释）：TC 或 TE 100 mg/周肌注 → Cavg ≈ 600 ng/dL；TU 1000 mg/12 周 → ≈ 500 ng/dL；AndroGel 50 mg/天 → 500-700 ng/dL；Androderm 5 mg/天贴片 → 500-700 ng/dL。注释同时写明这些只是研究/教学用估计，不用于个体剂量决策。
- **不校准**：化验校准只作用于 E2（§16），睾酮曲线始终是原始模型值。
- 更完整的跨男建模设计（游离睾酮、SHBG、Hct 等）见仓库内 `transmasc_hrt_modeling_document.md`；代码只实现了其中总睾酮 PK 的简化部分。

---

## 15) 其他辅助用药（只记录，不建模）
- `Ester` 枚举里还有六种药：螺内酯 SPIRO、比卡鲁胺 BICA、醋酸甲羟孕酮 MPA、雷洛昔芬 RLX（表单在口服路由提供），以及 GnRH 激动剂亮丙瑞林 LEUP、曲普瑞林 TRIP（在注射路由提供）。
- 它们都在 `UNMODELLED_DRUGS` 中：可以记录、排进计划，但 `runSimulation` 一开始就把它们剔除，所以不画曲线，也不计入任何浓度估计、AUC 或校准。较新版本记录的、本版本不认识的药物代码（`isKnownEster` 为假）同样按未建模处理。
- 它们的剂量按输入的数值原样保存（`getToE2Factor` 对它们返回 1.0）。
- **实际参与模拟的只有**：雌二醇各形式（E2、EB、EV、EC、EN、EU）、CPA，以及睾酮各形式（T、TC、TE、TU）。

---

## 16) 化验校准（只作用于 E2）
- **数据点**（`computeCalibrationPoints`）：只取 E2 单位的化验值（pg/mL，或 pmol/L 按 ÷ 3.671 换算）；睾酮单位（ng/dL、nmol/L）的化验值不参与。对每个化验值取同一时刻的原始模型预测 `pred`；`pred < 1 pg/mL` 或实测值 ≤ 0 的点舍弃（例如首次给药前的基线抽血），其余计算 `ratio = obs / pred`。
- **输出**：一个随时间变化的倍数 `factorFn(t)`，校准后 E2 = 模型 E2(t) × `factorFn(t)`，倍数截在 [0.01, 100]。首页的当前 E2 估计、图表的 E2 曲线与预测页都乘以它。
- **方法**（`CalibrationMethod`，默认 `mipd`）：
  - `off`：不校准，倍数恒为 1。
  - `mipd`（Hybrid MIPD）：在群体先验下对个人幅度 a 与个人清除 k（均取对数）做 MAP 拟合。先验标准差：幅度 0.50、清除 0.35；单个化验的对数测量误差 0.13；似然用 Student-t（ν = 4）以抵抗单个离群值，用迭代重加权 Gauss-Newton 求解。化验少时向群体值（a = k = 0，即原模型）收缩。
  - `ekf`（扩展卡尔曼滤波）：按时间顺序逐个处理化验值，状态为 [a, k]，先验与测量误差同上，每一步只加极小的过程噪声（幅度约 1%、清除约 0.5%），相当于永久记忆；报告值做 Jensen 修正 a + ½·P_aa。
  - `ou_kalman`（OU-Kalman）：只校正幅度。把对数校正量当作向 0 回归的 Ornstein-Uhlenbeck 过程（时间常数 τ = 336 h，约两周；平稳标准差 0.5），用前向卡尔曼滤波加 RTS 平滑求解。离化验时刻越远，倍数越接近 1（原模型）。
- **个人清除**（仅 `mipd` 与 `ekf`）：至少 3 个化验值才允许移动清除（`MIN_LABS_FOR_CLEARANCE`），否则只拟合幅度（`ekf` 在 forward 模式下的例外见下）。清除网格覆盖 kMul ∈ [0.5, 2]（`KMUL_MIN` / `KMUL_MAX`），在对数尺度上取 21 个网格点，每个点把 `e2_kClear` 与 `e2_kClearInj` 同乘该倍数重跑一次模拟（`runSimulationWithParams`），拟合时在网格之间线性插值；网格外的预测值取端点值，但斜率沿用最后一段，所以估计可以继续移出网格。拟合出的对数清除只截在 ±4.6（`clampLogFactor`，即 kMul ∈ [0.01, 100]），因此报告的 kMul 可能超出 [0.5, 2]，半衰期变化也可能超出对应的 −50% 到 +100%。校准后的曲线则使用最近的网格点（`fieldSimFor`），所以曲线所用的清除倍数始终在 [0.5, 2] 内。报告的半衰期变化为 (1/kMul − 1) × 100%，界面显示的半衰期变化取自此值，不再截断。
- **历史模式**（`CalibrationHistoryMode`，默认 `retrospective`）：
  - `retrospective`：用全部化验值重估整段历史。`mipd` 与 `ekf` 对整段曲线使用最终拟合（幅度倍数乘以“最近一个清除网格点的曲线 / 原曲线”）；`ou_kalman` 使用平滑结果，两次化验之间按 OU 桥插值。新化验可能改写过去的估计。
  - `forward`：因果滤波，每个时刻只用到当时为止的化验值。第一个化验之前倍数为 1；第 i 个化验之后使用前 i 个化验学到的参数（`ekf` 取逐步快照，`mipd` 用前 i 个化验重新拟合，`ou_kalman` 只用前向滤波）。在之后的日期再加化验时，`mipd` 与 `ou_kalman` 的过去估计不会改变。`ekf` 有一个例外：是否允许移动清除按化验总数决定（`n >= MIN_LABS_FOR_CLEARANCE`），总数达到 3 个时从第一个快照起就允许移动清除，所以化验总数从 2 个变为 3 个时，前两段的估计会被改写；之后再加化验不再改写过去。
- **拟合误差**：至少 2 个化验值时，以对数残差 RMSE 折算为 ±% 报告。
- **旧设置迁移**（`normalizeCalibrationMethod`）：存储的 `average` 映射为 `mipd`，`adaptive` 映射为 `ekf`，无法识别的值也按 `mipd` 处理。
- 三种学习方法参照 hrt.transmtf.com 提供的校准模型，在本项目中针对可从化验识别的两个参数（个人幅度与个人清除）重新实现（`logic.ts` 注释）。
