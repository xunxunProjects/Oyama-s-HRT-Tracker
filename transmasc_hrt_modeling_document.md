# 跨性别男性 HRT 数学建模文档

**主题**：以 **testosterone-based GAHT** 为核心的 **PK/PD/监测/风险** 联合模型

**版本**：v1.0  |  **日期**：2026-04-17

**用途边界**：研究、教学、算法原型、队列仿真。**不用于** 个体化处方、剂量决策、停药决策或替代临床评估。

## 摘要

本文档给出一个可计算、可校准、可扩展的跨性别男性 **HRT** 数学建模框架。核心思想是把 **给药方案 → 体内暴露 → 蛋白结合 → 内源轴抑制 → 临床端点** 拆成分层子模型，并用统一的时间轴与观测模型连接。主端点包含 **总睾酮**、**游离睾酮**、**SHBG**、**Hb/Hct**、**闭经概率**、体组成慢变量，以及可选的 **E2**、脂质与肌酐解释模块。模型同时支持个体数字孪生和人群层级 **NLME / Bayesian** 拟合。

文档优先保证三件事：**可解释性**、**可识别性**、**可落地采样**。因此，所有状态变量都绑定到现实监测时点，所有参数都标注其估计难度，所有二级端点都说明证据强弱与误差来源。

## 1. 建模目标

- 输入：**制剂类型**、**给药途径**、**给药时间戳**、**剂量历史**、**体重/BMI**、**SHBG**、**Alb**、基线 **Hb/Hct**、吸烟状态、是否持续月经、可选 **LH/FSH/E2**。
- 输出：任意时点的 **C_T**、**C_F**、**HPG 抑制程度**、**Hct** 风险轨迹、**闭经概率**、体组成潜变量、化验解释标记。
- 场景：单人纵向监测、不同给药策略对比、依从性缺失情景、队列级长期风险仿真。
- 不输出：个体最优剂量、绝对化安全结论、闭经即无排卵的推断。

## 2. 证据约束与设计边界

- **WPATH SOC8** 与 **Endocrine Society** 都要求将性激素维持在与确认性别一致的生理范围，并在起始期做更密集监测 [R1][R2][R7]。
- **UCSF** 页面给出常见 **testosterone cypionate/enanthate** 与经皮制剂的输入空间，并强调注射剂需要结合峰值/谷值或中点解释 [R3]。
- **testosterone cypionate** 官方标签指出：油剂肌注后缓慢吸收，血浆中约 **98%** 蛋白结合，约 **2%** 游离，终末半衰期约 **8 d** [R4]。
- **AndroGel 1.62%** 标签指出：经皮制剂按晨间给药前浓度滴定；停药后约 **48–72 h** 回落到近基线 [R5]。
- 实验室监测新综述提示：在稳定 **GAHT** 后，**Hb/Hct**、肌酐等应切换到与确认性别一致的参考区间解释 [R6]。
- 大队列研究显示：**erythrocytosis** 主要在首年上升最快，但长期暴露后累积概率继续增加，故 **Hct** 子模型必须显式建模时间滞后 [R8]。
- 长期 MRI 队列显示：跨性别男性在数年尺度上可见肌肉量增加与腹部脂肪增加并存，因此 **体组成** 必须是慢变量模块，不能混入短期 **PK** 残差 [R9]。

## 3. 变量与符号

| 符号 | 含义 | 单位 | 说明 |
|---|---|---|---|
| **A_dep** | 注射/皮下油剂库中待吸收药量 | mg 或归一化单位 | 注射制剂 |
| **A_skin** | 皮肤表面/角质层可吸收药量 | mg 或归一化单位 | 凝胶/贴剂 |
| **A_c** | 中央室药量 | mg | 系统暴露 |
| **C_T** | 总睾酮浓度 | ng/dL 或 nmol/L | 主要观测量 |
| **C_F** | 游离睾酮浓度 | ng/dL 或 pmol/L | 由 **SHBG**/**Alb** 计算 |
| **C_E2** | 雌二醇浓度或代理量 | pg/mL | 可选观测量 |
| **R_HPG** | **HPG** 轴相对活性 | 0–1 | 内源性分泌抑制状态 |
| **S** | **SHBG** 水平 | nmol/L | 影响游离分数 |
| **Hct** | 红细胞压积 | % 或 L/L | 安全性核心端点 |
| **M** | 肌肉量潜变量 | 相对值 | 慢变量 |
| **F_visc** | 腹部/内脏脂肪潜变量 | 相对值 | 慢变量 |
| **P_am(t)** | 闭经概率 | 0–1 | 二分类/时间事件端点 |

## 4. 总体架构

- **第 1 层：输入层** —— 记录每次注射、凝胶/贴剂应用、漏服、换路由。
- **第 2 层：PK 层** —— 把给药历史转成 **C_T(t)**。
- **第 3 层：结合层** —— 用 **SHBG** 与 **Alb** 把 **C_T** 转成 **C_F** 与 **bioavailable T**。
- **第 4 层：调控层** —— 用 **HPG** 轴抑制连接外源暴露与内源分泌。
- **第 5 层：PD 层** —— 连接 **C_F / C_avg / AUC** 与闭经、**Hct**、体组成等临床端点。
- **第 6 层：观测层** —— 处理不同平台、不同采样时点和不同误差结构。

## 5. 核心 PK 模型

### 5.1 注射型 testosterone esters

```text
dA_dep/dt = -k_a,inj * A_dep + Σ D_k * δ(t - t_k)
dA_c/dt   = F_inj * k_a,inj * A_dep - (CL / V) * A_c
C_T(t)    = A_c / V
```

这是最小可用模型。对 **cypionate / enanthate**，若只有稀疏中点或谷值数据，用单库 + 油剂库模型已经能覆盖大部分工程场景。对 **undecanoate**，建议改为 **transit compartments** 或双吸收速率模型，以避免把长尾误差错误地吸收到 **CL** 中。

```text
dA_0/dt = -k_tr * A_0 + Σ D_k * δ(t - t_k)
dA_j/dt = k_tr * (A_{j-1} - A_j), j = 1..n
dA_c/dt = F * k_tr * A_n - (CL/V) * A_c
```

若只拿到例行门诊化验而没有密集血样，建议把 **F**, **k_a**, **CL** 做层级先验约束；否则三者在注射制剂上经常不可分。

### 5.2 经皮制剂

```text
dA_skin/dt = -k_a,gel * A_skin + Σ D_d * pulse_d(t)
dA_c/dt    = F_gel * k_a,gel * A_skin - (CL / V) * A_c
```

经皮制剂需要显式表示 **daily dosing** 与短时间吸收窗。校准时应满足两条边界：

- 连续使用至少 **1 周** 后再解释稳态化验值 [R5][R7]。
- 停药后 **48–72 h** 内接近基线 [R5]。

### 5.3 内源轴抑制

```text
dR_HPG/dt = k_in,R * (1 - Imax_R * C_F / (IC50_R + C_F)) - k_out,R * R_HPG
T_endogenous(t) = T_base * R_HPG
```

该层的目的不是复刻完整生殖内分泌，而是为三个临床现象提供统一解释：**E2** 下降、月经抑制、停药/漏药后的部分反弹。没有 **LH/FSH** 时，**R_HPG** 只能作为潜变量。

## 6. 结合与活性分数

```text
C_T = C_F + K_Alb * Alb * C_F + (K_SHBG * SHBG * C_F) / (1 + K_SHBG * C_F)
C_bio = C_F + K_Alb * Alb * C_F
```

若监测数据较全，可使用 **Vermeulen** 思路从 **total T + SHBG + Alb** 计算 **free/bioavailable T**。在 routine care 场景中，优先把 **total T** 作为直接观测，**free T** 作为派生变量 [R3][R7]。

推荐再加一个 **SHBG** 动态方程：

```text
dS/dt = k_in,S * (1 - Imax_S * C_F / (IC50_S + C_F)) - k_out,S * S
```

原因：同一个 **total T** 在不同 **SHBG** 水平下可对应完全不同的 **free T**，这会直接影响闭经速度、主观症状与 **Hct** 反应。

## 7. E2 与 DHT 的可选代理模块

```text
C_E2(t) = E2_ovary,base * R_HPG(t) + α_arom * C_F(t)
C_DHT(t) = α_5α * C_F(t)
```

对跨性别男性，**E2** 的净变化同时受两股相反机制控制：一方面卵巢轴被抑制，另一方面外源睾酮可芳香化。故 **E2** 建议作为“条件启用”的二级模块，仅在持续出血、盆腔症状或研究场景下拟合。

## 8. PD 子模型

### 8.1 闭经 / 持续出血

```text
h_am(t) = h_0 + h_T * sigmoid(C_avg,30d - θ_T) + h_E * sigmoid(θ_E - C_E2)
P_am(t) = 1 - exp(-∫ h_am(s) ds)
```

建议把闭经建成 **time-to-event**，而不是单次逻辑回归。原因：它有明显时间滞后、对依从性极敏感，而且不同制剂的峰谷结构不同。

关键约束：**闭经 ≠ 必然无排卵**。如果模型用于生育风险或避孕研究，必须把“排卵活动”作为独立潜变量，不得从 **P_am** 直接推断。

### 8.2 Hb/Hct 安全性模型

```text
dHct/dt = k_in,H * (1 + Emax_H * C_F / (EC50_H + C_F)) - k_out,H * Hct
```

这是最重要的安全性模块。**androgens stimulate erythropoiesis**，且 **Hct** 的变化较血药浓度慢，必须使用间接反应或周转模型而不是同日线性回归。

可加协变量：

- **BMI**
- 吸烟
- 肺部疾病 / 睡眠呼吸障碍
- 给药路由
- 持续月经状态

若需要阈值事件风险，可再定义：

```text
Risk_ery(t) = I(Hct > 0.50)  或  logistic(β0 + β1 * Hct + β2 * dHct/dt + β3 * covariates)
```

### 8.3 体组成慢变量

```text
dM/dt      = k_gain,M * E(C_avg,90d) - k_loss,M * M
dF_visc/dt = k_gain,F * E(C_avg,90d) - k_turn,F * F_visc
```

体组成不应直接由单次血药浓度驱动，建议由 **90 d rolling average** 或 **AUC** 驱动。长期研究提示肌肉量增加与腹部脂肪增加可同时发生 [R9]，因此必须分别建模。

### 8.4 脂质与肝脂

```text
dLDL/dt = k_in,LDL * (1 + β_LDL * E(C_avg,180d)) - k_out,LDL * LDL
dHDL/dt = k_in,HDL * (1 - β_HDL * E(C_avg,180d)) - k_out,HDL * HDL
```

这是可选模块。**WPATH SOC8** 与 **Endocrine Society** 在是否常规监测脂质/代谢风险上并不完全一致 [R7]。工程实现上应将其放在“可插拔”层，而不是强制主模型的一部分。

### 8.5 体征/男性化综合指数

```text
V_i(t) = Vmax_i * (1 - exp(-k_i * AUC_eff(t)))
```

把声音变化、体毛、肌力、脂肪分布拆成多条并行慢方程，远优于单个“男性化分数”。其中声音与面部毛发具有更强不可逆性，参数先验也应与可逆端点分离。

## 9. 观测模型与化验平台

```text
y_T,ij   ~ Normal(C_T(t_ij), σ_T,platform^2)
y_Hct,ij ~ Normal(Hct(t_ij), σ_Hct^2)
z_am,im  ~ Bernoulli(P_am(t_im))
```

免疫法与 **LC-MS/MS** 不能简单混合成单一误差项。推荐做法：按平台设置不同 **σ_assay**，必要时加系统偏差 **b_platform**。现有证据表明 routine monitoring 多数情形下免疫法可用，但当临床表现与化验明显不一致时，应升级到 **LC-MS/MS** [R7]。

| 观测项 | 建议采样时点 | 建模备注 |
|---|---|---|
| **注射 enanthate/cypionate** | 两次给药中点；有波动症状时补充峰/谷值 | 峰值常取注射后 **24–48 h**；谷值取下次给药前 [R3][R7] |
| **注射 undecanoate** | 下次注射前 | 用于评估尾部暴露与不足暴露 [R7] |
| **经皮凝胶/贴剂** | 连续每日使用至少 **1 周** 后；给药后至少 **2 h** | 停药后通常 **48–72 h** 近基线 [R5][R7] |
| **Hb/Hct** | 基线、初始滴定期、稳定后年度或半年度 | **Hct** 是关键安全端点 [R3][R6][R8] |
| **SHBG / Alb** | 复杂病例按需 | 用于计算 **free/bioavailable T** [R3][R7] |

## 10. 人群层级与个体化参数

```text
CL_i = CL_pop * (WT_i / 70)^0.75 * exp(η_CL,i)
V_i  = V_pop  * (WT_i / 70)^1.00 * exp(η_V,i)
θ_i  = θ_pop * exp(η_i),   η_i ~ Normal(0, Ω)
```

推荐以 **hierarchical Bayesian** 或 **NLME** 表达个体差异。这样能同时处理：

- 稀疏采样
- 多制剂混合队列
- 依从性不完整
- 长周期安全性端点
- 实验室平台差异

对单个个体的数字孪生，可把群体后验当作先验，再用本人时间序列逐步更新。

## 11. 参数先验与可识别性

| 参数 | 物理意义 | 先验建议 | 识别风险 |
|---|---|---|---|
| **CL**, **V** | 清除与分布 | 可对体重做异速缩放 | 稀疏数据下与 **F**、**k_a** 易混叠 |
| **k_a,inj** | 油剂吸收速率 | 由序列血样拟合 | 与终末半衰期共同决定峰谷 |
| **λ_z,cyp** | cypionate 有效终末斜率 | 以 **t1/2≈8 d** 为锚点 [R4] | 可作为先验中心 |
| **k_a,gel** | 经皮吸收速率 | 用日内采样或稳态点拟合 | 需满足停药 **48–72 h** 回落特征 [R5] |
| **K_SHBG**, **K_Alb** | 结合常数 | 文献先验 + 本地化校准 | 优先固定或弱更新 |
| **Imax_HPG**, **IC50_HPG** | 内源轴抑制 | 可结合 **LH/FSH** 估计 | 无 **LH/FSH** 时需强先验 |
| **Emax_Hct**, **EC50_Hct** | **Hct** 反应强度 | 来自纵向安全性数据 | 受吸烟、BMI、肺病影响 [R8] |
| **k_M**, **k_F** | 体组成慢变量速率 | 以月/年为尺度 | 必须做长期数据外部验证 [R9] |
| **σ_assay** | 测定误差 | 按平台分层 | 免疫法与 **LC-MS/MS** 误差结构不同 [R7] |

三类最常见不可识别问题：

- **F – k_a – CL**：只看谷值或中点，三者高度耦合。
- **SHBG** 变化与 **free T** 症状：若没有 **Alb/SHBG**，容易把结合差异误判成依从性差。
- **Hct** 上升速度与长期平均暴露：如果给药时间戳缺失，模型会把漏药与慢反应混为一体。

## 12. 数据需求与表结构

最小可用数据集：

- 基线：**total T**, **SHBG**, **Alb**, **Hb/Hct**, 肌酐、体重、BMI、吸烟、月经状态。
- 给药日志：每次注射时间、剂量、路由；每日凝胶/贴剂是否漏用。
- 随访：化验时间戳相对给药时差、症状、是否持续出血。
- 可选：**E2**, **LH/FSH**, **LC-MS/MS**、影像体组成、血压、脂质。

```text
patient_id, visit_time, formulation, route, dose, dose_time,
lab_time, total_T, SHBG, albumin, Hb, Hct, E2, LH, FSH,
weight, BMI, smoker, menses_status, bleeding_days,
assay_platform, adherence_flag
```

若路由会切换，必须保留完整给药历史；不能只保存“当前方案”。

## 13. 拟合流程

1. 先用 **PK** 拟合 **total T**。
2. 再在固定或半固定 **PK** 下拟合 **SHBG / free T** 层。
3. 再拟合 **Hct** 与闭经子模型。
4. 长期队列够大时，最后做联合模型以传播不确定性。

优化目标可采用分层后验：

```text
log p(Θ | y) = Σ_i log p(y_i | θ_i) + Σ_i log p(θ_i | θ_pop, Ω) + log p(θ_pop, Ω)
```

若闭经端点样本较少，建议把闭经子模型做成弱耦合层，避免其反向破坏 **PK** 参数。

## 14. 验证与敏感性分析

| 模块 | 验证指标 |
|---|---|
| **PK** | 观测-预测散点、残差图、**VPC**、峰谷覆盖率 |
| **闭经** | 校准曲线、时间到事件 **Brier score**、分层 **AUC** |
| **Hct** | 偏差、覆盖率、阈值事件召回率 |
| **体组成** | 长期趋势误差、路由分层外推误差 |
| **鲁棒性** | Sobol/Morris 全局敏感性；对 **adherence** 缺失进行情景分析 |

敏感性分析最少应覆盖：**k_a,inj**、**CL**、**SHBG baseline**、依从性、采样时点偏差、吸烟、BMI。

## 15. 场景模拟建议

- 同样周总量下，**每周注射** vs **每两周注射** 的峰谷差。
- 经皮制剂在漏用 1–3 天时的暴露回落速度。
- 高 **SHBG** 个体在相同 **total T** 下的 **free T** 差异。
- 吸烟 + 高 BMI 条件下 **Hct** 风险上移。
- 换路由时的过渡期：注射尾部 + 凝胶稳态建立重叠。

图 1 和图 2 仅展示模型形状，不表示真实个体剂量或临床阈值。

![图1](transmasc_hrt_assets/fig_pk.png)

![图2](transmasc_hrt_assets/fig_hct.png)

## 16. 伪代码

```text
for t in timeline:
    update_dose_inputs(t)
    solve_PK_states()              # A_dep / A_skin / A_c
    compute_total_T()              # C_T
    compute_free_T()               # C_F from total T + SHBG + Alb
    update_HPG_axis()              # R_HPG
    update_PD_Hct()                # Hct
    update_PD_amenorrhea()         # P_am
    update_PD_body_comp()          # M, F_visc
    emit_observation_model()       # lab values and event probabilities
```

## 17. 实施建议

- 原型阶段：**Python + PyMC / Stan / Torsten / nlmixr2**。
- 实时监测：将 **ODE solver** 与事件时间戳数据库分离。
- 生产部署：所有结论输出必须附带不确定区间与采样时点说明。
- 化验接口：记录 **assay platform**，否则跨平台漂移无法校正。

## 18. 局限性

- 跨性别男性特异 **PK** 数据仍少于传统 **TRT** 文献。
- 许多目标区间基于专家共识，不是严格因果最优区间。
- 声音、体毛、脂肪分布受遗传与年龄影响很大，不能仅靠激素暴露解释。
- **闭经** 不是排卵停止的充分条件。
- 免疫法、**LC-MS/MS**、抽血时点差异都会显著影响拟合。

## 19. 参考文献

[R1] Coleman E, Radix AE, Bouman WP, et al. Standards of Care for the Health of Transgender and Gender Diverse People, Version 8. International Journal of Transgender Health. 2022.

[R2] Hembree WC, Cohen-Kettenis PT, Gooren L, et al. Endocrine Treatment of Gender-Dysphoric/Gender-Incongruent Persons: An Endocrine Society Clinical Practice Guideline. J Clin Endocrinol Metab. 2017.

[R3] UCSF Gender Affirming Health Program. Overview of masculinizing hormone therapy. 当前公开页面提供给药形式、监测节律、峰谷值解释与 **Hct** 解释框架。

[R4] Pfizer labeling. Depo-Testosterone. Testosterone cypionate 注射剂药代：油剂缓释、约 **98%** 蛋白结合、约 **2%** 游离、有效半衰期约 **8 d**。

[R5] FDA. AndroGel 1.62% prescribing information. 经皮制剂滴定依据晨间给药前浓度；停药后约 **48–72 h** 回到近基线。

[R6] Nolan BJ, Cheung AS. Laboratory Monitoring in Transgender and Gender-Diverse Individuals. Clinical Chemistry. 2025. 讨论 **Hb/Hct**、肌酐与性别化参考区间迁移。

[R7] Pouw N, van der Linden J, Teuben S, et al. Clinically Relevant Laboratory Monitoring of Gender-Affirming Hormone Therapy in Transgender People—Experiences from a Teaching Hospital in the Netherlands. J Appl Lab Med. 2024. 总结 **WPATH SOC8** 与 **Endocrine Society** 监测差异，并讨论免疫法与 **LC-MS/MS**。

[R8] Madsen MC, van Dijk D, Wiepjes CM, et al. Erythrocytosis in a Large Cohort of Trans Men Using Testosterone. J Clin Endocrinol Metab. 2021. 提供 **Hct** 风险与长期暴露数据。

[R9] Lundberg TR, Tryfonos A, Eriksson LMJ, et al. Longitudinal changes in regional fat and muscle composition and cardiometabolic biomarkers over 5 years of hormone therapy in transgender individuals. Journal of Internal Medicine. 2024.
