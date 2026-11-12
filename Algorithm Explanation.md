# Oyama's HRT Tracker: Pharmacokinetic Models

This document explains the algorithms used for each drug/route, key parameters and units, what was tuned, why we tuned it, and how the implementation evolved. It describes the TypeScript code in `logic.ts`; where a value can be overridden on the in-app PK parameters page, the number given here is the default.

> 模型结构与早期参数来自 **@LaoZhong-Mihari** 的原生 Swift 实现 [HRT-Recorder-PKcomponent-Test](https://github.com/LaoZhong-Mihari/HRT-Recorder-PKcomponent-Test)（`PKcore.swift` / `PKparameter.swift`）。本仓库是它的 TypeScript 移植与扩展。Swift 版的类名与函数名（如 `ParameterResolver`、`ThreeCompartmentModel`、`SimulationEngine`、`dualAbsAmount`、`dualAbs3CAmount`、`injAmount`）在本仓库中不存在，对应的 TS 名称见 §0 与 §12；§8 中较早的条目仍沿用 Swift 版的名称。

---

## 0) 总览（模型架构）

**目标**：用一套轻量的、可解释的 PK 近似模型，覆盖常见雌激素制剂与给药途径（以及口服 CPA 与跨男模式的睾酮），在本地（浏览器或 App 内）实时算出血药浓度-时间曲线与 AUC。

**核心构件（与 `logic.ts` 中的代码对应）**
- **`DoseEvent`**：一次给药事件，带路由 `route`、时间 `timeH`（自 1970 年起的小时数）、剂量 `doseMG`、酯别 `ester` 与附加字段 `extras`（如凝胶部位 `gelSite`、贴片标称释放速率 `releaseRateUGPerDay`（µg/day）、计划佩戴时长 `patchWearH`、舌下档位 `sublingualTier` 或分流系数 `sublingualTheta`）。
- **`resolveParams` + `getBioavailabilityMultiplier`**：把事件映射为具体参数 `PKParams`（`k1_fast`/`k1_slow`/`k2`/`k2_slow`/`k3`、`F`、双库或双通路比例 `Frac_fast`、分支生物利用度 `F_fast`/`F_slow`、零阶速率 `rateMGh`）。可由用户覆盖的数值从 `DEFAULT_PK_PARAMS` 读取（经 `applyPKOverrides` 校验合并为 `_activePKParams`）。
- **解析核**：
  - `_analytic3C`：三室模型（吸收 k₁ → 第二步 k₂ → 游离药物清除 k₃）的解析式。注射与舌下 EV 快支的第二步是酯水解；口服 E2 与舌下 E2 吞咽支的第二步是雌酮库（`OralPK.kE1Pool`，§5）。按 e^(−sτ) 在三个速率处的二阶差商计算（`_expDivDiff2`），速率重合时直接取精确极限。
  - `_analytic2C` 与 `oneCompAmount`：单室 Bateman 形式（吸收 → 清除，无第二步），按一阶差商计算（`_expDivDiff1`）；`oneCompAmount` 即以 `k1_fast`、`k3` 调用 `_analytic2C`。
- **`PrecomputedEventModel`**：为每个事件按路由选用解析核，生成“时间 → 中心室药量”的函数：
  - 注射：快/慢两库各一个 `_analytic3C`（k₂ = 0 时改用 `_analytic2C`）。
  - 凝胶、口服 EV：`oneCompAmount`。口服 E2：`_analytic3C`（吸收 → 雌酮库 → 清除）。口服 CPA：两个 `_analytic2C` 之和（一阶吸收 + 双相处置，§13）。
  - 舌下双通路（快：口腔黏膜；慢：吞咽 = 口服）：**E2 快支 `_analytic2C`、慢支 `_analytic3C`（经雌酮库）；EV 快支 `_analytic3C`（水解）、慢支 `_analytic2C`**。E2 快支按自己的回落速率 `k3_fast`（`OralPK.kElimSL`，§6.4）下降，其余各支用 `k₃`。
  - 贴片：零阶输入在佩戴窗口内，移除后按 k₃ 衰减；或一阶“假库”（未填标称释放率时）。
- **`runSimulation`**：先剔除未建模的药物，再把其余 `DoseEvent` 预编译为上述函数，遍历时间点，按 E2 / CPA / 睾酮三组线性叠加各事件的中心室药量，再以各自的分布容积换算为浓度；AUC 只对 E2 曲线用梯形法则积分（§7）。
- **`shbg.ts`**（可选，默认关闭，应用不调用）：从总 E2 按质量作用算出游离 E2，SHBG 可以停在基线（恒定游离分数），也可以随用药变化；`runSimulation` 只在传入 `{ swallowedE2: true }` 时另外返回其中被吞下的那部分 E2 曲线供它使用（§18）。

**单位与换算**
- 剂量 `doseMG` 按**所记录化合物（酯）的 mg** 存储，**不是** E2 等效量（见 `DoseEvent.doseMG` 的注释）。记录表单可以输入酯 mg 或 E2 等效 mg，保存时一律换算回酯 mg。中心室药量的计算单位也是 mg。
- 各路由的 `F` 都乘以 `getToE2Factor(ester)` = MW(E2) / MW(酯)，把酯 mg 换算为 E2 mg；对睾酮酯，同一函数返回 MW(T) / MW(酯)。CPA 不含雌二醇，`getToE2Factor(CPA)` 返回 1，口服 CPA 的 `F` 为 0.88（§13）。

| 酯 | EB | EV | EC | EN | EU | TC | TE | TU |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `getToE2Factor` | 0.7235 | 0.7640 | 0.6868 | 0.7083 | 0.6181 | 0.6990 | 0.7200 | 0.6315 |

E2、未酯化 T 与 CPA 为 1.0。分子量取自 `EsterInfo`：E2 272.38、EB 376.50、EV 356.50、EC 396.58、EN 384.56、EU 440.66、T 288.42、TC 412.60、TE 400.59、TU 456.70。
- 浓度输出：
  - E2：pg/mL，`conc = amountMG × 1e9 / Vd_ml`。
  - CPA：ng/mL，`conc = amountMG × 1e6 / Vd_CPA_ml`（§13）。
  - 总睾酮：ng/dL，`conc = amountMG × 1e8 / Vd_T_ml`（§14）。
- 体分布体积：`Vd = vdPerKG × BW`。E2 的 `vdPerKG` 为 **2.0 L·kg⁻¹**（固定常量；用户只能设置体重 BW），CPA 为 14.0 L·kg⁻¹，睾酮为 1.0 L·kg⁻¹。
- 年龄（Beta，默认关闭）：在设置中打开“年龄调整”并填写出生年份时，E2 与睾酮的清除速率 k₃ 按给药时的年龄调整（§17）；关闭或不填时模型不变。下文“填写了出生年份时”均指开关已打开。

---

## 1) 公共参数（`logic.ts :: CorePK` 与 `DEFAULT_PK_PARAMS`）

| 名称 | 含义 | 默认值 | 备注 |
| --- | --- | --- | --- |
| `vdPerKG` | 表观分布容积（每 kg） | 2.0 L·kg⁻¹ | 固定常量；用于 mg → pg/mL 换算 |
| `vdPerKG_CPA` | CPA 表观分布容积（每 kg） | 14.0 L·kg⁻¹ | 固定常量；CPA 输出 ng/mL，见 §13 |
| `kClear`（运行时读 `e2_kClear`） | 游离 E2 清除速率常数 k₃ | 0.41 h⁻¹ | 对应 t½ ≈ 1.69 h；为经验标定值，用于与项目中目标曲线贴合；可在 PK 参数页修改 |
| `kClearInjection`（运行时读 `e2_kClearInj`） | 注射专用游离 E2 清除速率常数 k₃（仅 injection 路由使用） | 0.041 h⁻¹ | 对应 t½ ≈ 16.9 h；保持 flip‑flop 形状以匹配 EEN/EV/EC 的 Tmax/Cmax，不等同于生理清除；可在 PK 参数页修改 |
| `depotK1Corr` | 注射两库 k₁ 的全局校正系数 | 1.0 | 固定代码常量，界面未开放；改峰/拖尾时可整体缩放 E2 注射的 k₁ |

`CorePK.kClear` 与 `CorePK.kClearInjection` 仍以同样的数值留在代码中，但 `resolveParams` 实际读取的是 `_activePKParams.e2_kClear` 与 `e2_kClearInj`（PK 参数页允许的范围分别为 0.001-5 与 0.001-1 h⁻¹）。填写了出生年份时，`resolveParams` 再把它们乘以年龄倍数 `ageClearanceMultiplier`（§17）；表中的数值相当于 54 岁。

> 注：`kClear` 是游离 E2 中心室的表观清除常数，其锚点来自贴片移除后的终末半衰期（≈ 1-2 h），在此基础上取中间值 **0.41 h⁻¹** 以兼顾舌下与贴片的日内回落。它服务于本项目的简化模型与多路叠加稳定性，并不等价于群体生理清除率，不应外推到人群参数。

**关于 kClear 的来龙去脉**
- **锚点来源**：最初把 `kClear` 定在 1-2 小时的半衰期区间，是依据某些雌二醇贴片的说明书与审评资料对“移除贴片后”的血药下降描述。贴片移除时外源输入为零，后续的下降主要由系统清除主导，因此该时段的终末斜率可以近似视为清除常数 k₃ 的体现。
- **数值选择**：按 `t½ = 1-2 h` 反推 `k = ln2 / t½ ≈ 0.35-0.69 h⁻¹`，本项目选择中间值 `kClear = 0.41 h⁻¹`（`t½ ≈ 1.69 h`），既能匹配贴片移除后的回落节奏，也与舌下日内回落经验相符。2026‑11‑12 起舌下 E2 的黏膜快支不再用它，而按 `OralPK.kElimSL = 1.2 h⁻¹` 回落（§6.4）；吞咽部分与其余路由不变。
- **为什么不用口服去估**：口服 Bateman 场景下常见 flip‑flop 现象，当吸收速率 `ka` 与或小于清除速率 `ke` 时，终末相斜率反而更像 `ka` 而非 `ke`，因此不适合作为清除常数的锚点。相对地，贴片在移除后 `ka = 0`，终末相更干净。

**注射专用 `kClearInjection`（有效参数说明）**  
注射油剂的末端斜率主要受“从油性贮库进入血液”的缓慢输入所支配（flip‑flop）。为在简化一室清除的前提下复现文献级别的 EEN/EV/EC 峰时与长尾，注射路径使用了 **`kClearInjection = 0.041 h⁻¹`**（当前默认值，可在 PK 参数设置中调整）。它是为**形状校准**而设的有效参数，并不等同于生理清除。  
- 仅在 `event.route === Route.injection` 时使用（`resolveParams` 中的 `defaultK3`）；其他路由继续使用 `kClear = 0.41 h⁻¹`。CPA 与睾酮另有各自的清除参数（§13、§14）。  
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
- 解析解是三指数线性组合：`dose·F·k₁·k₂·Σᵢ e^(−kᵢτ) / Π_(j≠i) (kⱼ − kᵢ)`，即 k₁k₂ 乘以 e^(−sτ) 在三个速率处的二阶差商。代码按差商计算（`_expDivDiff2`）：外层差分取在相距最远的两个速率之间，三个速率都在 0.5/τ 之内时改用关于其均值的泰勒级数；两个速率之间的一阶差商在它们接近时用 sinh 形式（`_expDivDiff1`）。因此任意两个或三个速率相等时直接得到精确极限，没有除零与数值抵消，也不需要错开速率（2026‑10‑13 起，此前的 `_separateRates` 见 §8 的 2026‑07‑06）。
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
  1. 先为每个 `patchRemove` 找它取下的那一片（`patchRemovalTimes`）。移除事件本身不指明对应哪一片，所以只能推断：按时间顺序处理移除事件，配给此刻可能还贴着的贴片中贴上最早的一片。一片贴片算作可能还贴着，须同时满足：与移除事件是同一种激素（表单只在女性化模式下提供贴片，写入的移除事件都是 E2，T 的移除事件只能来自导入；记为其他药物的移除事件不限激素）；在移除前至少 1 h 贴上（`PATCH_MIN_WEAR_H`）；尚未配对；若带计划佩戴时长 `patchWearH`，其计划结束时刻不早于移除前 24 h（`PATCH_REMOVAL_GRACE_H`，容许晚记的移除）。同一时刻贴上的几片按各自内容（计划时长、剂量、释放速率、酯别、id）排序；同一时刻的几个移除事件先处理 E2 的，再处理 T 的，最后处理不限激素的（它可以取走任一激素的贴片）。因此结果与事件的输入顺序无关。
  2. 没有贴片满足上述条件时，若同一激素最新一次贴上（移除前至少 1 h）的贴片尚未配对，且移除时刻不晚于它的计划结束后 240 h（`PATCH_MAX_OVERWEAR_H`），移除事件配给它：这是按计划已到期、实际一直贴到移除时刻的贴片。同一时刻贴上多片时，按第 1 步的顺序取其中第一片符合条件的。它不会越过更新的一片去配给更早的贴片。仍配不上的移除事件被忽略，不会占用下一片并使之后的配对整体错位。对带计划佩戴时长的贴片，停用或换用其他路由后很久才补记的移除也是这样，贴片按计划结束，不会在整段空档里一直按全速给药；没有计划佩戴时长的贴片在第 1 步里始终可配，无论移除记得多晚都会配给它。240 h 的依据：每周两次、0.1 mg/天的贴片按说明书速率约含 15.6 天的药量（Vivelle-Dot 说明书：1.56 mg），84 h 计划佩戴加 240 h 仍在其内。
  3. 配到移除事件的贴片，移除时刻减去贴上时刻即为 `wearH`。没有配到时，使用贴上事件上的计划佩戴时长 `extras.patchWearH`（表单里按天填写，存为小时）。
  4. 两者都没有，则视为一直佩戴。

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
- **口服 E2：吸收 → 雌酮库 → 清除**，用三室解析式 `_analytic3C(τ; Dose, F, kAbsE2, kE1Pool, k₃)`。吞下的雌二醇大多以雌酮及硫酸雌酮进入血液，这个大的储库在许多小时内再转回雌二醇，所以口服后 E2 达峰晚、下降慢。模型把它写成吸收与清除之间的一阶库，速率为 `OralPK.kE1Pool`。没有这一步时，曲线按 `kAbsE2` 的 2.2 h 半衰期下降，两次日服之间几乎降到零。`resolveParams` 对 EV 以外的口服雌二醇（表单里即 E2）都走这条路径，`k2` 字段填的是 `kE1Pool`。
- **口服 EV：单室 Bateman 吸收-清除**（`oneCompAmount`）。**EV 的水解效应已折叠进更小的 `kAbsEV`，不单独建 `k₂`，也不经雌酮库**：`resolveParams` 给口服 EV 的 `k2` 为 0。它本来就按 `kAbsEV` 的 13.9 h 半衰期下降，因此保持原样。
- **默认参数**：  
  `kAbsE2 = 0.32 h⁻¹`（E2 片的吸收，t½ ≈ 2.2 h）。  
  `kE1Pool = ln2 / 14.36 ≈ 0.0483 h⁻¹`（雌酮库，t½ = 14.36 h；代码常量，不在 PK 参数页）。  
  `kAbsEV = 0.05 h⁻¹`（EV 片，t½ ≈ 13.9 h，模型 `Tmax ≈ 5.8 h`）。  
  `e2_oral_bio = 0.03`（口服首过后系统暴露，E2 与 EV 近似相同量级；`OralPK.bioavailability` 保留同值，运行时读 `e2_oral_bio`，可在 PK 参数页修改）。  
  `F = e2_oral_bio × toE2Factor`，`k₃ = e2_kClear = 0.41 h⁻¹`。
- **模型结果**（70 kg）：口服 E2 1 mg 约 10.3 h 达峰，峰值约 17 pg/mL（加入雌酮库之前为约 2.8 h、69 pg/mL），之后按约 14.4 h 的半衰期下降；2 mg/天稳态时一天内约 31-54 pg/mL，均值约 43.5 pg/mL（此前谷值不足 1 pg/mL，均值不变）。
- 总暴露不随速率改变：无论 `kAbsE2`、`kE1Pool` 取何值，AUC = F·D/k₃。
- 上游 Swift 版 `PKcore` 没有这一库，所以 `tests/routes.test.ts` 与上游曲线的逐点对照中，口服与舌下只保留 EV。
- 口服 CPA 走同一路由但参数完全不同，见 §13。

### 5.2 调参说明
- `F = 0.03` 体现了口服首过代谢的强烈损耗；与常见文献 2-5% 的数量级一致。
- `kE1Pool` 取自口服戊酸雌二醇研究中测得的 E2 半衰期：空腹 14.36 h（Zhang et al. 2024，Table 2，PMC11246651）。该研究的中位 Tmax 10 h 与 Cmax/AUC 0.034 h⁻¹，正是这条链给出的结果（10.3 h、0.032 h⁻¹）。这一半衰期测自口服 EV，模型把它用于口服 E2 片与舌下 E2 的吞咽部分；口服 EV 自身仍用 `kAbsEV`。
- `kAbsEV` 使口服 EV 约 5.8 h 达峰；口服 E2 的峰时主要由雌酮库决定。
- **峰时偏晚（已知差距）**：10 h 是 Zhang 2024 的空腹组，同一研究的进食组在 2-2.25 h 达峰。单片 1 mg E2 的中位 Tmax 为 6 h（`logic.ts` 注释引用的 Activella 说明书），Doll 2022 在 8 h 时仍在上升；而 Angeliq 说明书给出 1 mg/天稳态的中位 Tmax 约 2 h，模型在 70 kg 下稳态峰时约 8.5 h。让一部分剂量直接入血也无法同时拟合单剂量与稳态数据，所以曲线形状留待带时间的化验结果决定（见 §10）。

---

## 6) 舌下（E2/EV）

### 6.1 模型与参数（路线图）
- **双通路**：把剂量按分流系数 **θ** 分为两支：
  - **快通路（口腔黏膜）**：$k_{1,\text{fast}} = k_{\text{SL}} = 1.8\ \mathrm{h}^{-1}$，**绕过首过**。剂量按酯 mg 存储，因此快支 **$F_{\text{fast}}=\text{toE2Factor}$**（E2 为 1，EV ≈ 0.764）。
  - **慢通路（吞咽→胃肠）**：$k_{1,\text{slow}} = k_{\text{Abs,E2/EV}}$（0.32 / 0.05 h⁻¹），**进入首过**，**$F_{\text{slow}}=F_{\text{oral}}\times\text{toE2Factor}$**，其中 $F_{\text{oral}}$ = `e2_oral_bio` = 0.03。吞咽部分与对应的口服路由走完全相同的路径：E2 随后经雌酮库（$k_{\text{E1Pool}} = \ln 2/14.36\ \mathrm{h}^{-1}$，`resolveParams` 中的 `k2_slow`，§5），EV 不经此库。
- **EV 与 E2 的差异**：
  - **舌下 E2**：黏膜快支无水解步（$k_2=0$），用 Bateman 形式（`_analytic2C`）；吞咽慢支与口服 E2 相同，走「吸收 ($k_{\text{Abs,E2}}$) → 雌酮库 ($k_{\text{E1Pool}}$) → 清除 ($k_3$)」的三室解析式（`_analytic3C`）。
  - **舌下 EV**：黏膜快支**进血后仍需水解为 E2**（$k_2=k_{2,\text{EV}}=0.070\ \mathrm{h}^{-1}$），走「吸收 ($k_1$) → 水解 ($k_2$) → 清除 ($k_3$)」的三室解析式（`_analytic3C`）；吞咽慢支与口服 EV 相同，水解已折叠进 `kAbsEV`，用 `_analytic2C`，不再额外乘 $k_2$（2026‑02‑16 起，见 §8），也不经雌酮库（`k2_slow = 0`）。
  - **清除**：吞咽慢支与舌下 EV 的两支用中心室游离 E2 的清除常数 $k_3 = 0.41\ \mathrm{h}^{-1}$（见§1）。**舌下 E2 的黏膜快支**按 $k_{\text{el,SL}} = 1.2\ \mathrm{h}^{-1}$（`OralPK.kElimSL`，`resolveParams` 中的 `k3_fast`）回落，并随生效的清除常数等比例缩放：$k_{\text{el,SL}} = k_3 \times 1.2 / 0.41$。依据见 §6.4。
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
  $T_{\max}=\frac{\ln(k_a/k_e)}{k_a-k_e}$，代入 $k_e=k_3=0.41\ \mathrm{h}^{-1}$ 反推 $k_a\approx 1.8\text{-}2.0\ \mathrm{h}^{-1}$。本项目取 **$k_{\text{SL}}=1.8\ \mathrm{h}^{-1}$**（`OralPK.kAbsSL`）。黏膜快支改按 $k_{\text{el,SL}}=1.2\ \mathrm{h}^{-1}$ 回落之后（§6.4）没有重新标定 $k_{\text{SL}}$：两者给出 $T_{\max}=\ln(1.8/1.2)/0.6\approx 0.68\ \mathrm{h}$，在实测的 30-60 min 之内。θ 的溶解-吞咽模型只用到 $k_{\text{SL}}$，不受影响。
- $k_{\text{diss}}$：口腔制剂溶解/崩解的**分钟级**过程，经验半衰期选 **3/5/10 min** 三档（速崩/常规/偏慢），便于随配方微调。
- $k_{\text{sw}}$：**有效**唾液清除率（非吞咽频次），经验区间 **0.8 / 1.8 / 3.0 h⁻¹** 代表低/中/高个体差异，后续可用外部数据回归精化。

**计算实现**
- App 运行时**不做**数值积分。四档 θ 由上式在中档场景下离线算出，作为常量写在 `logic.ts` 的 `SublingualTierParams` 与 `DEFAULT_PK_PARAMS.e2_sl_*`，可在 PK 参数页通过 `e2_sl_quick` / `e2_sl_casual` / `e2_sl_standard` / `e2_sl_strict` 覆盖。
- 自定义含服时长超过最长一档（15 min）时，`logic.ts` 的 `_slThetaModel` 在运行时直接算上面方框式在中档场景下的闭式解（溶解半衰期 5 min，$k_{\text{SL}} = k_{\text{sw}} = 1.8\ \mathrm{h}^{-1}$）：在 2/5/10/15 min 处为 0.007/0.038/0.112/0.189（四档常量 0.01/0.04/0.11/0.18 与之相近），随 $T_{\text{hold}}$ 增大趋向 $k_{\text{SL}}/(k_{\text{SL}}+k_{\text{sw}}) = 0.5$。用法见下方 UI 档位一节。
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
- 选“自定义含服时长”（至少 1 min；表单滑块为 1-60 min）时，表单调用 `logic.ts` 的 `sublingualThetaFromHold`，保存时把结果写入 `extras.sublingualTheta`。四个点取各档的含服时长与**当前生效**的 θ（默认即上表推荐值 (2 min, 0.01)、(5 min, 0.04)、(10 min, 0.11)、(15 min, 0.18)；PK 参数页对 `e2_sl_*` 的覆盖也会被读取）：
  - 2 到 15 min 之间：在相邻两点之间线性插值。
  - 短于 2 min：沿前两点的直线外推，截在 [0, 1]，默认参数下 1 min 为 0。
  - 15 min 及以上：θ 沿上述溶解-吞咽模型的曲线变化，并按比例缩放到在 15 min 处等于 Strict 档的 θ，即 θ = min(1, θ_strict × θ_model(T) / θ_model(15 min))。默认参数下 30 min 约 0.34、60 min 约 0.45（此前按直线外推，60 min 为 0.81）。
  - 编辑已有记录时，表单用反函数 `sublingualHoldFromTheta` 把存储的 θ 换回含服时长，最多显示 60 min；按旧直线外推保存、60 min 内达不到的 θ 显示为 60。
- **不再读取/依赖 `theta_default`**。

**一致性校验（慢支=口服）**  
当 $\theta=0$ 时，快支剂量为 0，舌下模型**按构造退化为口服**：慢支的 $k_{1,\text{slow}}$、第二步 `k2_slow`、$F_{\text{slow}}$、$k_3$ 与对应口服路由（`resolveParams` 的 `Route.oral` 分支）完全相同（E2 都经雌酮库、用 `_analytic3C`；EV 都不经此库、用 `_analytic2C`），因此整轨迹一致。`tests/routes.test.ts` 对 E2 与 EV 都检查了这一点。

### 6.3 数学形式（实现对照）
- **舌下 E2（快支无水解，慢支经雌酮库）**：快支 Bateman + 慢支三室解析式  
  $$
  A(t)=A^{(2C)}_{\text{fast}}(t)+A^{(3C)}_{\text{slow}}(t),\quad
  A^{(2C)}_{\text{fast}}(t)=\frac{F_{\text{fast}}\,k_{\text{SL}}}{k_{\text{SL}}-k_{\text{el,SL}}}\,\text{Dose}_{\text{fast}}\bigl(e^{-k_{\text{el,SL}} t}-e^{-k_{\text{SL}} t}\bigr),\quad
  A^{(3C)}_{\text{slow}}(t)=\texttt{\_analytic3C}\bigl(t;\ \text{Dose}_{\text{slow}},F_{\text{slow}},k_{\text{Abs,E2}},k_{\text{E1Pool}},k_3\bigr)
  $$
- **舌下 EV（仅快支含水解）**：快支三室解析式 + 慢支 Bateman  
  $$
  A(t)=A^{(3C)}_{\text{fast}}(t)+A^{(2C)}_{\text{slow}}(t),\quad
  A^{(3C)}_{\text{fast}}(t)=\texttt{\_analytic3C}\bigl(t;\ \text{Dose}_{\text{fast}},F_{\text{fast}},k_{\text{SL}},k_{2,\text{EV}},k_3\bigr),\quad
  A^{(2C)}_{\text{slow}}(t)=\texttt{\_analytic2C}\bigl(t;\ \text{Dose}_{\text{slow}},F_{\text{slow}},k_{\text{Abs,EV}},k_3\bigr)
  $$
  其中 $\text{Dose}_{\text{fast}}=\theta\cdot\text{Dose},\ \text{Dose}_{\text{slow}}=(1-\theta)\cdot\text{Dose}$，且 $F_{\text{fast}}=\text{toE2Factor},\ F_{\text{slow}}=F_{\text{oral}}\cdot\text{toE2Factor}$；$k_{\text{el,SL}}=k_3\times 1.2/0.41$ 只出现在舌下 E2 的快支（§6.4），舌下 EV 的快支仍用 $k_3$。

### 6.4 黏膜快支的回落速率 `kElimSL`（2026‑11‑12，issue #22）

**问题。** 此前舌下 E2 的黏膜快支与其他路由共用清除常数 $k_3 = 0.41\ \mathrm{h}^{-1}$。口腔吸收的雌二醇是一次性涌入血液的，所有带连续采样的研究都显示这个高峰在几小时内就过去，而旧模型降得太慢、面积太大（70 kg，1 mg，Standard 档）：

| 观测 | 实测 | 此前 | 现在 |
| --- | ---: | ---: | ---: |
| 3 h 与 1 h 水平之比（Price 1997：约 450 → 85 pg/mL） | 0.19 | 0.59 | 0.19 |
| 达峰时间（Casper & Yen 1981：30 分钟内已升至峰值附近；Pines 1999 综述：30-60 min；Doll 2022 的首个采样点在 1 h） | 0.5-1 h | 1.04 h | 0.68 h |
| 舌下与口服的 0-24 h 暴露之比（Price 1997） | 约 2.5 | 7.2 | 3.0 |
| 舌下与口服的总暴露之比 |  | 4.6 | 2.1 |
| 2 mg 每天一次、晨服前的升幅，82.1 kg（Cortez 2024，pg/mL） | 26.8 | 23 | 23 |
| 1 mg 每天两次、晨服前的升幅，74.0 kg（Cortez 2024，pg/mL） | 31.8 | 41 | 34 |

Doll 2022 另报告 0-8 h 的 AUC 为口服的 1.8 倍（总浓度）；按 issue #22 中转述的队列情况（平均 BMI 33，假定 95 kg；基线 E2 约 24 pg/mL）估算，此前为 6.5 倍，现在为 2.9 倍。谷值由吞咽部分的雌酮库（§5）决定，所以几乎不变。

**拟合。** 把快支的回落速率与 Standard 档的 θ 一起，对四组数据做对数最小二乘（四组等权）：

- 峰值，8 项研究，按各自的剂量与采样时刻比较扣除基线后的水平：Fiet 1982（0.5 mg，30 min，75 pg/mL†）、Casper & Yen 1981（2 mg，卵泡早期组 30 min 382 pg/mL†、性腺功能减退组 45 min 633 pg/mL†）、Doll 2022（1 mg，1 h，120 pg/mL，LC-MS/MS）、Price 1997（1 mg，1 h，441 pg/mL）、Pines 1998（4 mg，1 h，1750 pg/mL）、Rosano 1993（1 mg，40 min，647 pg/mL）、Burnier 1981（0.5 mg，1 h，600 pg/mL）。除 Doll 外均为 RIA。多数研究没有报告体重，这里假定 Fiet 与 Casper & Yen 为 60 kg、Burnier 为 65 kg、Doll 为 95 kg、其余为 70 kg。
- 回落：2 h 与 1 h 之比 0.36（Doll†）、0.40（Price†）、0.52（Burnier†），3 h 与 1 h 之比 0.19（Price）。
- 暴露比：上表的两项（Doll 0-8 h，Price 0-24 h）。
- 谷值：Cortez 2024 的四个晨服前水平（1 个月与 6 个月，每天一次与每天两次）。

标 † 的数值取自下游 Featherline 的推导笔记（<https://github.com/mkx173/Featherline/blob/main/docs/pk-differences.md>）与 issue #22 的讨论，是他们从原文图表读出的；这几篇原文需订阅，本仓库没有逐项核对。其余数值来自各文摘要、Cortez 2024 的全文表格，以及 Kuhl 2005 与维基百科对 Price 1997 的转引。

结果：回落速率 1.2 h⁻¹、θ = 0.10 时误差最小（0.756）；θ 保持 0.11 时为 0.768，θ = 0.08 为 0.826，θ = 0.06 为 1.10，此前的模型（0.41 h⁻¹、θ = 0.11）为 2.38。回落速率由回落与暴露两组数据决定，与 θ 无关：单看 3 h 与 1 h 之比，1.2 h⁻¹ 正好给出 0.19。两个下游分支（Featherline、Kira-HRT-Tracker）各自也取 1.2 h⁻¹。静脉注射后雌二醇的半衰期为 0.5-2 h（0.35-1.4 h⁻¹；维基百科 Pharmacokinetics of estradiol 的汇总），1.2 h⁻¹ 在这个范围内。

**θ 不变。** 峰值的高低是另一个问题，现有数据定不下来。只用峰值数据、回落速率取 1.2 h⁻¹ 时，8 项研究合起来给出 θ = 0.108，去掉 Burnier 为 0.090；但早采样或 LC-MS/MS 的 4 项（Fiet、Casper & Yen 两组、Doll）给出 0.058，1 h 采样的 RIA 3 项（Price、Pines、Rosano）给出 0.166，相差近 3 倍，而且没有一项写明含服了多久。现有的 Standard 档 0.11 落在两者之间，与联合拟合的 0.10 分不出高下，所以四档 θ 与溶解-吞咽模型（§6.2）保持原样。Featherline 取 0.08、Kira-HRT-Tracker 取 0.06，更看重 LC-MS/MS 的结果；Casual 档（θ = 0.04，含服 5 分钟）在本模型中 1 mg 的峰约 128 pg/mL，与 Doll 2022 相近。是否下调 Standard 档，留待带时间的化验结果（§10）。

**实现。**
- `resolveParams` 只在 `k2 = 0`（未酯化 E2）时给出 `k3_fast = k₃ × OralPK.kElimSL / CorePK.kClear`，`buildSublingualAmount` 的快支用它代替 `k₃`。它随生效的清除常数一起变化（年龄调整 §17、PK 参数页的 `e2_kClear`、个人校准的清除倍数 §16），所以黏膜吸收的每 mg 相对其他路由的暴露始终是 `kClear / kElimSL` = 0.34。
- 舌下 EV 等酯类不变：它们的黏膜部分要经水解（`k2`）在数小时内释放，是和其他路由一样的慢输入；也没有找到舌下酯类的连续采样研究。`tests/routes.test.ts` 与上游曲线的逐点对照继续覆盖舌下 EV。
- `getBioavailabilityMultiplier` 与 `F` 的含义不变，仍是进入血液的比例 $\theta + (1-\theta)F_{\text{oral}}$。舌下 E2 的总暴露因此不再是 $F\cdot D/k_3$，而是 $D\,[\theta/k_{\text{el,SL}} + (1-\theta)F_{\text{oral}}/k_3]$。
- 这是单室模型里的经验处理：其他路由输入得慢，一个清除速率就够；一次性涌入的输入会显出更快的早期相，单室模型只能用一个更快的回落速率来画它。
- 给药后的加密采样点增加 0.75 h（§12），否则新的峰（约 0.68 h）落在 0.5 h 与 1 h 两个采样点之间，会被画低约 4%。
- 已有记录不需要迁移：存储的 θ 与档位不变，化验校准按新曲线重新计算。

**曲线的变化**（70 kg，Standard 档，pg/mL）：

| | 此前 | 现在 |
| --- | ---: | ---: |
| 1 mg 单次：峰值（时间） | 509（1.04 h） | 350（0.68 h） |
| 1 mg 单次：2 h / 4 h / 8 h / 24 h | 424 / 205 / 53 / 9.4 | 153 / 26 / 15 / 9.4 |
| 1 mg 单次，四档峰值（Quick / Casual / Standard / Strict） | 48 / 186 / 509 / 832 | 32 / 128 / 350 / 572 |
| 2 mg 每天两次稳态：峰 / 服后 2 h / 4 h / 谷 / 均值 | 1096 / 921 / 475 / 87 / 395 | 766 / 373 / 115 / 72 / 186 |
| 2 mg 每天一次稳态：峰 / 谷 / 均值 | 1043 / 27 / 198 | 722 / 27 / 94 |
| issue #22 的情形（2 mg，55 kg）：峰值 | 1295 | 890 |
| 舌下 EV 1 mg 单次：峰值（时间） | 84（5.9 h） | 84（5.9 h） |

服药后 1-8 h 的估计值明显降低，谷值基本不变。issue #22 提出时这一情形约 1400 pg/mL；口服雌酮库（2026‑10‑13，§8）已先把它降到约 1295。

---

## 7) AUC 计算与稳态
- **AUC**：`runSimulation` 只对 E2 浓度轨迹 `concPGmL_E2` 采用梯形法积分（单位 `pg·h/mL`），覆盖整个时间网格。合成轨迹 `concPGmL` 仍是 E2（pg/mL）与 CPA（ng/mL × 1000，换算为 pg/mL）之和、不含睾酮，但不再用于 AUC：CPA 换算到 pg/mL 后数值大三个数量级，会淹没 E2（2026‑10‑13 之前 AUC 积分的是 `concPGmL`）。界面目前不显示 AUC，它只随分享快照（`src/services/shareSnapshot.ts`）一并保存。
- **稳态**：模型为线性系统（在当前常数 `k₃` 设定下），重复给药时叠加自然收敛至稳态。注射两库、口服雌酮库与贴片零阶输入也保持线性可叠加性。
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
  - 一致性：θ=0 时舌下慢支与口服路由参数相同，整轨迹按构造重合。本仓库现由 `tests/routes.test.ts` 检查这一点（见 §6.2）。
- **2025‑12‑04 至 2025‑12‑05**：剂量口径统一为酯 mg。口服、舌下、凝胶与一阶贴片的 `F` 也乘以 `toE2Factor`（此前只有注射乘），`DoseEvent.doseMG` 注明为酯 mg、不是 E2 当量（b1e407a、d07bc35）。
- **2025‑12‑23**：加入化验值校准，用用户录入的 E2 化验值调整模拟结果（956ff38）。
- **2026‑01‑02**：新增口服醋酸环丙孕酮（CPA）的浓度计算与曲线：单室 Bateman，`k1 = 1.0 h⁻¹`、`k3 = 0.017 h⁻¹`、`F = 0.7`（712aef6）。2026‑10‑13 改为按 Androcur 说明书拟合的双相模型，见 §13。
- **2026‑01‑04**：舌下记录新增“自定义含服时长”，在四档的 (含服时长, θ) 点之间线性插值、两端线性外推得到 θ（89349c7）。2026‑10‑13 起 15 min 以上改按溶解-吞咽模型，见 §6.2。
- **2026‑02‑16**：舌下 EV 吞咽支去掉重复水解。此前两支都走 `_analytic3C`，吞咽支在已折叠水解的 `kAbsEV` 之上又多算了一次 k₂；现快支 `_analytic3C`、慢支 `_analytic2C`（34abefc、922680c，PR #16）。
- **2026‑04‑20**：模拟时间网格改为自适应点数，并在每次给药后加密采样；按各事件的速率常数估算贡献寿命，跳过已衰减到可忽略的事件，加密采样也随之只加给模拟终点仍有贡献的事件（aebda17、7732ea2；2026‑10‑13 起改回每次给药都加，见下文）。
- **2026‑04‑22**：新增跨男模式与睾酮 PK（TC/TE/TU 注射、T 凝胶与贴片，见 §14），同时加入十一酸雌二醇（EU）的注射参数（4a552c2）。
- **2026‑04‑27**：PK 参数可在界面中覆盖（`PKCustomParams` / `DEFAULT_PK_PARAMS`，8c79a17）。
- **2026‑06‑25**：贴片支持计划佩戴时长 `patchWearH`；化验校准改为 off / EKF / OU-Kalman / Hybrid MIPD 四种方法，并新增 forward / retrospective 两种历史模式（c2de2d0），见 §16。
- **2026‑07‑06**（dc233a2）：
  - 三室解析核 `_analytic3C` 的**可去奇点**处理修复：当任意两个速率常数（k₁/k₂/k₃）几乎相等时，旧实现直接返回 0（造成曲线掉零或数值抵消不稳）。新实现先用 `_separateRates` 将重合速率分开 ~1e‑6·max(k) 的极小量，使解析式接近 l'Hôpital 极限。该提交在本文档中写明曾用 RK4 数值积分交叉验证（最坏相对误差 < 5e‑6），且对默认参数曲线零改动，但仓库中没有对应的测试或脚本。这两点都不成立，由 PR #90 更正（见 2026‑10‑13 条目）：错开后的相对误差随距给药时间增大，可达约 1e‑4；默认参数下错开也会触发（TE 注射快库，见本条末尾）。`_separateRates` 已于 2026‑10‑13 由差商形式取代（§2.4）。对 E2，默认参数曲线没有改动：默认参数下（包括校准清除网格 kMul∈[0.5,2] 的 21 个点）最接近的两个速率也相差约 0.005·max(k)，远大于阈值 1e‑6·max(k)；只有在 PK 参数页把 `e2_kClear` 或 `e2_kClearInj` 改到（或经网格缩放后落到）与某个 k₁ 或 k₂ 几乎相等时才会触发。睾酮则不同：默认参数下 TE 注射快库的 `k1_fast` 与 `t_kClearInj` 都是 0.035 h⁻¹，旧实现对这一库恒返回 0，修复后才计入，所以 TE 注射的默认曲线因此改变（快库占剂量的 40%）。
  - 文档与代码对齐：`kClearInjection` 现记为默认 **0.041 h⁻¹**（t½ ≈ 16.9 h），口服 `kAbsE2` 记为 **0.32 h⁻¹**（与其 `Tmax ≈ 2-3 h` 一致），修正早前文档中的过时数值。（2026‑10‑13 起口服 E2 还要经过雌酮库，`Tmax` 约 10 h，见 §5。）
- **2026‑07‑21**（ef4ef02）：
  - 凝胶（E2）：吸收速率由经验常量 `k₁ = 0.022 h⁻¹` 改为按文献表观半衰期反推 `k₁ = ln(2)/36 ≈ 0.0193 h⁻¹`（见 §4.1）。
  - 凝胶（T）：修复部位选择器对睾酮凝胶无效的问题：此前无论选择手臂/大腿/阴囊，`t_gel_F` 恒为 0.10；现按部位区分为 `t_gel_arm`/`t_gel_thigh`/`t_gel_scrotal`（默认 0.10 / 0.10 / 0.50），阴囊值外推自 Iyer et al. 2017、Kuhnert et al. 2005 的睾酮凝胶部位对比数据。PK 自定义参数面板同步更新。
  - 凝胶（E2）阴囊/生殖器部位的 `e2_gel_scrotal` 由 0.40 调整为 0.25（约 5× 手臂/大腿），改为直接对齐 Premoli et al. 2005 阴囊贴片给药的实测倍数，而非睾酮凝胶类比的上限。
  - 移除了未使用的死代码常量 `GelSiteParams`（与 `_getGelBio`/`_activePKParams` 的实际实现重复且未被引用）。
  - UI：移除 Gel、Patch Apply、Patch Remove 路由标签与提示文案中的 "(Beta)" 标记及相应免责声明。上述路由的核心假设（零阶贴片以标称释放率为 `F=1.0`；凝胶按部位生物利用率）均可追溯到具体文献/官方说明书，不再视为实验性功能。`ester.EU`（十一酸雌二醇）保留 Beta 标记，因其人体药代数据仍非常有限（个体间差异可达 10 倍，终末半衰期未知）。
- **2026‑07‑31**：贴片移除事件改为先进先出配对，每个 `patchRemove` 配给尚未配对的最早一片（配对不考虑 `patchWearH` 与激素种类）。此前每片取其后的第一个移除事件，交错佩戴两片时，第二片会在第一片取下时一并停止给药（5052432）。2026‑10‑13 起改为按激素种类、最短佩戴时间与计划时长挑选，见下文与 §3.1。
- **2026‑08‑01**：未酯化 E2 注射（k₂ = 0）改用 `_analytic2C`。修复前 `_analytic3C` 乘以 k₂ 恒为 0，这类剂量对曲线没有任何贡献（84c906e）。
- **2026‑08‑28**：更正 E2 凝胶 `F` 与 `k₁` 的文献出处（36 h 半衰期出自 EstroGel 而非 Divigel；5% 改由说明书稳态浓度反推），数值不变（f8744ef）。
- **2026‑10‑01**：新增辅助用药的记录（SPIRO、BICA、MPA、LEUP、TRIP、RLX）。它们不建模，`runSimulation` 会先把它们剔除，以免被当作雌二醇计算（a57e671），见 §15。
- **2026‑10‑13**（PR #90：e8c0cd0、8e24335、12ab5a8、494f71b、ddff7b1、4a6c118、e480bc0、56dc5ca、1b61183、0e186a1）：修正单元测试（`tests/`）记录下的计算问题。
  - 贴片配对：移除事件只配给同一激素、在移除前至少 1 h 贴上、且未超出计划佩戴时长加 24 h 宽限的贴片中最早的一片；都不符合时配给该激素最新的一片（若尚未配对），否则忽略。此前一次移除可能配给计划早已到期的贴片，与新贴片同时记录的移除会结束新贴片，一个多余的移除会让之后的配对整体错位，睾酮贴片的移除也会结束雌二醇贴片。`computeMaxLifetimeH` 改为按事件本身解析佩戴窗口，同一时刻贴上的第二片不再继承第一片的佩戴时长（e8c0cd0、0e186a1，§3.1）。
  - 采样：每个给药事件都加给药后的加密采样点，只跳过超出该事件贡献寿命的偏移；此前只给模拟终点仍有贡献的事件加，短效的口服 E2 与舌下 E2 因此从不加密，长历史下舌下峰值最多低画约 7%。当前时刻也作为采样点，读取的当前浓度即模型值（8e24335，§12）。
  - 化验校准：拟合出的清除截在网格 [0.5, 2] 内，网格外斜率为 0，报告的 kMul 与所画曲线一致；曲线在网格点之间按拟合的方式插值，不再取最近的网格点；是否允许移动清除按化验前缀判断，6 h 内的化验（从每簇第一个化验算起）只算一簇，forward 模式下第 3 个化验不再改写前两段；EKF 取后验中位数，去掉 Jensen 修正；MIPD 少于 3 个化验时用高斯似然，并从多个起点拟合；拟合误差改由实际绘制的曲线计算（12ab5a8、0e186a1，§16）。
  - 剂量提醒（`getDoseAdvisory`，本文档其余部分不描述）：雌二醇按路由设每日上限（口服 12、舌下 9、凝胶 9 mg/天，贴片按递送量 0.6 mg/天），各路由按占各自上限的比例相加，按设备时区的本地日历日累计；贴片按每次给药起 24 h 内的递送量计，换贴时的短暂重叠不重复计算，只填载药量的贴片不计入，既无移除记录也无计划时长的贴片按 24 h 计；睾酮的每日剂量只计凝胶。注射按每种酯各自的给药间隔读取，12 h 内的同酯注射合并为一次，超过两个间隔未再注射或已换用其他酯后不再计入。激素水平提醒（`getHormoneLevelAdvisory`）把同一时刻的同种化验取平均，最近的 E2 与 T 化验相隔超过 30 天时不作比较（494f71b、0e186a1）。
  - 小修正（ddff7b1）：AUC 只积分 E2（§7）；CPA 只按口服建模，经其他路由（只能来自导入）的 CPA 不再落入雌二醇参数，贡献为 0，`getToE2Factor(CPA)` 改为 1；`sanitizePKParams` 只接受数字或表示数字的字符串，null、空字符串、布尔值与数组按缺失处理（此前 `Number()` 把它们读成 0，再被截到各参数的下限）；舌下自定义含服时长超过 15 min 改按溶解-吞咽模型（60 min 由 0.81 变为约 0.45），并读取 PK 参数页对各档 θ 的覆盖，换算从 `DoseForm.tsx` 移到 `logic.ts` 的 `sublingualThetaFromHold`（§6.2）。
  - 解析核（ddff7b1）：`_analytic2C` 与 `_analytic3C` 改按 e^(−kτ) 的差商计算，速率重合时取精确极限，`_separateRates` 删除（§2.4）。这更正了 2026‑07‑06 条目沿用的两点说法：错开法的误差并非 < 5e‑6，以默认参数下 TE 注射快库为例（k₁ = k₃ = 0.035 h⁻¹），相对误差在给药后 168 h 约 1.6e‑5，1000 h 约 1e‑4；它也不是只在非默认参数下才触发。
  - 口服雌酮库（4a6c118，§5、§6）：口服 E2 与舌下 E2 的吞咽部分在吸收后经过 `OralPK.kE1Pool = ln2/14.36 h⁻¹` 的雌酮库。70 kg 下 1 mg 由约 2.8 h、69 pg/mL 达峰变为约 10.3 h、17 pg/mL；2 mg/天的谷值由约 0.6 pg/mL 变为约 31 pg/mL，均值约 43.5 pg/mL 不变。口服 EV、舌下快支与各档 θ 不变；舌下 E2 的吞咽部分上升变慢，所以舌下 E2 的峰值变低，含服时间越短越明显。
  - 口服 CPA（e480bc0，§13）：按 Androcur 说明书改为一阶吸收加双相处置，F 由 0.7 改为 0.88；70 kg 下 100 mg 峰值由约 67 ng/mL 变为约 285 ng/mL（3 h），终末半衰期 43.9 h，总暴露为旧模型的约 1.4 倍。
  - 睾酮注射（56dc5ca，§14）：三种酯的形成分数由 0.025 改为 0.043（Xyosted、Aveed 说明书），70 kg 下 100 mg/周 TC 或 TE 的平均值由约 430 ng/dL 变为约 730-750 ng/dL；TU 改为单库（释放半衰期 50 天，k₂ 由 0.20 改为 0.036），首剂 1000 mg 的峰由约第 3.2 天移到约第 7 天，1000 mg 每 10 周的稳态谷峰比由约 0.17 变为约 0.42（Nebido 说明书）。代码注释中旧的标定目标（TC/TE 约 600、TU 约 500 ng/dL）一并删除。
  - 删除过时注释（1b61183）：`average`/`adaptive` 校准方法的旧 JSDoc，以及睾酮参数一节对 `transmasc_hrt_modeling_document.md` 的引用。
- **2026‑10‑18**（issue #124）：新增可选的出生年份，作为 Beta 功能，默认关闭。打开并填写后 E2 与睾酮的清除速率 k₃ 按给药时的年龄调整，以 54 岁为基准（§17）；关闭或不填时模型与此前相同。
- **2026‑10‑13**（PR #92：395fa4f、70d6027）：第二轮复查后的修正。
  - 贴片配对（§3.1）：没有按计划匹配的贴片时，移除事件只在该激素最新一片的计划结束后 240 h（`PATCH_MAX_OVERWEAR_H`）内才配给它。此前没有时限，停用或换路由后几周才补记的移除会让带计划佩戴时长的那片贴片在整段空档里一直按全速给药（没有计划时长的贴片仍按第 1 步配给移除，不受这一限制）。同一时刻贴上的几片在两条配对路径上按同一顺序尝试（排序另加酯别），同一时刻的几个移除按 E2、T、不限激素的顺序处理。
  - 剂量提醒（`getDoseAdvisory`）：口服、舌下与凝胶按所含雌二醇的 mg 计（乘 `getToE2Factor`），戊酸酯不再按酯 mg 计。片剂或凝胶与贴片在同一个本地日内合计，贴片取它在这一天内的递送量；每次贴上时另按其后 24 h 的贴片递送量单独检查。此前从片剂换到贴片的那天会把整天的片剂加上贴片其后 24 h 的递送量，在之后两周内一直误报。CPA 改为日均量：取最近 14 天（按给药时刻算，再按本地日分组）内各服药日的平均剂量，除以服药日之间的平均间隔，所以每 2 或 3 天 25 mg 读作 12.5 或 8.3 mg/天，不再提醒；只有一个服药日时按该日全量计。注射间隔取最近 4 个保留间隔的平均值，换成更短的间隔几针内就能反映，周一/周四的节奏读作 3.5 天；单独一个超过总体中位间隔 2 倍的间隔视为停药后重新开始，不计入间隔，并标出最近一轮的开始，连续两个及以上则视为更长的周期而保留。另一种已有至少 2 针（间隔已知）的酯在本酯最后一针之后开始或重新开始时，才算换药，所以换回之前的酯会结束中间那种；本酯在那种酯上一轮期间也注射过的，视为两者并用，不算换药；新酯只打了一针时不再提前停算旧方案。
  - 参数页（§14）：存储的 `t_ff_TC` / `t_ff_TE` / `t_ff_TU` 等于旧默认值 0.025 时按当前默认值 0.043 读取。参数页保存时写入全部字段，此前保存过的人一直停留在旧值上。
  - 注释与测试：口服 E2 注释写明 10.3 h 的峰时及其与 Angeliq 稳态数据的差距，`tests/literature.test.ts` 把后者记为已知差距（§5.2、§10）；TU 注释更正“单库会在一天内达峰”的说法（实为约第 5 天）；睾酮形成分数注释补充 Aveed 的体重分组（§14）；CPA 注释写明低剂量的差距（§13）；Spratt 测试改为读取注射后 3.5 天的值。
- **2026‑11‑03**（issue #203）：新增可选的 SHBG 与游离 E2 子模型 `shbg.ts`，默认关闭，应用不调用。`runSimulation` 增加 `swallowedE2` 选项，只在传入时返回 `concPGmL_E2_swallowed`，默认输出不变。四个场景、敏感性分析与按 issue 判定规则得出的结论见 §18。
- **2026‑11‑04**：新增第五种化验校准方法 `bayes`（全贝叶斯，§16）：对漂移假设做贝叶斯模型平均，按检测方法、数值高低与抽血时曲线斜率设定每个化验的误差，并用 Laplace 后验给预测页逐小时的不确定范围。默认方法仍是 `mipd`；其余四种方法的曲线与预测范围不变。备份中的 `bayes` 暂不被 hrt-cold Tools 接受（见 `docs/backup-schema-audit/BACKUP_TEST_VECTORS.md` BTV-1）。
- **2026‑11‑12**（issue #22）：舌下 E2 的黏膜快支改按 `OralPK.kElimSL = 1.2 h⁻¹` 回落（随生效的清除常数等比例缩放），此前与其他路由共用 `k₃ = 0.41 h⁻¹`。依据、拟合与前后对照见 §6.4。70 kg、1 mg、Standard 档的峰由约 509 pg/mL（1.04 h）变为约 350 pg/mL（0.68 h），3 h 与 1 h 之比由 0.59 变为 0.19，总暴露由口服的 4.6 倍变为 2.1 倍；issue 中 2 mg、55 kg 的峰由约 1295 变为约 890 pg/mL。四档 θ、吞咽支、舌下 EV 与其他路由不变，谷值基本不变。`PKParams` 增加可选的 `k3_fast`；给药后的加密采样点增加 0.75 h；计算沙盒的参数一步列出 `k3_fast`；SHBG 场景 1c 的数字随之更新（§18.4）。

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
- hrt.transmtf.com：化验校准的三种学习方法（EKF、OU-Kalman、Hybrid MIPD）参照该站提供的校准模型，本项目针对可识别的两个参数重新实现（见 §16）。第五种方法 `bayes` 是本项目自有的。
- 仓库内 `transmasc_hrt_modeling_document.md`：跨男（睾酮）建模的设计文档。§14 的参数结构最初以它为参照；2026‑10‑13 起 `logic.ts` 不再引用它，注射参数改按下方的 Xyosted、Aveed、Nebido 说明书标定。

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
- Zhang et al. 2024，口服戊酸雌二醇的药代研究（PMC11246651），Table 2：空腹口服后 E2 半衰期 14.36 h（即 `OralPK.kE1Pool`），中位 Tmax 10 h，Cmax/AUC 0.034 h⁻¹；进食组 2-2.25 h 达峰（§5）。
- Doll et al. Pharmacokinetics of Sublingual Versus Oral Estradiol in Transgender Women. *Endocr Pract*. 2022;28(3):237-242：LC-MS/MS，10 名跨性别女性单次 1 mg，舌下 1 h 时 144 pg/mL，口服 8 h 时 35 pg/mL（§10）。<https://pubmed.ncbi.nlm.nih.gov/34781041/>
- Price TM et al. Single-dose pharmacokinetics of sublingual versus oral administration of micronized 17β-estradiol. *Obstet Gynecol*. 1997;89(3):340-5：6 名绝经后女性，RIA；舌下 1 mg 约 1 h 达峰约 450 pg/mL，3 h 约 85 pg/mL（数值转引自 Kuhl 2005 与维基百科 Pharmacokinetics of estradiol），舌下 AUC 约为口服的 2.5 倍（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/9052581/>
- Kuhl H. Pharmacology of estrogens and progestogens: influence of different routes of administration. *Climacteric*. 2005;8(Suppl 1):3-63（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/16112947/>
- Casper RF, Yen SS. Rapid absorption of micronized estradiol-17β following sublingual administration. *Obstet Gynecol*. 1981;57(1):62-4：2 mg，6 名卵泡早期女性与 3 名性腺功能减退女性，30 分钟内 E2 分别升至基础值的 9 倍与 41 倍（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/7454177/>
- Burnier AM et al. Sublingual absorption of micronized 17β-estradiol. *Am J Obstet Gynecol*. 1981;140(2):146-50：0.5 mg，1 h 时 E2 为基线（24 pg/mL）的 26 倍，前 2 h 内达峰，24 h 回到基线（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/6786097/>
- Fiet J et al. Post-menopausal concentrations of plasma oestradiol, oestrone, FSH and LH and of total urinary oestradiol and oestrone after a single sublingual dose of oestradiol-17β. *Acta Endocrinol (Copenh)*. 1982;101(1):93-7：0.5 mg，8 名绝经后女性，血浆 E2 133-320 pmol/L（36-87 pg/mL）（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/6812348/>
- Pines A et al. The effects of sublingual estradiol on left ventricular function at rest and exercise in postmenopausal women. *Menopause*. 1998;5(2):79-85：4 mg，24 名绝经后女性，60 min 时 1759 ± 704 pg/mL（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/9689200/>
- Pines A et al. The acute effects of sublingual 17β-estradiol on the cardiovascular system. *Maturitas*. 1999;33(1):81-5：综述，舌下 E2 在 30-60 min 达峰（转引自维基百科 Pharmacokinetics of estradiol，§6.4）。<https://pubmed.ncbi.nlm.nih.gov/10585176/>
- Rosano GM et al. Beneficial effect of oestrogen on exercise-induced myocardial ischaemia in women with coronary artery disease. *Lancet*. 1993;342(8864):133-6：1 mg，服后约 40 min 血浆 E2 2531 ± 1192 pmol/L，安慰剂 155 pmol/L（§6.4）。<https://pubmed.ncbi.nlm.nih.gov/8101254/>
- Cortez S et al. Effectiveness and Safety of Different Estradiol Regimens in Transgender Females: A Randomized Controlled Trial. *J Endocr Soc*. 2024;8(8):bvae108（PMC11220669），Table 2、3：初治跨性别女性，免疫法，晨服前抽血，含服至完全溶解。2 mg/天 1 个月后，每天一次组（82.1 kg）52.6 pg/mL（基线 25.8），每天两次组（74.0 kg）55.2 pg/mL（基线 23.4）；6 个月时平均 6.2 mg/天，分别为 95.3 与 79.4 pg/mL（§6.4）。<https://pmc.ncbi.nlm.nih.gov/articles/PMC11220669/>
- Spratt et al. *J Clin Endocrinol Metab*. 2017;102(7):2349：63 名每周皮下注射睾酮的跨性别男性，平均约 73.6 mg/周，注射后 3-4 天平均 702 ng/dL（§14）。<https://academic.oup.com/jcem/article/102/7/2349/3098651>
- Coviello AD et al. Differences in the apparent metabolic clearance rate of testosterone in young and older men with gonadotropin suppression receiving graded doses of testosterone. *J Clin Endocrinol Metab*. 2006;91(11):4669-75：61 名 19-35 岁与 60 名 59-75 岁男性，GnRH 激动剂抑制自身分泌后每周注射庚酸睾酮，表观清除率 1821 ± 102 与 1390 ± 69 L/天（§17）。<https://pubmed.ncbi.nlm.nih.gov/16912120/>
- Wang C et al. Testosterone metabolic clearance and production rates determined by stable isotope dilution/tandem mass spectrometry in normal men: influence of ethnicity and age. *J Clin Endocrinol Metab*. 2004;89(6):2936-41：中年白人男性的清除率 812 L/天，年轻白人男性 1272 L/天（§17）。<https://pubmed.ncbi.nlm.nih.gov/15181080/>
- Longcope C. Metabolic clearance and blood production rates of estrogens in postmenopausal women. *Am J Obstet Gynecol*. 1971;111(6):778-81：5 名 70-88 岁女性的 E2 清除率 580 ± 30 L/天/m²，比年轻女性低约 25%（§17）。<https://pubmed.ncbi.nlm.nih.gov/5171425/>
- Longcope C, Jaffee W, Griffing G. Metabolic clearance rates of androgens and oestrogens in ageing women. *Maturitas*. 1980;2(4):283-90：46-90 岁绝经后女性，E2 清除率与年龄无相关；绝经后低于绝经前，作者认为与 E2 水平低有关（§17）。<https://pubmed.ncbi.nlm.nih.gov/7231200/>
- Longcope C, Johnston CC Jr. Androgen and estrogen dynamics: stability over a two year interval in peri-menopausal women. *J Steroid Biochem*. 1990;35(1):91-5：同一批女性相隔两年（部分在此期间绝经）E2 清除率不变（§17）。<https://pubmed.ncbi.nlm.nih.gov/2308332/>
- Järvinen A et al. Pharmacokinetics of estradiol valerate and medroxyprogesterone acetate in different age groups of postmenopausal women. *Maturitas*. 2004;47(3):209-17：46 名绝经后女性分为 60 岁以下、60-65 岁、65 岁以上，E2 的 Cmax、Tmax、AUC 与半衰期无显著差异（最年长组 AUC 平均高 1.6 倍，未达显著）（§17）。<https://pubmed.ncbi.nlm.nih.gov/15036491/>
- Vermeulen A, Rubens R, Verdonck L. Testosterone secretion and metabolism in male senescence. *J Clin Endocrinol Metab*. 1972;34(4):730-5：老年男性睾酮清除率下降（§17）。<https://pubmed.ncbi.nlm.nih.gov/5012774/>
- Pastuszak AW et al. Population pharmacokinetic modeling and simulations to evaluate a potential dose regimen of testosterone undecanoate in hypogonadal males. *J Clin Pharmacol*. 2021;61(12):1618-25：130 名男性，显著协变量为体重与 SHBG（§17）。<https://pubmed.ncbi.nlm.nih.gov/34269421/>
- Hembree WC, Bardin CW, Lipsett MB. A study of estrogen metabolic clearance rates and transfer factors. *J Clin Invest*. 1969;48(10):1809-19：绝经后女性的雌激素清除率与绝经前在同一范围（§17）。<https://pubmed.ncbi.nlm.nih.gov/5822587/>
- Chantrapanichkul P et al. Serum hormone concentrations in transgender individuals receiving gender-affirming hormone therapy. *Endocr Pract*. 2021;27(1):27-33：196 人的回顾性队列，年龄较大与较高的 E2、睾酮水平相关；观察性结果，未用于定量（§17）。<https://pubmed.ncbi.nlm.nih.gov/33471729/>
- Hoeting JA, Madigan D, Raftery AE, Volinsky CT. Bayesian model averaging: a tutorial. *Statistical Science*. 1999;14(4):382-417：`bayes` 在漂移假设之间按后验概率平均（§16）。
- Tierney L, Kadane JB. Accurate approximations for posterior moments and marginal densities. *J Am Stat Assoc*. 1986;81(393):82-86：Laplace 近似，`bayes` 用它求各假设的边际似然与后验协方差（§16）。
- Lange KL, Little RJA, Taylor JMG. Robust statistical modeling using the t distribution. *J Am Stat Assoc*. 1989;84(408):881-896：Student-t 似然与先验作为稳健建模（`mipd`、`bayes`，§16）。
- Rosner W, Hankinson SE, Sluss PM, Vesper HW, Wierman ME. Challenges to the measurement of estradiol: an Endocrine Society position statement. *J Clin Endocrinol Metab*. 2013;98(4):1376-87：免疫法在低雌二醇浓度下准确度下降，质谱法更可靠；`bayes` 据此按检测方法设定化验误差的下限（§16，下限数值为选定值）。

**官方说明书（补充）**
- EstroGel® 0.06% (estradiol gel) FDA 说明书：表观终末消除半衰期 **36 h**（`k₁` 即取自此处）；1.25 g/day 稳态 Cavg 28.3 pg/mL。<https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/021166s019lbl.pdf>
- Divigel® 0.1% (estradiol gel) FDA 说明书：表观终末半衰期 **10 h**（与 EstroGel 不一致）；每日涂抹于大腿于第 12 天达稳态；0.25/0.5/1.0 mg/day 稳态 Cavg 9.8/21/30.5 pg/mL（未做基线校正）。<https://www.accessdata.fda.gov/drugsatfda_docs/label/2007/022038lbl.pdf>
- 两份美国雌二醇凝胶说明书均**未**给出任何吸收百分比或生物利用率数字。
- Vivelle-Dot® / AndroGel® FDA 说明书：贴片按"体内标称递送速率"设计（0.025-0.1 mg/day），0.1 mg/day 一片含 1.56 mg（`PATCH_MAX_OVERWEAR_H` 的依据，§3.1）；凝胶睾酮系统生物利用率约 10%。
- Androcur® 50 mg（醋酸环丙孕酮）SmPC 第 5.2 节：生物利用度 88%；两片 50 mg 约 3 h 达峰，峰值约 285 ng/mL；终末半衰期 43.9 h；总清除率 3.5 mL/min/kg（§13）。<https://www.medicines.org.uk/emc/product/15996/smpc/print>
- Dianette®（Diane-35）SmPC：2 mg CPA 后约 1.6 h 时 15 ng/mL（§13）。<https://www.medicines.org.uk/emc/product/1122/smpc>
- Angeliq®（1 mg 雌二醇加屈螺酮，每日）说明书：稳态中位 Tmax 2.01 h，Cmax 63.7 pg/mL（§5.2）。<https://medlibrary.org/lib/rx/meds/angeliq-1/page/5/>
- Xyosted®（庚酸睾酮皮下注射，每周）说明书：第 12 周 Cavg 553 ng/dL、Cmin 436 ng/dL（N = 137）<https://medlibrary.org/lib/rx/meds/xyosted/page/4/>；剂量经滴定，FDA 临床药理综述给出 50/75/100 mg 各 25/93/19 人，平均 73.9 mg/周 <https://www.accessdata.fda.gov/drugsatfda_docs/nda/2019/209863Orig1s000ClinPharmR.pdf>（§14）。
- Aveed®（十一酸睾酮 750 mg，第 0、4 周后每 10 周）说明书：第三针后 Cavg 495 ng/dL（N = 117）；按体重分组为 65-100 kg 568 ng/dL、100 kg 及以上 426 ng/dL（§14）；试验 130 人平均 54.2 岁（§17）。<https://medlibrary.org/lib/rx/meds/aveed/page/6/>
- AndroGel® 1.62% 说明书 §14：274 名性腺功能减退男性，18-80 岁，平均 53.8 岁（§17）。<https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=f4e8d29b-8707-4d47-e053-2a95a90aecee>
- Azmiro®（环戊丙酸睾酮肌注）说明书：单次 200 mg，Tmax 72 h，基线校正后 Cmax 758 ng/dL、AUC 137,219 h·ng/dL（§14、§10）。<https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/216318s002lbl.pdf>
- Nebido®（十一酸睾酮）说明书：首次 1000 mg 后第 7 天达峰；释放半衰期 90 ± 40 天；每 10 周 1000 mg 稳态峰约 37 nmol/L、谷约 16 nmol/L，谷峰比 0.43（§14）。<https://www.rxreasoner.com/monographs/nebido/pharmacology>

**百科与药学数据库**
- Wikipedia: Pharmacokinetics of estradiol（路由差异、凝胶 36 h 表观半衰期等聚合条目）<https://en.wikipedia.org/wiki/Pharmacokinetics_of_estradiol>
- Wikipedia: Estradiol undecylate（人体药代数据有限、终末半衰期未知、个体差异可达 10 倍；这是 `ester.EU` 保留 Beta 标记的依据）<https://en.wikipedia.org/wiki/Estradiol_undecylate>
- DrugBank: Estradiol（透皮生物利用度对比口服、部位差异）<https://go.drugbank.com/drugs/DB00783>

> 说明：实现中还参考了多份品牌说明书与审评文档、二级综述与数据手册，此处不一一列举。

---

## 10) 局限
- 个体差异大多未建模：肝功能、SHBG、体脂、并用药等可能改变 `F` 与各速率常数（SHBG 与游离 E2 有一个可选的子模型，默认关闭，见 §18）。年龄只按文献对清除率做粗略调整（§17），且 E2 一侧的证据并不一致。化验校准（§16）只能事后修正 E2 的整体幅度与清除。
- 凝胶的面积/负荷非线性：当前未在模型中体现；存在低剂量低估与高剂量高估的潜在风险。
- 注射溶剂/体积影响：对扩散 `k₁` 的影响尚未显式参数化，现仅能通过代码常量 `depotK1Corr` 整体近似。
- 口服 E2 与舌下 E2 吞咽部分的雌酮及其硫酸酯储库只用一个一阶库（`kE1Pool`）近似，其速率取自口服 EV 后测得的 E2 半衰期；模型不输出雌酮浓度，口服 EV 也不经此库（§5）。
- AUC 的跨路由可比性有限：参数含经验缩放，AUC 适合于相同路由内的相对比较与个体内优化。
- CPA 与睾酮注射的参数按说明书数据标定（§13、§14），但都是线性模型，且不经化验校准；螺内酯、比卡鲁胺等辅助用药只记录不建模（§13 至 §15）。
- 与已发表数据的已知差距，记录在 `tests/literature.test.ts` 的 `it.fails` 中，修好时测试会提醒（70 kg）：
  - 舌下 E2 1 mg（Standard 档，θ = 0.11）峰值约 350 pg/mL，约为 Doll 2022 LC-MS/MS 实测 144 pg/mL 的 2.4 倍（`kElimSL` 之前为 509 pg/mL、3.5 倍，即 issue #22 的反馈）。该研究未写含服时长，队列偏重（据 issue #22 的转述，平均 BMI 33），测试的 70 kg 没有计入这一点；而 1 h 采样的 RIA 研究（Price 1997、Pines 1998）每 mg 约 440-450 pg/mL，高于模型。峰值的高低仍未定，留待带时间的化验结果（§6.4）。
  - 口服 E2 1 mg 在 8 h 时约 16 pg/mL，不到 Doll 2022 的 35 pg/mL 的一半；1 mg/天稳态的峰时约 8.5 h，Angeliq 说明书约 2 h（§5.2）。
  - 每周 73.9 mg TE（Xyosted 的平均剂量）的谷值约 237 ng/dL，谷均比约 0.43，说明书为 436 ng/dL、0.79。肌注的 Azmiro 说明书（单次 200 mg TC 约 72 h 达峰）同样比模型（约 2 天达峰、约 1430 ng/dL）平缓，所以注射途径解释不了这一差距；储库速率留待带时间的化验结果再调整（§14）。
- 尚未单独记为测试的偏差：CPA 只有单剂量数据，低剂量可能偏低（§13）；睾酮注射的形成分数按 70 kg 标定，Aveed 说明书的体重分组提示实际水平可能是模型的约 1.3-1.4 倍（§14）。

---

## 11) 快速对照：各路由实现要点

| 路由 | 解析/数值 | 输入 | 模型 | 关键参数 | F 的来源 |
| --- | --- | --- | --- | --- | --- |
| 注射（油剂 EB/EV/EC/EN/EU） | 解析 | mg（酯） | 两库吸收 + k₂ 水解 + k₃ 清除（`_analytic3C` × 2） | `Frac_fast, k1_fast, k1_slow, k2, k3 (= e2_kClearInj = 0.041)` | `formationFraction`（`e2_ff_*`）× `toE2Factor` |
| 注射（未酯化 E2） | 解析 | mg | 单库 Bateman（`_analytic2C`），k₂ = 0 | `k1_fast = 0.5, k3 = 0.041` | 1.0 × `toE2Factor`（= 1） |
| 贴片（零阶） | 解析 | µg/day → mg/h | 零阶恒速输入 + k₃ 清除；移除后指数衰减 | `rateMGh, k3 = 0.41`；`wearH` 见 §3.1 | 固定 1.0 × `toE2Factor` |
| 贴片（一阶遗留） | 解析 | mg | 一阶“假库” + k₃ 清除；移除时截断 | `k1 = 0.0075, k3 = 0.41` | 固定 1.0 × `toE2Factor` |
| 凝胶（E2） | 解析 | mg + 涂抹部位 | 单室 Bateman | `k1 = ln2/36 ≈ 0.0193, k3 = 0.41` | 按部位：手臂/大腿 0.05、阴囊 0.25（`e2_gel_*`）× `toE2Factor` |
| 口服 E2 | 解析 | mg | 吸收 → 雌酮库 → 清除（`_analytic3C`） | `kAbsE2 = 0.32, kE1Pool = ln2/14.36 ≈ 0.0483, k3 = 0.41` | `e2_oral_bio` 0.03 × `toE2Factor` |
| 口服 EV | 解析 | mg（酯） | 单室 Bateman（水解折叠进 `kAbsEV`，不经雌酮库） | `kAbsEV = 0.05, k3 = 0.41` | `e2_oral_bio` 0.03 × `toE2Factor` |
| 舌下 E2/EV | 解析 | mg（酯） | 双通路：快 = 黏膜、慢 = 吞咽→口服；**E2 快支 `_analytic2C`、慢支 `_analytic3C`（雌酮库）；EV 快支 `_analytic3C`、慢支 `_analytic2C`** | `θ` 来自四档（2/5/10/15 分钟）或自定义时长（档间插值，15 分钟以上按溶解-吞咽模型）；`kAbsSL = 1.8`，`kAbsE2/EV`，`k2(EV) = 0.070`（仅快支），`kE1Pool`（仅 E2 慢支），`k3 = 0.41`，`kElimSL = 1.2`（仅 E2 快支，代替 `k3`） | 快 `toE2Factor`；慢 `F_oral = 0.03` × `toE2Factor` |
| 口服 CPA | 解析 | mg | 一阶吸收 + 双相处置（两个 `_analytic2C` 之和） | `ka = 0.5, α = 0.25, β = ln2/43.9 ≈ 0.0158`，Vd 14 L/kg | 固定 0.88 |
| 睾酮注射 TC/TE/TU | 解析 | mg（酯） | 两库吸收 + k₂ 水解 + k₃ 清除（TU 只有一个库） | 见 §14；`k2 = 0.20`（TU 0.036），`k3 = t_kClearInj = 0.035` | `t_ff_*` 0.043 × toT 因子 |
| 睾酮凝胶 | 解析 | mg + 涂抹部位 | 单室 Bateman | `k1 = 0.05, k3 = t_kClear = 0.5` | 按部位：手臂/大腿 0.10、阴囊 0.50（`t_gel_*`）× toT 因子（T 为 1） |

---

## 12) 实现细节摘抄
- **`PrecomputedEventModel`**（每个事件一个闭包，`tau` 为距给药的小时数，`tau < 0` 时为 0）：
  - 注射：`_analytic3C(tau, doseFast, F, k1_fast, k2, k3) + _analytic3C(tau, doseSlow, F, k1_slow, k2, k3)`；`k2 = 0` 时两项都换成 `_analytic2C`。
  - 凝胶/口服：`k2 > 0`（口服 E2，`k2 = kE1Pool`）时为 `_analytic3C(tau, dose, F, k1_fast, k2, k3)`，否则（凝胶、口服 EV）为 `oneCompAmount(tau, dose, p)`，即 `_analytic2C(tau, dose, F, k1_fast, k3)`（把 `k1_fast` 视作该路由的 `ka`）。
  - 口服 CPA：`_analytic2C(tau, dose, F·wFast, ka, α) + _analytic2C(tau, dose, F·wSlow, ka, β)`，常数取自 `CPA_ORAL`（§13）。
  - 舌下：`doseF = dose × θ`、`doseS = dose × (1 − θ)`；快支在 `k2 > 0`（EV）时为 `_analytic3C(tau, doseF, F_fast, k1_fast, k2, k3)`，否则（E2）为 `_analytic2C(tau, doseF, F_fast, k1_fast, k3_fast)`，`k3_fast` 缺省时取 `k3`（§6.4）；慢支在 `k2_slow > 0`（E2，`k2_slow = kE1Pool`）时为 `_analytic3C(tau, doseS, F_slow, k1_slow, k2_slow, k3)`，否则（EV）为 `_analytic2C(tau, doseS, F_slow, k1_slow, k3)`。
- **贴片**：
  - `resolvePatchWearH` 决定 `wearH`：先取 `patchRemovalTimes` 按 §3.1 的规则配给这一片的移除时刻，再取 `extras.patchWearH`，都没有则为 `Number.MAX_VALUE`（一直佩戴）。
  - 零阶：佩戴内 `rateMGh/k3 × (1 − e^{−k3 t})`；移除后按 `e^{−k3 Δt}` 衰减。
  - 一阶：用 `oneCompAmount` 计算佩戴内药量；移除后取 `oneCompAmount(wearH)` 再按 `e^{−k3 Δt}` 衰减，使吸收在 `wearH` 处截断。
- **`runSimulation`**：
  - 先用 `isUnmodelledDrug` 剔除未建模药物与本版本不认识的药物代码（§15）；没有剩余事件或体重 ≤ 0 时返回 null。
  - 时间范围：首个事件前 24 h 到 max(最后一个事件 + 14 天, 当前时刻 + 24 h)。均匀网格点数为 `min(100000, max(2000, ceil(总小时数)))`，约每小时一个点；再并入每个事件的时刻、每个事件后 0.25/0.5/0.75/1/2/4/6/8/12/24/48 h 的加密采样点（超出该事件贡献寿命的偏移跳过），以及落在时间范围内的当前时刻（使读取的当前浓度就是模型值，而不是插值）。
  - 贡献寿命（`computeMaxLifetimeH`）：取事件最小的非零速率常数 `k_min`（`k1_fast`、`k1_slow`、`k2`、`k2_slow`、`k3`；口服 CPA 为 `ka` 与 β），`maxLifetimeH = ceil(13.816 / k_min)`（13.816 ≈ ln 1e6，即 e^{−k_min·τ} < 1e‑6）；贴片为 `wearH + ceil(13.816 / k3)`，`wearH` 按这一事件本身解析，一直佩戴的贴片始终计算。超过寿命的事件不再求值。
  - 逐点按药物分组累加药量：CPA 一组，睾酮各形式一组，其余（雌二醇各形式）一组；分别换算为 E2 pg/mL、CPA ng/mL、总睾酮 ng/dL（§0）。
  - **AUC**：对 E2 浓度梯形法累计（§7）。
  - 传入 `{ swallowedE2: true }` 时，另把每个 E2 事件中被吞下的部分（口服全部，舌下的慢支）单独累加为 `concPGmL_E2_swallowed`，供 §18 的 SHBG 子模型使用；不传时不计算也不返回，其余输出不受影响。

---

## 13) 环丙孕酮（CPA，口服）
- **入口**：记录表单只在口服路由提供 CPA，模型也只按口服计算。曲线由 `PrecomputedEventModel` 按 `CPA_ORAL` 的常数直接算出；`resolveParams` 的 `Route.oral` 分支也为 CPA 返回 `ka`、β 与 `F`，其中只有 `ka` 与 β 起作用，用来确定贡献寿命（`computeMaxLifetimeH`）。经其他路由记录的 CPA（只能来自导入）：`resolveParams` 返回零参数，`getBioavailabilityMultiplier` 返回 0，对任何曲线都没有贡献（2026‑10‑13 之前会落入雌二醇的参数）。
- **模型**：一阶吸收（`ka`）后按两个处置相离开血液。吸收量经 CPA 曲线所用的 14 L/kg 分布容积 V 读出时，单位吸收量的响应为 (wFast·e^(−αt) + wSlow·e^(−βt)) / V，因此
  $$
  A(t)=\texttt{\_analytic2C}(t;\ \text{Dose},\ F\,w_{\text{fast}},\ k_a,\ \alpha)+\texttt{\_analytic2C}(t;\ \text{Dose},\ F\,w_{\text{slow}},\ k_a,\ \beta)
  $$
  响应的积分 wFast/α + wSlow/β 等于 V/CL = 14 / (0.0035 × 60) ≈ 66.7 h，使总暴露对上说明书的清除率；约三分之一的暴露在第一相。
- **参数**（代码常量 `CPA_ORAL`，不在 PK 参数页；来源为 Androcur 50 mg SmPC 第 5.2 节，见 §9）：`F = 0.88`（生物利用度 88%，`getToE2Factor(CPA) = 1`）；`ka = 0.5 h⁻¹`；α = 0.25 h⁻¹（第一相 t½ ≈ 2.8 h）；β = ln2/43.9 ≈ 0.0158 h⁻¹（终末 t½ 43.9 h）；`wFast = 5.2786`（使 100 mg 的峰值为 285 ng/mL）；`wSlow = (66.7 − wFast/α) × β ≈ 0.719`。`ka` 与 α 使峰时落在 3 h。
- **模型结果**（70 kg）：100 mg 单次约 3 h 达峰，峰值约 285 ng/mL（此前约 67 ng/mL），之后以 43.9 h 的半衰期下降；12.5 mg/天稳态时一天内约 18-53 ng/mL。总暴露是旧模型（F = 0.7、单相 k₃ = 0.017 h⁻¹）的约 1.4 倍。
- **局限**：标定所用全是单剂量数据。低剂量可能偏低：Dianette（Diane-35）说明书报告 2 mg 后约 1.6 h 时 15 ng/mL，模型在 70 kg 下约 3 h 达峰、约 5.7 ng/mL，拟合 100 mg 数据的线性模型无法同时匹配两者。每日服药时的水平尚未与多剂量研究核对。
- **分布容积与单位**：`vdPerKG_CPA = 14.0 L·kg⁻¹`，`conc(ng/mL) = amountMG × 1e6 / Vd_ml`。
- **不校准**：化验只测 E2，校准倍数不作用于 CPA；CPA 的 α、β 也不随 `e2_kClear` 或校准的清除网格变化。
- **显示**：概览页读数中低于 `CPA_MIN_NGML = 0.1 ng/mL` 的估计值显示为 "--"；同时记有雌二醇和 CPA 时，图表分成上下两张小图（上雌二醇、下 CPA），各自有纵轴，纵轴按可见窗口内的数据自动缩放，不再固定从 0 起；下方 CPA 坐标轴只在可见窗口内的 CPA 估计达到该阈值时才标注，曲线本身照常绘制。

---

## 19) 比卡鲁胺（Bicalutamide，口服，可选子模型，默认关闭）

- **状态**：比卡鲁胺是 `UNMODELLED_DRUGS` 中第一个获得 PK 子模型的抗雄激素（issue #206 §3）。模型为单室、一级吸收、线性，输出单位 ng/mL，时间轴与现有模拟一致。默认关闭，与 `shbg.ts` 的 off-by-default 一致；通过 `runSimulation(..., { bicalutamide: true })`（或含 "bica"/"bicalutamide" 的等价开关）启用。启用前比卡鲁胺仍按未建模处理（不画曲线）。

- **模型**：单室 Bateman 吸收-清除：
  $$
  C(t)=\frac{F\,D}{V_d}\frac{k_a}{k_a-k_e}\left(e^{-k_e t}-e^{-k_a t}\right),\qquad k_e=\frac{\ln 2}{t_{1/2}}.
  $$
  代码实现为 `_analytic2C(tau, dose, F, ka, ke)`，`F = 1`（绝对生物利用度未知，但 `F` 折入 `V_d/F`）。

- **参数**（代码常量 `BICALUTAMIDE_ORAL`，不在 PK 参数页；来源：Casodex 说明书 Table 3，活性 R-对映体；`CL/F ≈ 0.8 L/h` 取自 issue #206 §2 的标称值）：

| 参数 | 值 | 含义 |
| --- | ---: | --- |
| $t_{1/2}$ | $5.8\ \mathrm{d}$ | 终末半衰期 |
| $CL/F$ | $0.8\ \mathrm{L\,h^{-1}}$ | 表观口服清除率 |
| $k_e$ | $\ln 2/(5.8\times24)\approx 0.00498\ \mathrm{h^{-1}}$ | 消除速率 |
| $V_d/F$ | $(CL/F)/k_e\approx 160.7\ \mathrm{L}$（≈2.30 L·kg⁻¹） | 表观分布容积 |
| $T_{\max}$ | $\approx 31\ \mathrm{h}$ | 达峰时间 |
| $k_a$ | $\approx 0.1026\ \mathrm{h^{-1}}$ | 由 $T_{\max}$ 与 $k_e$ 反推：$T_{\max}=\ln(k_a/k_e)/(k_a-k_e)$ |
| $F$ | 1 | 折入 $V_d/F$ |

- **§3 反推校验步骤**：
  1. 取 $D$、报告的 $\mathrm{AUC}_{0-\infty}$、$C_{\max}$、$T_{\max}$、$t_{1/2}$。
  2. $CL/F = D/\mathrm{AUC}_{0-\infty}$，$V_d/F = (CL/F)/k_e = D\,t_{1/2}/(\mathrm{AUC}_{0-\infty}\ln 2)$。
  3. 由 $T_{\max}$ 与 $k_e$ 反推 $k_a$。
  4. 代回 $C(t)$ 重算 $\mathrm{AUC}$ 与 $C_{\max}$，相对误差 $<10\%$ 方可接受。
  
  本实现以 $CL/F = 0.8\ \mathrm{L/h}$、$t_{1/2}=5.8\ \mathrm{d}$、$T_{\max}=31\ \mathrm{h}$ 自检：AUC 与公式值一致（误差 $<10\%$），$T_{\max}$ 落在 31 h 附近，$C_{\max}$ 与闭式解一致（误差 $<10\%$）；50 mg qd 连续给药数周后蓄积（非数小时达稳态）。

- **不参与**：SHBG 诱导项（比卡鲁胺不是雌二醇，不驱动 `shbgCurve`）；`e2_kClear` 化验校准（化验只测 E2，校准倍数不作用于比卡鲁胺；其 $k_e$ 也不随 `e2_kClear` 变化）。原因：化验与 SHBG 子模型均以雌二醇为中心，比卡鲁胺既非雌二醇也非睾酮，且为弱/无 SHBG 诱导。

- **局限**：活性 R-对映体占稳态血药浓度约 99%，本模型未拆分对映体（按 R-对映体参数建模）；食物效应 clinically 不显著；蛋白结合 96% 未显式建模；绝对生物利用度未知。GnRH 激动剂合用时的相互作用未建模。

- **接入**：`resolveParams` 仅口服路由返回 $k_a$、$k_e$；其他路由返回零参数；`getBioavailabilityMultiplier` 仅口服返回 1。`PrecomputedEventModel` 口服分支对 `Ester.BICA` 直接用 `_analytic2C`。`runSimulation` 通过 `concPGmL_BICA`（ng/mL）输出，并提供 `interpolateConcentration_BICA`。

## 20) 内源性睾酮压制（transfem，辅助抗雄激素，默认锚定基线）

- **状态**：雌二醇通过下丘脑/垂体负反馈压制 LH/FSH，从而降低内源性睾酮。生理剂量下仅为**部分**压制（transfemscience.org intro；Leinung 2018：E2 < 50 pg/mL 时 TT ~160 ng/dL，E2 100–150 pg/mL 时 ~50 ng/dL）；完全压制到女性范围通常需要超生理剂量雌二醇或抗雄激素/GnRH 激动剂（Misakian 2025 PMID 40639470：睾丸未切除者注射雌二醇单药 82.6% 达 TT < 50 ng/dL）。睾丸切除后睾酮降至 ~10–30 ng/dL 并在继续雌二醇下稳定（Collet 2023 PMID 36201493）。因此本模型把雌二醇的压制作为**抗雄激素的辅助前提**，而非替代。

- **模型**：给定基线睾酮 $T_0$（ng/dL，来自用户首次血检），在雌二醇浓度 $E$（pg/mL）下的剩余分数
  $$
  r(E)=\frac{1}{1+\left(\frac{E}{E_0}\right)^{k}},\qquad E_0\approx 13.5\ \text{pg/mL},\ k\approx 0.815,
  $$
  校准到 $r(200)\approx 0.10$、$r(500)\approx 0.05$。抗雄激素存在时进一步降低（辅助前提）：
  $$
  r_{\text{combined}}(E,\text{AA})=
  \begin{cases}
  r(E), & \text{AA 缺失},\\
  \min(r(E),\,0.3\,r(E)), & \text{AA 存在}.
  \end{cases}
  $$
  预期睾酮：
  $$
  \hat T(t)=T_0\cdot r_{\text{combined}}(E(t),\text{AA}(t))+T_{\text{exo}}(t).
  $$
  未提供基线时行为不变（曲线保持外源性贡献，transfem 无 T 剂量时为 0）。

- **代码**：`logic.ts` 中 `estradiolTestosteroneSuppressionFactor`、`combinedTestosteroneSuppressionFactor`、`expectedTestosteroneNgDl`；`runSimulation` 通过 `options.testosteroneBaselineNgDl`（或 `testosteroneBaseline`/`ttBaseline`）与 `options.antiandrogen` 启用。默认关闭。输出仍为 `concNGdL_T`（ng/dL），`interpolateConcentration_T` 不变。

- **局限**：群体稳态近似，未解析 LH/FSH 动力学；必须锚定个体首次血检 $T_0$；抗雄激素的额外降低因子为近似；GnRH 激动剂/拮抗剂的压制未单独建模（按抗雄激素处理）。UI 存储 $T_0$、血检录入、开关与轨迹视图留待后续 issue（tag @SmirnovaOyama）。

## 14) 睾酮（跨男模式）
- **范围**：`T_ESTERS` 包括 T（未酯化，用于凝胶/贴片）、TC、TE、TU。`runSimulation` 把它们单独累加为总睾酮曲线 `concNGdL_T`（ng/dL）。跨男模式下，单次记录表单只提供注射（TC/TE/TU）与凝胶（T）；计划与预测页的药物列表另含 T 贴片。口服、舌下睾酮与未酯化 T 注射不建模（`resolveParams` 返回零参数）。
- **剂量与 F**：剂量同样按酯 mg 存储；`getToE2Factor` 对睾酮酯返回 MW(T)/MW(酯)（TC 0.6990、TE 0.7200、TU 0.6315、T 1.0），各路由的 `F` 都乘以它。
- **注射**：两库吸收 + 水解，快/慢库各一个 `_analytic3C`（`T_DepotPK`、`T_EsterPK`；不乘 `depotK1Corr`）。TU 只有一个库：`Frac_fast = 0`，快库不分到剂量，两库的 k₁ 也相同。

| 酯 | Frac_fast | k1_fast (h⁻¹) | t½_fast (h) | k1_slow (h⁻¹) | t½_slow (h) | k2 (h⁻¹) | t½_hydrolysis (h) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TC | 0.35 | 0.025 | 27.73 | 0.005 | 138.63 | 0.20 | 3.47 |
| TE | 0.40 | 0.035 | 19.80 | 0.008 | 86.64 | 0.20 | 3.47 |
| TU | 0 | ln2/1200 ≈ 0.000578 | 1200（50 天） | ln2/1200 ≈ 0.000578 | 1200（50 天） | 0.036 | 19.25 |

- 注射的 `k3 = t_kClearInj = 0.035 h⁻¹`（t½ ≈ 19.8 h，flip‑flop 下的有效值）；形成分数 `t_ff_TC` / `t_ff_TE` / `t_ff_TU` 默认均为 **0.043**，`F = t_ff × toT 因子`。
- **形成分数的标定**（`DEFAULT_PK_PARAMS.t_ff_*` 注释，70 kg）：两份不同酯的说明书给出同一个值。Xyosted（庚酸睾酮皮下注射，每周）第 12 周 Cavg 553 ng/dL，试验中剂量经滴定，平均 73.9 mg/周，0.043 在该剂量下给出 555 ng/dL；Aveed（十一酸睾酮 750 mg，第 0、4 周后每 10 周）第三针后 Cavg 495 ng/dL，0.043 给出 503 ng/dL。于是 100 mg/周 TC 或 TE 的平均值约 730-750 ng/dL。旧值 0.025 使 100 mg/周约为 430 ng/dL，约为两份说明书的 0.6 倍。Azmiro（环戊丙酸睾酮 200 mg 肌注）说明书的数值更低，但它做了基线校正，而该剂量会抑制自身睾酮，低估了剂量的贡献，`tests/literature.test.ts` 只把它作为下限。
- **70 kg 可能偏低**：Aveed 说明书还按体重分组，65-100 kg 组 Cavg 568 ng/dL，100 kg 及以上组 426 ng/dL；这一比值与模型按 1/体重缩放、两组平均体重约 85 与 113 kg 时相符。若在这样的体重下标定，形成分数约为 0.055-0.06，即 70 kg 的人实际水平可能是模型的约 1.3-1.4 倍；Spratt et al. 2017（每周皮下注射的跨性别男性，平均约 73.6 mg/周，注射后 3-4 天平均 702 ng/dL，模型在第 3.5 天约 600 ng/dL）指向同一方向。在有带时间的化验结果之前，与凝胶一样保持 70 kg。
- **TU 的曲线形状**（`T_DepotPK` 注释）：Nebido 说明书给出首次 1000 mg 后第 7 天达峰、释放半衰期 90 ± 40 天、每 10 周 1000 mg 稳态峰约 37 nmol/L 与谷约 16 nmol/L（谷峰比 0.43）。取说明书范围下端的 50 天释放半衰期可得到这一谷峰比（模型约 0.42）。单靠 50 天释放的一阶库（第二步仍取 0.20 h⁻¹）模型约在第 5 天达峰，所以把第二步 k₂ 放慢到约等于注射清除率（0.036 h⁻¹，`t_kClearInj` 为 0.035 h⁻¹），使峰移到第 7 天（说明书与 Aveed 的中位数），水平变化不到 2%。这一步代表说明书数据中延缓上升的过程，是拟合出来的，不是单独测得的水解速率。旧参数（两库，k₂ = 0.20）约第 3.2 天达峰，稳态谷峰比约 0.17。
- **凝胶**：`k1 = 0.05 h⁻¹`（`T_GelPK`），`k3 = t_kClear = 0.5 h⁻¹`（t½ ≈ 1.39 h），`F` 按部位取 `t_gel_arm` / `t_gel_thigh` / `t_gel_scrotal` = 0.10 / 0.10 / 0.50（来源见 §4.1）。
- **贴片**：有标称释放率时为零阶输入，`F = T_PatchPK.F = 1.0`；否则为一阶 `k1 = 0.03 h⁻¹`；`k3 = 0.5 h⁻¹`；佩戴窗口规则同 §3.1。
- **分布容积与单位**：`T_CorePK.vdPerKG = 1.0 L·kg⁻¹`（总睾酮的表观分布容积），`conc(ng/dL) = amountMG × 1e8 / Vd_ml`。nmol/L 的化验值按 × 28.842 换算为 ng/dL。
- **可调参数**：PK 参数页可改 `t_kClear`、`t_kClearInj`、`t_ff_*`、`t_gel_*`；两库参数与 `k2` 是代码常量。参数页保存时写入全部字段，所以存储的 `t_ff_*` 等于旧默认值 0.025 时，`sanitizePKParams` 按当前默认值 0.043 读取（`PK_FORMER_DEFAULTS`），在页面上输入 0.025 也一样；其他值（如 0.0251）按输入使用。
- **标定依据**（`logic.ts` 注释）：凝胶与注射在 70 kg 下对照各参数处引用的说明书检查（`tests/literature.test.ts`）；说明书人群大多更重，所有路由统一用 70 kg 以保持彼此一致。AndroGel 1% 说明书：50 mg/天 Cavg ≈ 555 ng/dL（模型约 595 ng/dL）；Androderm 5 mg/天贴片 → 500-700 ng/dL（模型约 595 ng/dL）；注射见上。注释同时写明这些只是研究/教学用估计，不用于个体剂量决策。旧注释中的目标（TC 或 TE 100 mg/周 Cavg ≈ 600 ng/dL、TU 1000 mg/12 周 ≈ 500 ng/dL）已于 2026‑10‑13 删除。
- **年龄**：填写了出生年份时，`t_kClear` 与 `t_kClearInj` 乘以年龄倍数（§17，依据 Coviello 2006），以 54 岁为基准，约每岁 0.68%。
- **不校准**：化验校准只作用于 E2（§16），睾酮曲线始终是原始模型值。
- 更完整的跨男建模设计（游离睾酮、SHBG、Hct 等）见仓库内 `transmasc_hrt_modeling_document.md`；代码只实现了其中总睾酮 PK 的简化部分，`logic.ts` 也已不再引用该文档。

---

## 15) 其他辅助用药（只记录，不建模）
- `Ester` 枚举里还有五种仍只记录不建模的药：螺内酯 SPIRO、醋酸甲羟孕酮 MPA、雷洛昔芬 RLX（表单在口服路由提供），以及 GnRH 激动剂亮丙瑞林 LEUP、曲普瑞林 TRIP（在注射路由提供）。比卡鲁胺 BICA 已有可选 PK 子模型（§19），默认关闭。
- 它们都在 `UNMODELLED_DRUGS` 中：可以记录、排进计划，但 `runSimulation` 一开始就把它们剔除，所以不画曲线，也不计入任何浓度估计、AUC 或校准。较新版本记录的、本版本不认识的药物代码（`isKnownEster` 为假）同样按未建模处理。
- 它们的剂量按输入的数值原样保存（`getToE2Factor` 对它们返回 1.0）。
- **实际参与模拟的只有**：雌二醇各形式（E2、EB、EV、EC、EN、EU）、CPA，以及睾酮各形式（T、TC、TE、TU）。

---

## 16) 化验校准（只作用于 E2）
- **数据点**（`computeCalibrationPoints`）：只取 E2 单位的化验值（pg/mL，或 pmol/L 按 ÷ 3.671 换算）；睾酮单位（ng/dL、nmol/L）的化验值不参与。对每个化验值取同一时刻的原始模型预测 `pred`；`pred < 1 pg/mL` 或实测值 ≤ 0 的点舍弃（例如首次给药前的基线抽血），其余计算 `ratio = obs / pred`。
- **输出**：一个随时间变化的倍数 `factorFn(t)`，校准后 E2 = 模型 E2(t) × `factorFn(t)`，倍数截在 [0.01, 100]。概览页的当前 E2 估计、图表的 E2 曲线与方案试算页都乘以它。
- **方法**（`CalibrationMethod`，默认 `mipd`）：
  - `off`：不校准，倍数恒为 1。
  - `mipd`（Hybrid MIPD）：在群体先验下对个人幅度 a 与个人清除 k（均取对数）做 MAP 拟合。先验标准差：幅度 0.50、清除 0.35；单个化验的对数测量误差 0.13。参与拟合的化验少于 3 个（`MIN_LABS_FOR_CLEARANCE`）时似然用高斯，达到 3 个起用 Student-t（ν = 4）以抵抗单个离群值：只有一两个化验时无法区分离群值与真实差异，而 Student-t 会让单个化验升高时拟合的水平反而下降。用迭代重加权 Gauss-Newton 求解，每一步的步长减半直到后验不变差。稳健后验可能有多个极值，所以允许移动清除时，除原点外还从清除网格上每隔 5 个点（kMul ≈ 0.5、0.71、1、1.41、2，幅度从该清除下残差的中位数）起步分别求解，保留后验最好的解。化验少时向群体值（a = k = 0，即原模型）收缩。
  - `ekf`（扩展卡尔曼滤波）：按时间顺序逐个处理化验值，状态为 [a, k]，先验与测量误差同上，每一步只加极小的过程噪声（幅度约 1%、清除约 0.5%），相当于永久记忆；清除状态每步都截在网格范围内。报告与绘制都用后验中位数 exp(a)，不再做 Jensen 修正 a + ½·P_aa（该修正会让曲线比与模型完全吻合的化验最多高约 7%）。
  - `ou_kalman`（OU-Kalman）：只校正幅度。把对数校正量当作向 0 回归的 Ornstein-Uhlenbeck 过程（时间常数 τ = 336 h，约两周；平稳标准差 0.5），用前向卡尔曼滤波加 RTS 平滑求解。离化验时刻越远，倍数越接近 1（原模型）。
  - `bayes`（全贝叶斯，本项目自有，不在 hrt.transmtf.com 的模型之列）：对几种“你与模型如何不同”的假设做贝叶斯模型平均（Hoeting et al. 1999）。每个假设下对数校正量为 log r(t) = s + d(t) + [G(t; k) − G(t; 0)]：s 是静态个人幅度，d 是 Ornstein-Uhlenbeck 漂移，k 是个人清除（与 `mipd` 共用清除网格与可识别规则）。假设把群体幅度方差 0.50² 按比例 w 分给漂移：w = 0 即 `mipd` 的固定幅度（先验概率 1/3）；w ∈ {0.25, 0.5} 搭配记忆 τ ∈ {336 h（`OU_TAU_H`，即 `ou_kalman` 的两周）, 90 天, 365 天}，其余 2/3 平均分给这 6 个。这些份额与时间常数是结构性选择，不是拟合值，由化验通过边际似然在它们之间取舍。
    - 先验：s 用 Student-t（ν = 4，尺度 0.50·√(1−w)），相当于承认群体标准差本身不确定，所以一致的化验即使离模型很远也能把曲线拉到位，而轻微偏离仍向群体收缩；d 是平稳标准差 0.50·√w 的 OU 过程，按 `LAB_CLUSTER_H` 分簇，每簇一个锚点；k 的先验同 `mipd`。似然沿用 `mipd` 的规则：少于 3 个化验用高斯，达到 3 个起用 Student-t（ν = 4）。
    - 每个化验的对数误差为 √(0.13² + (floor / 实测值)² + (1 h × 抽血时基线曲线的对数斜率)²)，上限 2。floor 按记录的检测方法取：LC-MS/MS 2 pg/mL、免疫法 8 pg/mL、未填 5 pg/mL。这三个数是选定值，顺序依据 Rosner et al. 2013（免疫法在低浓度下准确度下降，质谱法更可靠）。低值、在曲线陡峭处抽的血与方法不明的化验因此影响更小；平台期的化验与 `mipd` 基本相同。
    - 求解：每个假设用 Gauss-Newton（IRLS 权重）求 MAP，步长减半直到后验不变差；从原点和“残差中位数按先验比例分给 s 与 d”的起点出发（允许移动清除时与 `mipd` 一样从网格上每隔 5 个点起步），保留最好的解。漂移块是三对角的（每个化验只连到自己的锚点），所以用加边三对角矩阵的 Schur 补求解，每步 O(锚点数)。Laplace 近似（Tierney & Kadane 1986）给出各假设的边际似然与后验协方差；曲线取各假设对数校正量后验均值按后验概率的加权平均，方差取混合方差。
    - 额外输出：`factorSdFn(t)` 是对数校正量的后验标准差，化验附近最小，化验变旧后增大；`latestInterval` 是最近一次化验时刻校准水平的 90% 区间。允许移动清除后，幅度与半衰期会互相抵换，只看幅度的区间反而变宽，所以报告的是化验真正约束住的水平。`discounted` 是后验平均 Student-t 权重低于 ½ 的化验数；`drift` 是无漂移、约两周、约三个月、约一年四类记忆的后验概率。
    - 预测页：选用 `bayes` 时，每次蒙特卡洛模拟仍只抽一个标准正态数（与其他方法共用同一随机序列，其他方法的范围不变），但按 `factorSdFn` 逐小时缩放，取代来自拟合误差的常数。只有一个化验时拟合误差无定义，其他方法不加校准不确定性，`bayes` 仍按后验给出范围。
  - `mcmc`（个人药代，本项目自有）：不再把一个人当成“原模型乘一个校正”，而是给每个人一套自己的药代参数，E2(t) = Σ_r exp(s + u_r) · C_r(t; k, a)（`src/domain/calibration/mcmc.ts`）。
    - C_r 是只算给药途径 r（注射、口服、舌下、凝胶、贴片）时的模型 E2。模型对剂量是线性的，所以按途径拆开再相加与原模拟完全一致（`routeCurves.ts`，测试核对到 1e-9），个人系数乘在各自那一份上是精确的，不需要额外模拟。s 是各途径共用的个人水平，u_r 是该途径相对这个水平的个人偏差（#22 的舌下吸收比例就是其中之一），k 是对数个人清除（同 `mipd` 的清除倍数），a 是对数个人吸收速度：所有一阶吸收速率（注射储库释放、口服肠道、舌下黏膜、凝胶皮肤）同乘 exp(a)，零级释放的贴片不受影响。吸收速度改变的是峰谷的位置和高低，不是平均水平。
    - 先验：s 用 `bayes` 的 Student-t（ν = 4，尺度 0.50）；u_r ~ N(0, 0.35²)，分层，只有一种途径时不采样 u（此时模型即 `mipd` 加吸收速度），两种以上时各途径的化验通过共用的 s 互相借力；k ~ N(0, 0.35²)，a ~ N(0, 0.40²)，二者都限制在网格内（kMul ∈ [0.5, 2]，吸收倍数 ∈ [0.4, 2.5]）。0.35 与 0.40 是选定值。化验至少 3 簇才允许移动清除（与其他方法相同），至少 4 簇才允许移动吸收速度（`MCMC_MIN_LABS_FOR_ABSORPTION`），因为吸收只体现在化验落在给药间隔的哪个位置。每个化验的对数误差与 `bayes` 相同（`labLogSd`），似然少于 3 个化验用高斯，达到 3 个起用 Student-t（ν = 4）。
    - 网格：在 13 × 9 个 (k, a) 网格点上算出各途径在化验时刻的浓度，采样时在浓度上做双线性插值。
    - 采样：途径之和在对数尺度上不是线性的，后验没有闭式解，所以用 4 条链的自适应 Metropolis（Haario, Saksman & Tamminen 2001）：预热 2500 步内用链自身的协方差（× 2.38²/维数）更新提议分布，并把步长朝 0.234 的接受率调（Roberts, Gelman & Gilks 1997）；预热后提议分布固定，再走 2500 步，每 5 步保留一个，共 2000 个样本。用 split R-hat（Gelman et al. 2013）检查各链是否一致，结果放在 `rHat`。随机数种子由化验数据决定，同样的化验永远给出同样的曲线。
    - 曲线：取 400 个样本，它们落到的网格点（按质量最多 16 个）上用整段时间轴算各途径曲线，后验均值是这些曲线的线性组合，所以画出的正好是样本打分时用的那个模型的平均；`factorSdFn` 用其中 150 个样本的对数校准量算标准差。`latestInterval` 是最近一次化验时刻校准水平的 5% 与 95% 分位数，`discounted` 同 `bayes`。额外输出 `absMul`（吸收速度倍数，界面显示为吸收速度变化）与 `routeScales`（两种以上途径时各途径的个人水平倍数）。
    - 局限：不建模随时间的漂移（需要漂移请用 `bayes`）；每日口服经过雌酮库平滑，吸收速度加倍只让化验变化约 10%，在化验误差之内，所以口服的吸收速度大多仍由先验决定，注射的储库释放速度则能从化验中较清楚地读出。尚未用真实的定时化验数据验证，因此不是默认方法。
- **个人清除**（仅 `mipd` 与 `ekf`）：化验至少分成 3 簇才允许移动清除（`clearanceIdentifiable`，`MIN_LABS_FOR_CLEARANCE = 3`），否则只拟合幅度。分簇按时间顺序进行：比当前簇第一个化验晚 6 h 以上（`LAB_CLUSTER_H`）的化验开启新的一簇。同一时刻的几次抽血只算一簇（它们说明不了水平下降得多快）；每 5 h 抽一次的一串化验按簇首计为多簇，例如 0、5、10、15、20 h 的五个化验是三簇（簇首为 0、10、20 h）。是否允许移动清除按化验的前缀判断：拟合前 i 个化验时只看这 i 个。清除网格覆盖 kMul ∈ [0.5, 2]（`KMUL_MIN` / `KMUL_MAX`），在对数尺度上取 21 个网格点，每个点把 `e2_kClear` 与 `e2_kClearInj` 同乘该倍数重跑一次模拟（`runSimulationWithParams`；吸收速率与口服雌酮库 `kE1Pool` 不变），拟合时在网格之间线性插值。网格外的预测值取端点值、斜率为 0，拟合出的对数清除截在网格范围内（`clampLogK`），因此报告的 kMul 始终在 [0.5, 2] 内，半衰期变化在 −50% 到 +100% 之间。校准后的曲线在相邻两个网格点的对数浓度之间按与拟合相同的方式插值（`fieldLogConcAt`），所以画出的就是拟合所用的那条曲线（此前取最近的网格点，与拟合曲线最多差约 5%，报告的 kMul 也可能超出所画曲线的范围）。报告的半衰期变化为 (1/kMul − 1) × 100%，界面显示的半衰期变化取自此值。
- **历史模式**（`CalibrationHistoryMode`，默认 `retrospective`）：
  - `retrospective`：用全部化验值重估整段历史。`mipd` 与 `ekf` 对整段曲线使用最终拟合（幅度倍数乘以“该清除下的曲线 / 原曲线”，该清除下的曲线由网格插值得到）；`ou_kalman` 使用平滑结果，两次化验之间按 OU 桥插值；`bayes` 使用对全部化验的模型平均，`mcmc` 使用对全部化验的后验样本。新化验可能改写过去的估计。
  - `forward`：因果滤波，每个时刻只用到当时为止的化验值。第一个化验之前倍数为 1；第 i 个化验之后使用前 i 个化验学到的参数（`ekf`、`mipd`、`bayes` 与 `mcmc` 都用前 i 个化验重新拟合，是否允许移动清除也只看这 i 个化验，`bayes` 的漂移从第 i 个化验向后外推；`ou_kalman` 只用前向滤波）。在之后的日期再加化验时，五种方法的过去估计都不会改变。
- **拟合误差**：至少 2 个化验值时，取实际绘制的曲线（模型 × `factorFn`）在各化验时刻的对数残差 RMSE，折算为 ±% 报告（`curveFitErrPct`），所有方法与历史模式都如此，因此与图上看到的一致。预测页的不确定范围也取自它（`bayes` 除外，见上）。
- **旧设置迁移**（`normalizeCalibrationMethod`）：存储的 `average` 映射为 `mipd`，`adaptive` 映射为 `ekf`，无法识别的值也按 `mipd` 处理。
- **年龄**：填写了出生年份时，原始模型已按年龄调整（§17），清除网格的每个点也用同一出生年份重跑，所以拟合出的个人清除 kMul 与界面显示的半衰期变化都是相对年龄调整后的模型而言；年龄相当于把个人清除先验的中心移到该年龄的平均值。
- `ekf`、`ou_kalman` 与 `mipd` 参照 hrt.transmtf.com 提供的校准模型，在本项目中针对可从化验识别的两个参数（个人幅度与个人清除）重新实现（`logic.ts` 注释）；`bayes` 与 `mcmc` 是本项目自有的方法。

---

## 17) 年龄（清除率）
- **开关**：这是 Beta 功能，默认关闭。设置 → 常规中的“年龄调整 · Beta”开关只保存在本设备上；打开后才显示“年龄”一项。关闭时出生年份仍会保留并照常同步，只是不传给模型（`useAppData` 的 `withAge`），所以再打开即可恢复。
- **输入**：设置页的“年龄”填写出生年份，可以留空。存的是出生年份而不是年龄，所以不会过时，每次给药都按给药时的年龄计算：年龄 = 给药时刻 − (出生年份 + 0.5 年)。出生年份与体重一样在两种模式间共用，随导出文件与云备份传递，同步时按最后修改时间取值（删除也会同步）；分享链接不包含它。1900 年至今年以外的值按未填写处理（`isPlausibleBirthYear`）。
- **模型**（`ageClearanceMultiplier`，在 `resolveParams` 中按事件计算）：只调整游离激素的清除速率 k₃。E2 的 `e2_kClear`、`e2_kClearInj` 与睾酮的 `t_kClear`、`t_kClearInj` 乘以
  $$
  m(\text{age})=\exp\big(-s\,(\min(75,\max(19,\text{age}))-54)\big)
  $$
  睾酮 s = ln(1821/1390)/40 ≈ 0.68%/岁，E2 s = ln(1/0.75)/52 ≈ 0.55%/岁。各路由的 AUC 都是 F·D/k₃，所以总暴露按 1/m 变化；注射的 k₃ 是 flip‑flop 下的有效值，乘以 m 同样按 1/m 改变暴露，曲线形状也略有变化。吸收速率、酯水解、口服雌酮库 `kE1Pool` 与 CPA 都不变。
- **基准 54 岁**：默认参数所依据人群的平均年龄：Aveed 试验 54.2 岁、AndroGel 1.62% 试验 53.8 岁（说明书 §14），口服戊酸雌二醇研究 54.0 岁（Zhang 2024，Table 1，口服雌酮库即取自该研究）。不填出生年份等同于 54 岁，模型与此前完全相同，`tests/` 中的文献对照也不受影响。
- **数值**（m 为清除速率的倍数，括号内为浓度的倍数 1/m）：

| 年龄 | 19 及以下 | 25 | 30 | 40 | 54 | 65 | 75 及以上 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| E2 | 1.214（0.82） | 1.174（0.85） | 1.142（0.88） | 1.081（0.93） | 1（1） | 0.941（1.06） | 0.890（1.12） |
| 睾酮 | 1.267（0.79） | 1.216（0.82） | 1.176（0.85） | 1.099（0.91） | 1（1） | 0.928（1.08） | 0.868（1.15） |

- **睾酮的依据**：Coviello 2006 在用 GnRH 激动剂抑制自身分泌后每周注射庚酸睾酮，表观清除率 19-35 岁为 1821 L/天，59-75 岁为 1390 L/天；斜率取两组年龄中点 27 与 67 岁之间的对数线性变化。Wang 2004 用稳定同位素测得中年男性自身睾酮的清除率比年轻男性低 36%，Vermeulen 1972 也报告老年男性清除率下降。Coviello 的多元回归中显著的预测因素是瘦体重、体脂比例与 SHBG，Pastuszak 2021 的十一酸睾酮群体药代模型中显著的协变量是体重与 SHBG：年龄的作用很可能经由 SHBG 与体成分体现。应用不知道 SHBG，年龄在这里只是它们的代用。
- **雌二醇的依据，以及与之不一致的数据**：Longcope 1971 测得 5 名 70-88 岁女性的 E2 清除率比年轻女性低约 25%；摘要没有给出年轻女性的年龄，斜率按 27 岁（与 Coviello 年轻组的中点相同）到 79 岁（70-88 岁的中点）计算。但同一作者 1980 年在 46-90 岁的绝经后女性中没有发现清除率与年龄相关，并认为绝经后清除率较低与当时的低 E2 水平有关；Longcope 与 Johnston 1990 年在同一批女性中观察两年（部分在此期间绝经），清除率不变；Hembree 1969 报告绝经后女性的清除率与绝经前在同一范围；Järvinen 2004 在 60 岁以下与 65 岁以上的女性之间未发现口服戊酸雌二醇药代的显著差异。跨性别人群中，Chantrapanichkul 2021 的回顾性队列发现年龄较大与较高的 E2、睾酮水平相关，但这是观察性结果，混有剂量、依从性与性腺切除等因素，没有用于定量。E2 的年龄调整按 issue #124 的讨论加入，证据弱于睾酮；有化验时，校准仍会修正个人清除（§16）。
- **范围外**：19 岁以下与 75 岁以上（睾酮研究覆盖的年龄）取端点值，不外推。

---

## 18) SHBG 与游离雌二醇（可选子模型，默认关闭）
issue #203 问的是：假定游离分数 fu 恒定，会不会让预测的游离 E2 明显偏离，尤其是长期用药、口服与换方案之后。本节按该 issue 的验收清单逐项回答。代码在 `shbg.ts`，应用里没有任何地方调用它，`runSimulation` 的默认输出、校准与图表都不变。

### 18.1 现有模型（未改动）
- **蛋白结合**：模型里没有。`runSimulation` 输出的是**总** E2，也就是化验测的量；本文档其他各节说的"游离 E2"指脱去酯基后的雌二醇（相对于酯），不是未与蛋白结合的部分。
- **SHBG**：既不是静态参数也不是动态状态，模型里根本没有它。
- **清除的口径**：总 E2。k₃ 是按总 E2 的下降拟合的（贴片移除后的回落，§1），化验校准（§16）也只看总 E2。70 kg 下 k₃·Vd = 0.41 h⁻¹ × 140 L ≈ 57 L/h ≈ 1,380 L/天，与测得的总雌二醇代谢清除率同一量级（Longcope 1971：70-88 岁女性 580 L/天/m²，年轻女性约高 25%，§17）；若是游离 E2 的清除率，还要再大 1/fu ≈ 40 倍。
- **游离分数**：没有计算。隐含地，游离 E2 = 常数 × 总 E2，即恒定的 fu。

### 18.2 结合：精确质量作用（`bindEstradiol`）
游离 E2 浓度 f（mol/L）满足

$$
E2_{\text{total}} = f + \frac{n\,[\text{SHBG}]\,K_S f}{1+K_S f} + \frac{[\text{Alb}]\,K_A f}{1+K_A f}
$$

两种结合蛋白都按可饱和处理。左边随 f 单调上升且是凹函数，所以从 f = 0 起做牛顿迭代会从下方单调收敛，不会越过根；第一步就是不饱和时的解 total/(1 + n[SHBG]K_S + [Alb]K_A)。单元测试检查质量守恒的相对残差 < 1e-12（从 0.01 pg/mL 到 1e7 pg/mL）。

| 参数 | 默认值 | 来源与说明 |
| --- | --- | --- |
| `kShbg`（K_S） | 3.14 × 10⁸ L/mol | Södergård et al. 1982，37 °C，取自游离激素计算器的转引；原文本次没有核对 |
| `kAlbumin`（K_A） | 4.21 × 10⁴ L/mol | 同上 |
| `albuminGL` | 43 g/L | 参考范围中段；白蛋白分子量取 66.5 kDa |
| `sitesPerShbg`（n） | 1 | 见下方化学计量 |

- **核对**：SHBG 50 nmol/L 时游离 2.3%、结合 SHBG 36%、结合白蛋白 62%。Dunn et al. 1981 给女性的计算值为 1.81%、37.3%、60.8%；平衡透析与超滤测得的非孕期游离分数为 1.5-2.2%（Freymann 1977：2.2 ± 0.4%）。这组常数下 SHBG 与白蛋白的分配与 Dunn 一致，游离分数偏在测量范围的上沿。
- **饱和**：1000 pg/mL 以内，fu 与痕量时相差不到 1%；20,000 pg/mL（妊娠晚期）时 SHBG 位点开始被占满，fu 比痕量时高约 16%。
- **化学计量**：SHBG 以同二聚体循环，晶体结构里两个单体各有一个结合位点（Grishkovskaya et al. 2000，EMBO J）；较早的结合实验（Moore & Bulbrook 1988）按每分子一个位点计，专利 US20060246511A1 主张每个二聚体两个位点。K_S 是按"化验报告的每个 SHBG 分子一个位点"拟合的，游离激素计算器也这样用，所以默认 n = 1。n 与 K_S 必须成对改：n = 2、K_S 减半时，不饱和区内结果与默认相同（测试检查二者相差 < 0.1%）；n = 2 而 K_S 不变，等于把 SHBG 加倍（见 §18.5 的对应两行）。
- **竞争结合**：睾酮与 DHT 和 E2 争夺同一位点，这里不计。用雌二醇的人睾酮多被抑制，它们最多占几个百分点的位点；Rinaldi et al. 2002 也报告计算绝经后女性游离 E2 时可以忽略二者。

### 18.3 SHBG 的动态（`shbgCurve`）
与 issue 的 §4.1 相同的间接效应模型（以基线归一）：

$$
\frac{dS}{dt}=k_{\text{deg}}\Bigl[S_{\text{base}}\bigl(1+E(t)\bigr)-S\Bigr],\qquad
E(t)=\frac{E_{\max,o}\,u_o+E_{\max,p}\,u_p}{1+u_o+u_p},\qquad
u_r=\Bigl(\frac{C_r(t)}{EC_{50,r}}\Bigr)^{\gamma_r}
$$

- **途径的分类**：SHBG 在肝脏合成，吞下的雌二醇先经过肝脏，所以在血中水平相同时它使 SHBG 上升得多得多。`C_o` 是吞下的那部分 E2（口服，以及舌下剂量中被吞下的部分），由 `runSimulation(..., { swallowedE2: true })` 返回的 `concPGmL_E2_swallowed` 给出；`C_p` 是其余部分（注射、贴片、凝胶、舌下经黏膜吸收的部分）。只有一种途径时，E 就是 issue 中的 Emax/Hill 式；两种途径并存时共用一个上限（如同两个激动剂作用于同一受体），E 是两个 Emax 的加权平均，不会超过较大的那个。显式的肝脏暴露室留待以后（issue 的问题 3）。
- **刺激量**：取各途径贡献的**总** E2（未经化验校准的模型值）。改用游离 E2 会形成反馈环（SHBG 升 → 游离 E2 降 → 刺激降）；而下面拟合所用的数据都是按剂量与总 E2 报告的。
- **数值解**：在模拟的时间网格上逐步精确积分（每一步内把目标值视为线性），起点是首次给药前 24 h 的基线，与水平模型从零开始一致。

| 参数 | 默认值 | 来源与说明 |
| --- | --- | --- |
| `baselineNM`（S_base） | 40 nmol/L | 成年男性（约 30-35）与女性（约 50-60）的典型值之间，因为使用者两种起点都有；有化验值时应改用化验值 |
| `halfLifeH`（ln2/k_deg） | 168 h（7 天） | Labcorp 检测说明给出的数值（issue 的二手来源）；本次没有找到人体的一手测量。按此三周可走完 88%，与 Ropponen et al. 2005 用药三周时 SHBG 已明显上升相符 |
| 口服 Emax / EC50 / γ | 3 / 75 pg/mL / 1 | 见下表 |
| 非口服 Emax / EC50 / γ | 2 / 500 pg/mL / 1 | 见下表 |

**诱导参数的拟合**：取 Transfem Science 汇编的按途径与剂量的 SHBG 变化（Aly 2020，"The Interactions of Sex Hormones with SHBG"，Table 2），对每个方案用**本模型自己**在 70 kg 下的平均水平（因为驱动子模型的就是它），在 log(SHBG 倍数) 上做最小二乘（γ 固定为 1：数据无法确定 Hill 系数），再取整：

| 方案 | 模型平均 E2（pg/mL） | 文献倍数 | 子模型倍数 |
| --- | ---: | ---: | ---: |
| 口服 E2 1 mg/天（Kuhl 1998） | 21.8 | 1.6 | 1.68 |
| 口服 E2 2 mg/天（Kuhl 1998） | 43.6 | 2.2 | 2.10 |
| 口服 E2 4 mg/天（Fåhraeus 1982、Gibney 2005、Ropponen 2005） | 87.1 | 1.9-3.2 | 2.61 |
| 口服 EV 6 mg/天（Dittrich 2005、Mueller 2005/2006） | 99.8 | 2.5-3.0 | 2.71 |
| 贴片 50 µg/天（Kuhl 2005） | 36.3 | 1.1 | 1.14 |
| 贴片 100 µg/天（Shifren 2008） | 72.6 | 1.2 | 1.25 |
| 贴片 200 / 300 µg/天（Smith 2020） | 145 / 218 | 1.5 / 1.7 | 1.45 / 1.61 |
| 贴片 600 µg/天（Bland 2005） | 436 | 2.3 | 1.93 |
| EU 100 mg/月（Derra 1981） | 598 | 2.0 | 2.09 |
| PEP 320 mg/月（Stege 1988；不建模，取报告的约 700） | 700 | 1.7 | 2.17 |

口服的拟合与 1、2 mg 的点相差不到 5%，4 mg 与 EV 6 mg 落在报告的范围内（log 尺度 RMSE 0.04）。非口服的数据离散得多（RMSE 0.11）；最小二乘最优是 Emax 1.4、EC50 262.5，但它与取整后的 2 / 500 在激素治疗的浓度范围内几乎同一条曲线（250 pg/mL 时 1.68 与 1.67 倍），数据只确定了这段曲线，确定不了 Emax 与 EC50 各自的值。两组数据没有用于拟合：妊娠晚期约 20,000 pg/mL 时 SHBG 升 5-10 倍，子模型只给约 3 倍（妊娠还有雌三醇、甲状腺等其他因素，且远在治疗范围之外）；跨性别女性注射 EV 10 mg 每 10 或 14 天并用抗雄药时升 3.2 倍（Mueller 2011、Kronawitter 2009），子模型给 1.7-1.8 倍，差距可能来自抗雄治疗本身（雄激素抑制 SHBG，压低睾酮会让 SHBG 升高），子模型不含这一效应。§18.5 用"Emax 6、EC50 2000"这组能达到妊娠水平的参数做了敏感性检查。

### 18.4 四个模拟场景
issue 正文的第 5-9 节在粘贴时丢失（正文从 §4.1 直接跳到"Report relative differences"与 §10），原来的四个场景没有保留下来。以下四个场景按 issue §1 列出的情形重建：长期用药、口服，以及加量、减量、停药与换途径。均为 70 kg、默认参数，由 `tests/shbgScenarios.test.ts` 计算（`SHBG_REPORT=1 npx vitest run tests/shbgScenarios.test.ts` 打印下面的表）。

- **1 长期口服与舌下**（26 周）：1a 口服 E2 2 mg/天；1b 口服 E2 4 mg/天；1c 舌下 E2 2 mg 每天两次（Standard 档，θ = 0.11，约 89% 被吞下）。
- **2 长期非口服**（26 周）：2a EV 5 mg 每周注射；2b 贴片 100 µg/天，每周换两次。
- **3 加量与减量**：3a 口服 E2 2 mg/天 12 周后改为 6 mg/天；3b 6 mg/天 12 周后改为 2 mg/天。
- **4 停药与换途径**：4a 口服 E2 6 mg/天 12 周后停药；4b 口服 E2 6 mg/天 12 周后改为 200 µg/天贴片（两者平均水平相近：131 与 145 pg/mL）。

每一行比较一个给药间隔内的游离 E2（稳态行取最后一个间隔；换方案的行取换后第 0、7、28 天起的一个间隔）。"相对基线"把动态 SHBG 与停留在未用药基线的 SHBG（恒定 fu）比较；"相对换前 SHBG"把它与换方案前一刻测得、之后保持不变的 SHBG 比较，后者隔离出滞后（hysteresis）本身。两种模型的总 E2 完全相同，差别只来自 fu。

| | 窗口 | SHBG / 基线 | ΔAUC | ΔCmax | ΔCmin | ΔAUC（相对换前 SHBG） | ΔCmin（相对换前 SHBG） |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1a | 稳态 | 2.09 | −25.2% | −25.2% | −25.2% |  |  |
| 1b | 稳态 | 2.60 | −33.0% | −33.0% | −33.0% |  |  |
| 1c | 稳态 | 2.56 | −32.5% | −32.4% | −32.5% |  |  |
| 2a | 稳态 | 1.64 | −16.4% | −16.2% | −16.0% |  |  |
| 2b | 稳态 | 1.25 | −7.2% | −7.2% | −7.2% |  |  |
| 3a | 第 0 天 | 2.12 | −25.6% | −25.5% | −25.2% | −0.6% | +0.0% |
| 3a | 第 7 天 | 2.49 | −31.5% | −31.4% | −31.4% | −8.5% | −8.3% |
| 3a | 第 28 天 | 2.84 | −36.2% | −36.2% | −36.1% | −14.7% | −14.7% |
| 3a | 第 83 天 | 2.89 | −36.8% | −36.8% | −36.8% | −15.5% | −15.5% |
| 3b | 第 0 天 | 2.88 | −36.6% | −36.7% | −36.4% | +0.2% | +0.7% |
| 3b | 第 7 天 | 2.51 | −31.7% | −31.8% | −32.0% | +8.0% | +7.6% |
| 3b | 第 28 天 | 2.15 | −26.1% | −26.1% | −26.1% | +16.9% | +16.9% |
| 3b | 第 83 天 | 2.09 | −25.2% | −25.2% | −25.2% | +18.3% | +18.4% |
| 4a | 第 0 天 | 2.87 | −36.6% | −36.8% | −36.0% | +0.4% | +1.2% |
| 4a | 第 7 天 | 2.01 | −23.9% | −24.6% | −22.8% | +20.4% | +22.1% |
| 4b | 第 0 天 | 2.76 | −35.2% | −36.7% | −36.8% | +2.5% | +0.0% |
| 4b | 第 7 天 | 2.13 | −25.7% | −23.8% | −27.8% | +17.5% | +14.2% |
| 4b | 第 28 天 | 1.53 | −14.1% | −13.8% | −14.5% | +35.8% | +35.3% |
| 4b | 第 77 天 | 1.45 | −12.2% | −12.2% | −12.2% | +38.9% | +38.9% |

4a 只列到第 7 天：停药两周内总 E2 已降到零。停药后 SHBG 本身按半衰期回落（第 7 天约 2.0 倍）。

### 18.5 敏感性
一次只改一个参数。每格为 ΔAUC / ΔCmin；1b、2a、2b 相对基线，4b 相对换前 SHBG。

| 改动 | 1b 稳态 | 2a 稳态 | 2b 稳态 | 4b 第 7 天 | 4b 第 28 天 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 默认 | −33.0% / −33.0% | −16.4% / −16.0% | −7.2% / −7.2% | +17.5% / +14.2% | +35.8% / +35.3% |
| SHBG 半衰期 3.5 天 | −33.0% / −33.0% | −16.4% / −15.4% | −7.2% / −7.2% | +27.7% / +23.9% | +38.7% / +38.7% |
| SHBG 半衰期 14 天 | −33.0% / −33.0% | −16.4% / −16.2% | −7.2% / −7.2% | +9.6% / +7.6% | +26.5% / +25.5% |
| 基线 SHBG 20 nmol/L | −22.5% / −22.5% | −10.4% / −10.1% | −4.4% / −4.4% | +11.5% / +9.5% | +22.5% / +22.1% |
| 基线 SHBG 80 nmol/L | −43.0% / −42.9% | −23.1% / −22.5% | −10.7% / −10.7% | +23.6% / +19.0% | +51.0% / +50.2% |
| Dunn 型常数（K_S 6.8 × 10⁸，K_A 6.0 × 10⁴） | −39.4% / −39.3% | −20.6% / −20.0% | −9.3% / −9.3% | +21.3% / +17.2% | +45.3% / +44.5% |
| 每个 SHBG 两个位点、K_S 不变 | −43.0% / −42.9% | −23.1% / −22.5% | −10.7% / −10.7% | +23.6% / +19.0% | +51.0% / +50.2% |
| 白蛋白 35 g/L | −36.0% / −36.0% | −18.3% / −17.8% | −8.2% / −8.2% | +19.3% / +15.6% | +40.1% / +39.5% |
| 诱导减半（两个 Emax × 0.5） | −19.8% / −19.7% | −8.9% / −8.7% | −3.8% / −3.8% | +10.0% / +8.3% | +19.3% / +19.0% |
| 诱导 × 1.5（两个 Emax） | −42.5% / −42.5% | −22.7% / −22.2% | −10.5% / −10.5% | +23.3% / +18.7% | +50.2% / +49.4% |
| 非口服用最小二乘最优（Emax 1.4，EC50 262.5） | −33.0% / −33.0% | −16.7% / −16.3% | −8.5% / −8.5% | +17.0% / +13.9% | +34.3% / +33.7% |
| 非口服能达到妊娠水平（Emax 6，EC50 2000） | −33.0% / −33.0% | −16.6% / −16.1% | −6.1% / −6.1% | +17.9% / +14.5% | +37.3% / +36.7% |

- 稳态结果与半衰期无关，半衰期只决定换方案后多快走到新稳态。
- 结合常数、白蛋白与基线 SHBG 改变的是 SHBG 在结合中所占的比重：比重越大，同样倍数的 SHBG 上升让 fu 降得越多。Dunn 型常数下，SHBG 40-50 nmol/L 时游离分数只有 1.4-1.5%，在测量范围的下限或更低。
- "两个位点、K_S 不变"与"基线 80"完全相同，这正是 §18.2 说的 n 与 K_S 必须成对改的原因。

### 18.6 结论（按 issue 的判定规则）
issue 的规则：若动态 SHBG 让游离 E2 的 AUC 与 Cmin 的变化都小于 10%，这些场景可以保留恒定 fu。

- **超过 10%，恒定 fu 不够**：口服（2 mg/天 −25%，4 mg/天 −33%）、舌下（−32.5%，因为大部分被吞下）、每周 EV 5 mg 注射（−16%），以及每一次换方案：即使用换方案前一刻测得的 SHBG，几周后的偏差也有 −15.5% 到 +38.9%。口服与换途径的结论在 §18.5 的每一种改动下都成立（测试检查）。
- **小于 10%**：贴片 100 µg/天（−7%）；但基线 SHBG 达到 80 nmol/L、按两个位点计或诱导 × 1.5 时会超过 10%，更高剂量的贴片也会超过。
- **仍然默认关闭**，原因：
  1. 诱导参数只拟合了汇编的组均值，还没有用 issue §10 要求的个人纵向数据（定时化验的总 E2、SHBG，最好还有透析或超滤测得的游离 E2，以及给药途径）验证；用同一组方程算出的"计算游离 E2"不能当作独立验证。
  2. 清除口径是结构性的不确定：若 E2 的清除是限制性的（与游离浓度成正比），稳态时游离 E2 不随 SHBG 变化，变的是总 E2（按 fu 比值的倒数上升）。§18.1 的清除率量级支持按总量清除，但不足以定论。两种口径并存需要把清除写成随时间变化的非线性模型，不再是现在可以逐剂量叠加的解析解，所以这次没有做。
  3. 应用里没有 SHBG 的输入。要显示游离 E2，至少需要一个基线 SHBG（化验值），界面上也要决定怎么呈现。

### 18.7 局限
- 雄激素抑制本身会让 SHBG 升高（抗雄药、GnRH 激动剂，或高剂量雌二醇压低睾酮），子模型把这一切都归于雌二醇；肥胖、胰岛素、甲状腺、肝病与年龄等 SHBG 的其他决定因素也不在其中。
- 刺激量取未校准的模型值；化验校准（§16）把整条 E2 曲线乘以一个倍数，子模型看不到。
- 口服的拟合数据混合了绝经后女性与（并用抗雄药的）跨性别女性；非口服的数据混合了绝经后女性与被雌激素去势的前列腺癌男性。
- 半衰期来自二手资料；K_S、K_A 取自转引，没有核对 Södergård 1982 原文。
- 从基线起算，等于假定首个记录的剂量之前没有用过雌二醇；只记录了最近几周的人，SHBG 起点会偏低。
- 妊娠水平的诱导被低估（§18.3）。

### 18.8 用法

```ts
import { runSimulation } from './logic';
import { freeEstradiol } from './shbg';

const sim = runSimulation(events, weightKG, birthYear, { swallowedE2: true });
const dynamic = freeEstradiol(sim!, { shbg: 'dynamic' }); // SHBG 随用药变化
const constant = freeEstradiol(sim!, { shbg: 'constant' }); // SHBG 停在基线：恒定 fu
```

参数通过 `model`（`ShbgModel`：基线、半衰期、按途径的诱导）与 `binding`（`BindingParams`：K_S、K_A、位点数、白蛋白）传入，默认值为 `DEFAULT_SHBG_MODEL` 与 `DEFAULT_BINDING`。
