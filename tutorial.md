# HRT‑Recorder Pharmacokinetic Models

This README explains the algorithms used for each drug/route, key parameters and units, what was tuned, why we tuned it, and how the implementation evolved.

---

## 0) 总览（模型架构）

**目标**：用一套轻量的、可解释的 PK 近似模型，覆盖常见雌激素制剂与给药途径，在手机端实时算出血药浓度–时间曲线与 AUC。

**核心构件（与代码一一对应）**
- **DoseEvent**：一次给药事件，带路由、时间、剂量、酯别与一些附加字段（如凝胶面积、贴片标称释放速率 µg/day）。
- **ParameterResolver**：把事件映射为具体参数 `PKParams`（k₁/k₂/k₃、F、双库或双通路比例、零阶速率等）。
- **ThreeCompartmentModel**：解析解工具箱：
  - 三室模型（首过吸收 k₁ → 酯水解 k₂ → 游离 E2 清除 k₃）的解析式。
  - 单室 Bateman 形式（口服/凝胶简化）。
  - 双通路舌下模型（快：口腔黏膜；慢：吞咽 = 口服；**E2: dualAbsAmount；EV: dualAbs3CAmount**）。
  - 贴片：零阶输入在佩戴窗口内，移除后按 k₃ 衰减；或旧版一阶“假库”。
- **SimulationEngine**：把一堆 `DoseEvent` 预编译为时间→量的函数，遍历时间点，线性叠加各事件的中心室药量，再以体分布换算为浓度，AUC 用梯形法则积分。

**单位与换算**
- 剂量 `doseMG` 以 mg 计；中心室药量计算单位也是 mg。
- 浓度输出为 pg/mL：`conc = amountMG × 1e9 / Vd_ml`。
- 体分布体积：`Vd = vdPerKG × BW`，其中 `vdPerKG` 默认 **2.0 L·kg⁻¹**（可在设置中调整）。
- **输入剂量均已按 E2 等效（E2‑eq）换算**；因此各路由的 `F` 不再乘以分子量换算因子。 `EsterInfo.toE2Factor` 仅用于显示/对照，不参与计算。

---

## 1) 公共参数（`PKparameter.swift :: CorePK`）

| 名称 | 含义 | 默认值 | 备注 |
| --- | --- | --- | --- |
| `vdPerKG` | 表观分布容积（每 kg） | 2.0 L·kg⁻¹ | 移动端可配置；用于 mg → pg/mL 换算 |
| `kClear` | 游离 E2 清除速率常数 k₃ | 0.41 h⁻¹ | 对应 t½ ≈ 1.69 h；为经验标定值，用于与项目中目标曲线贴合 |
| `kClearInjection` | 注射专用游离 E2 清除速率常数 k₃（仅 injection 路由使用） | 0.05 h⁻¹ | 保持 flip‑flop 形状以匹配 EEN/EV/EC 的 Tmax/Cmax，不等同于生理清除 |
| `depotK1Corr` | 注射两库 k₁ 的全局校正系数 | 1.0 | 改峰/拖尾时可整体缩放注射的 k₁ |

> 注：`kClear` 是游离 E2 中心室的表观清除常数，其锚点来自贴片移除后的终末半衰期（≈ 1–2 h），在此基础上取中间值 **0.41 h⁻¹** 以兼顾舌下与贴片的日内回落。它服务于本项目的简化模型与多路叠加稳定性，并不等价于群体生理清除率，不应外推到人群参数。

**关于 kClear 的来龙去脉**
- **锚点来源**：最初把 `kClear` 定在 1–2 小时的半衰期区间，是依据某些雌二醇贴片的说明书与审评资料对“移除贴片后”的血药下降描述。贴片移除时外源输入为零，后续的下降主要由系统清除主导，因此该时段的终末斜率可以近似视为清除常数 k₃ 的体现。
- **数值选择**：按 `t½ = 1–2 h` 反推 `k = ln2 / t½ ≈ 0.35–0.69 h⁻¹`，本项目选择中间值 `kClear = 0.41 h⁻¹`（`t½ ≈ 1.69 h`），既能匹配贴片移除后的回落节奏，也与舌下日内回落经验相符。
- **为什么不用口服去估**：口服 Bateman 场景下常见 flip‑flop 现象，当吸收速率 `ka` 与或小于清除速率 `ke` 时，终末相斜率反而更像 `ka` 而非 `ke`，因此不适合作为清除常数的锚点。相对地，贴片在移除后 `ka = 0`，终末相更干净。

**注射专用 `kClearInjection`（有效参数说明）**  
注射油剂的末端斜率主要受“从油性贮库进入血液”的缓慢输入所支配（flip‑flop）。为在简化一室清除的前提下复现文献级别的 EEN/EV/EC 峰时与长尾，注射路径使用了 **`kClearInjection = 0.05 h⁻¹`**。它是为**形状校准**而设的有效参数，并不等同于生理清除。  
- 仅在 `event.route == .injection` 时使用；其他路由继续使用 `kClear = 0.41 h⁻¹`。  
- 这样可在不增加额外分布/代谢池的情况下，保持注射曲线的吸收限速形状（天级 Tmax、较平稳的稳态）。  
- 若需生理可解释性更强的估计，应考虑在模型中显式加入贮库/结合/可逆代谢池而非调整清除常数。

---

## 2) 注射油剂（EV/EB/EC/EN）

### 2.1 模型与参数路径
- **模型**：两并联“库”吸收 → 酯水解 → 清除。
- “快库”控制峰时与峰高（Tmax/Cmax），“慢库”控制尾相（半衰期）。
- 解析解使用三室模型：吸收 k₁、酯水解 k₂、清除 k₃。
- **参数来源**：`TwoPartDepotPK`、`EsterPK.k2`、`InjectionPK.formationFraction`、`EsterInfo.toE2Factor`、`CorePK.kClear`、`CorePK.depotK1Corr`。
- **代码入口**：`ParameterResolver.resolve(... case .injection ...)` → `ThreeCompartmentModel.injAmount(...)`。

### 2.2 关键数值（默认）

| 酯 | Frac_fast | k1_fast (h⁻¹) | t½_fast (h) | k1_slow (h⁻¹) | t½_slow (h) | k2 (h⁻¹) | t½_hydrolysis (h) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| EB | 0.90 | 0.144 | 4.81 | 0.114 | 6.08 | 0.090 | 7.70 |
| EV | 0.40 | 0.0216 | 32.08 | 0.0138 | 50.23 | 0.070 | 9.90 |
| EC | 0.229164549 | 0.005035046 | 137.66 | 0.004510574 | 153.67 | 0.045 | 15.40 |
| EN | 0.05 | 0.0010 | 693.15 | 0.0050 | 138.63 | 0.015 | 46.21 |

*注：注射路径的清除常数采用 `k3 = kClearInjection = 0.05 h⁻¹`。*

### 2.3 生物利用度（形成分数 F）
- 形成游离 E2 的经验分数 `InjectionPK.formationFraction[ester]`。本项目剂量已按 E2‑eq 输入，**因此 `F = formationFraction`**。

**当前 `formationFraction`（预乘 `toE2Factor` 之前）**  
| 酯 | formationFraction |
| --- | ---: |
| EB | 0.1092237647 |
| EV | 0.0622582882 |
| EC | 0.117255838 |
| EN | 0.12 |
这些数值为经验标定项，用于在不同酯别间保持相对关系的同时，将单次给药的 $C_{\max}/T_{\max}$ 和稳态峰谷对齐到文献级别的量级。

- **调参缘由**：临床/社区曲线显示注射后总体暴露较口服/经皮显著更高，且不同酯别水解率不同，故在保持相对关系的同时加入了经验倍数以贴实峰值与 AUC。

### 2.4 数学形式（概念）
- 两个并联吸收库按 `Frac_fast` 和 `1 − Frac_fast` 分药量，分别以 `k1_fast` 与 `k1_slow` 进入“酯”室，水解为 E2 后以 `k₃` 清除。
- 解析解采用三指数线性组合；当速率接近时采用极限形式（避免除零）。

### 2.5 模型尝试与取舍
- 先前的“单库吸收”很难同时兼顾峰与长尾，因此改为两库模型。
- 尝试过浓度依赖的清除（早期“hill/浓度反馈”想法），在实际叠加多事件时容易引入非物理解耦与数值不稳，最终回退为常数 `k₃`。
- 保留 `depotK1Corr` 作为一键全局微调旋钮，用于不同品牌或溶剂粘度的整体系数修正。

---

## 3) 贴片（E2）

### 3.1 路由与参数
- **两种实现**：  
  1) **零阶输入**：当事件带 `extras[.releaseRateUGPerDay]` 时，按标称 µg/day 转 mg/h 注入中心室，移除后按 `k₃` 衰减。  
  2) **一阶近似（遗留）**：若未提供标称释放率，则用 `PatchPK.generic = .firstOrder(k1: 0.0075 h⁻¹)` 作为高载量贴片的近似。
- **佩戴窗口**：`patchApply` 到随后的 `patchRemove` 之间的时间跨度 `wearH`。

- **零阶**：  
  佩戴期（`0 ≤ t ≤ wearH`）：
  
  $$
  A(t) = \frac{\text{rateMGh}}{k_3} \,(1 - e^{-k_3 t})
  $$
  
  移除后（`t > wearH`）：
  
  $$
  A(t) = A(\text{wearH})\, e^{-k_3 (t - \text{wearH})}
  $$
  
- **一阶**：以 `k₁` 做“假库”吸收 + 口径 `F = 1`；移除时截断后续输入（实现上等价于减去佩戴结束后的继续吸收项）。

### 3.3 调参与选择
- 文献与说明书以 µg/day 标称，实际贴补图形更接近零阶，因此默认优先零阶，仅在缺乏数据时降级为一阶近似。

---

## 4) 经皮凝胶（E2）

### 4.1 路由与参数
- **模型**：单室一阶吸收 + 清除，`F` 为经皮可达的系统暴露分数。
- **当前实现（为稳定起见的临时版）**：  
  `TransdermalGelPK.baseK1 = 0.022 h⁻¹`（`t½ ≈ 31.5 h`）。  
  `Fmax = 0.05`，并暂时忽略涂抹面积与剂量密度，始终返回 `(k₁ = baseK1, F = Fmax)`。  
- **代码入口**：`ParameterResolver.resolve(... case .gel ...)` → `ThreeCompartmentModel.oneCompAmount(...)`。

### 4.2 先前思路与现状
- 原设计包含剂量/面积的非线性饱和项：`sigmaSat ≈ 0.008 mg·cm⁻²`，用于低剂量上调、避免高剂量过估。调试阶段出现“低剂量偏低、高剂量偏高”的系统性误差，故临时退回常量 `(k₁, F)` 以便先校准其他路由。
- 待办：恢复面积/剂量依赖，并引入皮肤贮库的短暂零阶泄放以更好描述涂抹后前数小时的平台。

---

## 5) 口服（E2/EV）

### 5.1 模型与参数
- **模型**：单室 Bateman 吸收–清除。**EV 的水解效应已折叠进更小的 `kAbsEV`，不单独建 `k₂`。**
- **默认参数**：  
  `kAbsE2 = 0.08 h⁻¹`（E2 片，`Tmax ≈ 2–3 h`）。  
  `kAbsEV = 0.05 h⁻¹`（EV 片，`Tmax ≈ 6–7 h`）。  
  `bioavailability = 0.03`（口服首过后系统暴露，E2 与 EV 近似相同量级）。  

### 5.2 调参说明
- `F = 0.03` 体现了口服首过代谢的强烈损耗；与常见文献 2–5% 的数量级一致。
- `kAbs` 调整使曲线在 2–7 小时区间达到合理峰位。

---

## 6) 舌下（E2/EV）

### 6.1 模型与参数（路线图）
- **双通路**：把剂量按分流系数 **θ** 分为两支：
  - **快通路（口腔黏膜）**：$k_{1,\text{fast}} = k_{\text{SL}}$，**绕过首过**。本项目统一按**等效 E2(E2‑eq)**输入，因此快支 **$F_{\text{fast}}=1$**。
  - **慢通路（吞咽→胃肠）**：$k_{1,\text{slow}} = k_{\text{Abs,E2/EV}}$，**进入首过**，**$F_{\text{slow}}=F_{\text{oral}}=0.03$**。
- **EV 与 E2 的差异**：
  - **舌下 E2**：无水解步（$k_2=0$），用单室 Bateman 对两支路叠加（`dualAbsAmount`）。
  - **舌下 EV**：**进血后仍需水解为 E2**（$k_2=k_{2,\text{EV}}$），两支路均走「吸收 ($k_1$) → 水解 ($k_2$) → 清除 ($k_3$)」的三室解析式（`dualAbs3CAmount`）。
  - **清除**：中心室游离 E2 的清除常数 $k_3 = 0.41\ \mathrm{h}^{-1}$（见§1），与贴片移除后回落节奏一致。

### 6.2 黏膜分流 θ 的**行为建模**（取代早期 RF 反推法）
早期文档用 $\theta=\frac{F_{\text{oral}}(RF-1)}{1-F_{\text{oral}}}$ 从相对生物利用度 RF 反推 θ。该做法只能匹配 **AUC 比例**，会误估 **峰值/达峰时间**，因此已弃用。

我们显式建模**溶解**与**吞咽清除**，把口腔当作最小可用系统：
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
  $T_{\max}=\frac{\ln(k_a/k_e)}{k_a-k_e}$，代入 $k_e=k_3=0.41\ \mathrm{h}^{-1}$ 反推 $k_a\approx 1.8\text{–}2.0\ \mathrm{h}^{-1}$。本项目取 **$k_{\text{SL}}=1.8\ \mathrm{h}^{-1}$**。
- $k_{\text{diss}}$：口腔制剂溶解/崩解的**分钟级**过程，经验半衰期选 **3/5/10 min** 三档（速崩/常规/偏慢），便于随配方微调。
- $k_{\text{sw}}$：**有效**唾液清除率（非吞咽频次），经验区间 **0.8 / 1.8 / 3.0 h⁻¹** 代表低/中/高个体差异，后续可用外部数据回归精化。

**计算实现**
- App 内对上式做**数值积分**（固定步长 Δt≈3.6 s 的 Euler），得到 $\theta(T_{\text{hold}})$。
- 为便于直观理解，我们也提供一个保守的闭式近似（作为上界/直觉，不用于核心计算）：

$$
\theta_{\text{eff}}\ \approx\ \frac{k_{\text{SL}}}{k_{\text{SL}}+k_{\text{sw}}}\Bigl(1-e^{-(k_{\text{SL}}+k_{\text{sw}})T_{\text{hold}}}\Bigr)\Bigl(1-e^{-k_{\text{diss}}T_{\text{hold}}}\Bigr)
$$

**UI 档位（不再使用 `theta_default`，用户必须选择一档）**  
采用中档场景（$k_{\text{sw}}=1.8\ \mathrm{h}^{-1}$，溶解半衰期 5 min）计算，并给出跨场景范围作参考：

| 档位 | 建议含服时长 | θ 推荐 | 典型范围（跨不同 $k_{\text{sw}}$/$k_{\text{diss}}$） |
| --- | ---: | ---: | ---: |
| Quick | ≈ 2 min | **0.01** | 0.004–0.012 |
| Casual | ≈ 5 min | **0.04** | 0.021–0.057 |
| Standard | ≈ 10 min | **0.11** | 0.064–0.156 |
| Strict | ≈ 15 min | **0.18** | 0.115–0.253 |

- UI 选择的档位直接映射为 \(\theta\) 并写入 `DoseEvent.extras[.sublingualTheta]`；**不再读取/依赖 `theta_default`**。

**一致性校验（慢支=口服）**  
当 $\theta=0$ 时，舌下模型**严格退化为口服**：慢支的 $k_{1,\text{slow}}$、$F_{\text{slow}}$、$k_2$、$k_3$ 与对应口服路由完全一致。在回归测试中对比了 “SL，$\theta=0$” 与 “Oral” 的整轨迹，差异 0。

### 6.3 数学形式（实现对照）
- **舌下 E2（无水解）**：两支路的一室 Bateman 叠加  
  $$
  A(t)=A_{\text{fast}}(t)+A_{\text{slow}}(t),\quad
  A_{\text{branch}}(t)=\frac{F\,k_1}{k_1-k_3}\,\text{Dose}_{\text{branch}}\bigl(e^{-k_3 t}-e^{-k_1 t}\bigr)
  $$
- **舌下 EV（含水解）**：两支路的三室解析叠加  
  $$
  A(t)=A^{(3C)}_{\text{fast}}(t)+A^{(3C)}_{\text{slow}}(t),\quad
  A^{(3C)}_{\text{branch}}(t)=\texttt{\_analytic3C}\bigl(t;\ \text{Dose}_{\text{branch}},F,k_1,k_{2,\text{EV}},k_3\bigr)
  $$
  其中 $\text{Dose}_{\text{fast}}=\theta\cdot\text{Dose},\ \text{Dose}_{\text{slow}}=(1-\theta)\cdot\text{Dose}$，且 $F_{\text{fast}}=1,\ F_{\text{slow}}=F_{\text{oral}}$。

---

## 7) AUC 计算与稳态
- **AUC**：在 `SimulationEngine` 中对已合成的浓度轨迹采用梯形法积分得到（单位 `pg·h/mL`）。
- **稳态**：模型为线性系统（在当前常数 `k₃` 设定下），重复给药时叠加自然收敛至稳态。注射两库与贴片零阶输入也保持线性可叠加性。
- **注意**：由于本项目对若干参数做了经验缩放使 `Cmax/Tmax` 更贴近观测，AUC 的绝对值在不同路由间比较时需谨慎，适合作为同一路由下的相对比较与个体内优化。

---

## 8) 探索历程（摘记）
以下按时间线回顾，方便未来溯源与复现。时间基于内部项目记录与代码注释。

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
  - 舌下：**废弃 RF→θ 的反推与固定 θ**；引入**行为驱动**的 θ 计算（显式建模溶解 $k_{\text{diss}}$ 与吞咽清除 $k_{\text{sw}}$），按 $T_{\text{hold}}$ 数值积分得到 \(\theta\)。
  - UI：移除 `theta_default`，改为**四档可选**（Quick/Casual/Standard/Strict），默认显示建议含服时长与推荐 θ。
  - 舌下 EV：两支路均加入水解 \(k_2\)，实现切换为 `dualAbs3CAmount`；舌下 E2 继续用 `dualAbsAmount`。
  - 一致性单元测试：验证 $\theta=0$ 时舌下与口服整轨迹重合（慢支参数与 Oral 路由完全一致）。

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

**官方说明书/监管资料**
- Climara®（Bayer）说明书：移除贴片后约 12 h 回落至基线，表观半衰期约 4 h（FDA 标签）<https://www.accessdata.fda.gov/drugsatfda_docs/label/2001/20375s16lbl.pdf>
- FDA NDA 临床药理综述与产品手册：透皮相对口服的生物利用度、部位差异、周内曲线稳定性等（多份，示例）  
  <https://www.accessdata.fda.gov/drugsatfda_docs/nda/99/020994_clinphrmr.pdf>  
  <https://www.accessdata.fda.gov/drugsatfda_docs/label/2008/020375s026lbl.pdf>

**期刊/综述（示例）**
- Ginsburg ES et al. Half-life of estradiol in postmenopausal women. Fertil Steril. 1998：贴片移除后终末半衰期约 161 min（107–221 min）。<https://pubmed.ncbi.nlm.nih.gov/9473164/>
- Kuhl H. Pharmacology of estrogens and progestogens: influence of different routes of administration. *Climacteric*. 2005. <https://pubmed.ncbi.nlm.nih.gov/16112947/>
- Oinonen et al. Absorption and bioavailability of oestradiol from a gel, a patch and a tablet. *Eur J Pharm Biopharm*. 1999. <https://pubmed.ncbi.nlm.nih.gov/10465378/>
- 比较矩阵与储库型贴片的生物利用度与速率差异的研究（如 Menorest® vs Estraderm®）。

**百科与药学数据库**
- Wikipedia: Pharmacokinetics of estradiol（路由差异、凝胶 36 h 表观半衰期等聚合条目）<https://en.wikipedia.org/wiki/Pharmacokinetics_of_estradiol>
- DrugBank: Estradiol（透皮生物利用度对比口服、部位差异）<https://go.drugbank.com/drugs/DB00783>

> 说明：实现中还参考了多份品牌说明书与审评文档、二级综述与数据手册，此处不一一列举。

---

## 10) 局限
- 个体差异未建模：肝功能、SHBG、年龄、体脂、并用药等可能改变 `F` 与各速率常数。
- 凝胶的面积/负荷非线性：当前未在模型中体现；存在低剂量低估与高剂量高估的潜在风险。
- 注射溶剂/体积影响：对扩散 `k₁` 的影响尚未显式参数化，现仅可用全局系数 `depotK1Corr` 近似。
- 口服/舌下仅建模游离 E2：雌酮及其硫酸酯的储库效应未纳入。
- AUC 的跨路由可比性有限：参数含经验缩放，AUC 适合于相同路由内的相对比较与个体内优化。

---

## 11) 快速对照：各路由实现要点

| 路由 | 解析/数值 | 输入 | 模型 | 关键参数 | F 的来源 |
| --- | --- | --- | --- | --- | --- |
| 注射（油剂 EB/EV/EC/EN） | 解析 | mg | 两库吸收 + k₂ 水解 + k₃ 清除 | `Frac_fast, k1_fast, k1_slow, k2, k3 (= kClearInjection)` | `formationFraction` |
| 贴片（零阶） | 解析 | µg/day → mg/h | 零阶恒速输入 + k₃ 清除；移除后指数衰减 | `rateMGh, k3` | 固定 1.0 |
| 贴片（一阶遗留） | 解析 | mg | 一阶“假库” + k₃ 清除；移除时截断 | `k1, k3` | 固定 1.0 |
| 凝胶 | 解析 | mg（+面积 cm²） | 单室 Bateman（临时常量版） | `k1 = 0.022, F = 0.05, k3` | 常量 0.05 |
| 口服 E2 | 解析 | mg | 单室 Bateman | `kAbsE2 = 0.08, F = 0.03, k3` | 常量 0.03 |
| 口服 EV | 解析 | mg | 单室 Bateman | `kAbsEV = 0.05, F = 0.03, k3` | 常量 0.03 |
| 舌下 E2/EV | 解析 | mg（等效 E2） | 双通路：快 = 黏膜、慢 = 吞咽→口服；**E2 用一室（dualAbsAmount），EV 用三室（dualAbs3CAmount）** | `θ` 来自 UI 档位（Quick/5/10/15 分钟映射）；`kAbsSL=1.8`，`kAbsE2/EV`，`k2(EV)`，`k3` | 快 1.0；慢 `F_oral=0.03` |

---

## 12) 实现细节摘抄
- **PrecomputedEventModel**：
  - 注射：`injAmount(tau, dose, p)`
  - 凝胶/口服：`oneCompAmount(tau, dose, p)`（把 `k1_fast` 视作该路由的 `ka`）
  - 舌下：`dualAbsAmount(tau, dose, p)`（`Frac_fast = θ`，`F_fast` 与 `F_slow` 可分配）
- **贴片**：
  - 找到紧随的 `patchRemove` 决定 `wearH`。
  - 零阶：佩戴内 `rateMGh/k3 × (1 − e^{−k3 t})`；移除后按 `e^{−k3 Δt}` 衰减。
  - 一阶：用 `oneCompAmount` 计算佩戴内吸收；移除后把“如果继续吸收”的部分减掉，使吸收在 `wearH` 处截断。
- **SimulationEngine**：
  - 时间网格均匀划分，逐点累加各事件药量 → 换算 pg/mL。
  - **AUC**：梯形法累计。