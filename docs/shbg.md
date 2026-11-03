# SHBG and free estradiol (optional model)

Status: opt-in post-processing model. `logic.ts` default simulation output is
unchanged. `runSimulation()` gains an optional `swallowedE2` flag (default
`false`) used only by this model. Nothing in the UI enables it. Callers use
`freeEstradiol()` explicitly with `{ shbg: 'constant' | 'dynamic' }`. The
validation harness is in `tests/shbgScenarios.test.ts`.

## 1. What the existing model does

`SimulationResult` exposes total estradiol (`concPGmL_E2`), CPA, total
testosterone, and the E2 AUC. `runSimulation()` accumulates the central
amount and converts it with `Vd = 2.0 L/kg`:

$$
C_{\mathrm{E2,total}}(t) = \frac{A_{\mathrm{central}}(t)}{V_d}.
$$

There is no SHBG, albumin, free fraction, or protein-binding calculation in
the default output. `e2_kClear` is an apparent first-order elimination
constant applied to the whole central amount. The model therefore implies a
constant free fraction; the new layer below makes that assumption explicit
and, optionally, dynamic.

## 2. Model

### 2.1 Equilibrium binding

Free and bound estradiol from total E2 and SHBG, both binders saturable:

$$
C_{\mathrm{total}}
= f + \frac{n\,[\mathrm{SHBG}]\,K_S\,f}{1 + K_S\,f}
+ \frac{[\mathrm{Alb}]\,K_A\,f}{1 + K_A\,f}.
$$

Solved by Newton iteration from $f = 0$ (mass balance to $< 10^{-12}$ relative
over 0.01–$10^7$ pg/mL). Defaults: $K_S = 3.14 \times 10^8\ \mathrm{L/mol}$,
$K_A = 4.21 \times 10^4\ \mathrm{L/mol}$, albumin 43 g/L, one site per SHBG
dimer (configurable; $n$ and $K_S$ must be changed together).

At 50 nmol/L SHBG this gives about 2.3% free, 36% SHBG-bound and 62%
albumin-bound E2, consistent with Dunn et al. 1981 (1.81% / 37.3% / 60.8%).

### 2.2 SHBG turnover

$$
\frac{dS}{dt}
= k_{\mathrm{deg}}\bigl[S_{\mathrm{base}}(1+E(t))-S\bigr],
\qquad
E(t)
= \frac{E_{\max,o}\,u_o + E_{\max,p}\,u_p}{1+u_o+u_p},
\qquad
u_r = \left(\frac{C_r(t)}{EC_{50,r}}\right)^{\gamma_r}.
$$

$C_o$ is swallowed E2 (oral plus the swallowed share of sublingual doses);
$C_p$ is the parenteral share. Defaults: baseline 40 nmol/L, half-life 7 days,
oral induction 3 / 75 pg/mL / 1, parenteral induction 2 / 500 pg/mL / 1.
Induction parameters were fitted to the route/dose table in Transfeminine
Science (Aly 2020); see `Algorithm Explanation.md` §18.3.

### 2.3 API

- `bindEstradiol(totalPgML, shbgNM, params?)` → `{ freePgML, fractionFree, fractionShbg, fractionAlbumin }`.
- `shbgCurve(sim, model?)` → SHBG nmol/L on the simulation grid; requires
  `runSimulation(events, weight, birthYear, { swallowedE2: true })`.
- `freeEstradiol(sim, { shbg: 'constant' | 'dynamic', model?, binding? })`
  → `{ shbgNM, freePgML, fractionFree }`.
- `exposureOver(timeH, values, fromH, toH)` → `{ auc, cmax, cmin }`.

## 3. Scenarios

`tests/shbgScenarios.test.ts` defines nine scenarios (26-week oral 2/4 mg,
sublingual, EV weekly, patch, dose escalation/reduction, discontinuation,
route switch) and evaluates AUC/Cmax/Cmin changes with SHBG held at baseline
vs. dynamic, plus a "vs. measured" comparison that isolates hysteresis.
Run with `SHBG_REPORT=1 npx vitest run tests/shbgScenarios.test.ts` to print
the tables reproduced in `Algorithm Explanation.md` §18.4–18.5.

Headline: chronic oral E2 lowers free-E2 AUC by about 25–37% relative to a
constant free fraction, weekly EV 5 mg by about 16% and a 100 µg/day patch by
about 7%, so by the issue's 10% rule only the patch can keep a constant free
fraction. Changes of regimen fail the rule as well: even against SHBG measured
just before the change, free-E2 AUC differs by −15.5% to +38.9% once SHBG
settles at its new level. The effect is strongly route- and dose-dependent.

## 4. Sensitivity

One-at-a-time variations over SHBG half-life, baseline SHBG, binding
constants, stoichiometry, albumin, and induction strength are reported in
`Algorithm Explanation.md` §18.5. The SHBG half-life changes no steady state,
but it sets how fast free E2 moves after a change of regimen: 7 days after a
switch from oral 6 mg/day to a 200 µg/day patch, free-E2 AUC is 9.6% above
the value with SHBG held at its pre-switch level for a 14-day half-life, 17.5%
for the default 7 days and 27.7% for 3.5 days. Baseline SHBG and binding
constants dominate the baseline free fraction.

## 5. Limitations

- No testosterone/DHT competition for SHBG; no CBG.
- No explicit hepatic compartment; route-specific plasma E2 is the induction
  proxy.
- Induction parameters are fitted to a literature table, not individual data.
- Baseline SHBG is a fixed user value; no age/BMI/insulin/thyroid/androgen
  covariates.
- Clearance remains total-E2 based; free E2 does not feed back into PK.
- Calculated free E2 is not independent validation; equilibrium dialysis or
  ultrafiltration is required.

## 6. Sources

- Södergård R et al. _Calculation of free and bound fractions of testosterone
  and estradiol-17β to human plasma proteins at body temperature._ J Steroid
  Biochem. 1982;16:801–810. doi:10.1016/0022-4731(82)90038-3.
- Dunn JF et al. _Transport of steroid hormones: binding of 21 endogenous
  steroids to both testosterone-binding globulin and corticosteroid-binding
  globulin in human plasma._ J Clin Endocrinol Metab. 1981;53:58–68.
- Ropponen A et al. _Effects of oral and transdermal estradiol
  administration on levels of sex hormone-binding globulin..._ J Clin
  Endocrinol Metab. 2005;90:3431–3434. doi:10.1210/jc.2005-0352.
- Transfeminine Science, _The Interactions of Sex Hormones with
  Sex Hormone-Binding Globulin_ (secondary source for the induction table).
- Issue #203 for the model specification and acceptance criteria.
