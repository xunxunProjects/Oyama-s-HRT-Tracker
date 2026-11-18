# Age Model Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the adult-only `<19 → 19` age clamp with explicit age bands and a provisional puberty maturation ramp, and add UI guardrails so adolescent estimates are labelled as extrapolations.

**Architecture:** Extend `popPK.ts` with pure age-band and age-info helpers plus a provisional piecewise maturation factor. `ageClearanceMultiplier` keeps the current adult formula for `age >= 19` and multiplies the adult-19 value by the maturation factor below 19. `AgeSettings` renders the band and warnings; docs and translations follow. No storage, import, or adult PK behavior changes.

**Tech Stack:** React 18, TypeScript 5.8, Vite, Vitest, Tailwind CSS v4, i18n object packs in `src/i18n/translations.ts`.

**Spec:** [Issue #316 — Puberty-aware PK](https://github.com/xunxunProjects/Oyama-s-HRT-Tracker/issues/316). The age literature synthesis is in the issue body; there is no separate spec file.

## Global Constraints

- `ageClearanceMultiplier` for `age >= 19` must remain **byte-for-byte equivalent** to the current formula, including the `>75` hold at 75.
- No clinical claim; all `<19` outputs are labelled provisional/extrapolated. No dosing advice.
- Do not change `isPlausibleBirthYear`, `BIRTH_YEAR_MIN`, storage, import/export, or sync semantics.
- Do not change CPA, absorption rates, or the oral estrone pool.
- All new domain APIs must be exported from `src/domain/index.ts` so `tests/` and `AgeSettings.tsx` can import from `../../logic`.
- Use `AGE_REF_YEARS = 54`; keep the existing E2/T slopes and units.
- Four locale blocks must be updated; `ru`/`uk` key parity must pass.
- Commands: `npm test`, `npm run lint`, `npm run build`.

## Review Focus

- A 9-year-old and a 10-year-old must not silently jump; the lowest ramp is held and the UI says "outside validated range".
- A 19-year-old must be continuous with the adult branch; an 18.99-year-old must be just below it.
- The `>75` behavior must still hold at 75, not change to a new slope.
- A user with no birth year must see no band and no warning; all multipliers remain 1.
- Translation placeholders (`{range}`) must survive in every locale, especially `ru`/`uk`.

## File Structure

- Modify `src/domain/features/popPK.ts` — age types, band, model info, maturation ramp, clearance multiplier.
- Modify `src/domain/index.ts` — public exports for the new types and functions.
- Modify `src/pages/AgeSettings.tsx` — band line and minor/prepubertal warnings.
- Modify `src/i18n/translations.ts` — three keys in nine locales.
- Modify `tests/age.test.ts` — age band, model info, ramp, adult-regression tests.
- Modify `tests/translations.test.ts` — copy presence and `{range}` placeholder test.
- Modify `Algorithm Explanation.md` — §17 formula/table and §10 gap list.

---

### Task 1: Age bands

**Files:**

- Modify: `src/domain/features/popPK.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/age.test.ts`

**Interfaces:**

- Produces: `export type AgeBand = 'prepubertal' | 'earlyPuberty' | 'midPuberty' | 'latePuberty' | 'adult' | 'older'`
- Produces: `export function ageBand(ageYears: number): AgeBand`

- [ ] **Step 1: Write the failing test**

Add `ageBand` to the import block in `tests/age.test.ts`, then add:

```ts
describe('age bands', () => {
  it('maps age to a band at the boundaries', () => {
    expect(ageBand(9.99)).toBe('prepubertal');
    expect(ageBand(10)).toBe('earlyPuberty');
    expect(ageBand(12.99)).toBe('earlyPuberty');
    expect(ageBand(13)).toBe('midPuberty');
    expect(ageBand(15.99)).toBe('midPuberty');
    expect(ageBand(16)).toBe('latePuberty');
    expect(ageBand(18.99)).toBe('latePuberty');
    expect(ageBand(19)).toBe('adult');
    expect(ageBand(75)).toBe('adult');
    expect(ageBand(75.01)).toBe('older');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/age.test.ts -t "age bands"`
Expected: FAIL because `ageBand` is not exported.

- [ ] **Step 3: Implement `AgeBand` and `ageBand` in `src/domain/features/popPK.ts`**

Add near the top of the age section:

```ts
export type AgeBand = 'prepubertal' | 'earlyPuberty' | 'midPuberty' | 'latePuberty' | 'adult' | 'older';

export function ageBand(ageYears: number): AgeBand {
  if (ageYears < 10) return 'prepubertal';
  if (ageYears < 13) return 'earlyPuberty';
  if (ageYears < 16) return 'midPuberty';
  if (ageYears < 19) return 'latePuberty';
  if (ageYears <= 75) return 'adult';
  return 'older';
}
```

Export both from `src/domain/index.ts` alongside the existing age exports:

```ts
export type { AgeBand } from './features/popPK';
export { ageBand } from './features/popPK';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/age.test.ts -t "age bands"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/features/popPK.ts src/domain/index.ts tests/age.test.ts
git commit -m "feat(age): add age bands"
```

---

### Task 2: Age model info, notices, and maturation factor

**Files:**

- Modify: `src/domain/features/popPK.ts`
- Modify: `src/domain/index.ts`
- Test: `tests/age.test.ts`

**Interfaces:**

- Consumes: `AgeBand`, `ageBand`, `ageAtH`
- Produces: `export interface AgeModelInfo { ageYears: number | null; band: AgeBand | null; isMinor: boolean; isExtrapolated: boolean; maturationFactor: number }`
- Produces: `export function ageModelInfo(birthYear: number | null, timeH: number): AgeModelInfo`
- Produces: `export function ageNotice(info: AgeModelInfo): 'prepubertal' | 'minor' | null`
- Internal: `function pubertyMaturationFactor(ageYears: number): number`

- [ ] **Step 1: Write the failing tests**

Add `ageModelInfo` and `ageNotice` to the import block, then add:

```ts
describe('age model info', () => {
  it('returns no band without a birth year', () => {
    expect(ageModelInfo(null, NOW_H)).toEqual({
      ageYears: null,
      band: null,
      isMinor: false,
      isExtrapolated: false,
      maturationFactor: 1,
    });
  });

  it('marks minors and extrapolation', () => {
    const nine = ageModelInfo(bornAt(9), NOW_H);
    expect(nine.band).toBe('prepubertal');
    expect(nine.isMinor).toBe(true);
    expect(nine.isExtrapolated).toBe(true);
    expect(nine.maturationFactor).toBeCloseTo(0.7, 6);
    expect(ageNotice(nine)).toBe('prepubertal');

    const twelve = ageModelInfo(bornAt(12), NOW_H);
    expect(twelve.band).toBe('earlyPuberty');
    expect(twelve.isMinor).toBe(true);
    expect(twelve.isExtrapolated).toBe(true);
    expect(twelve.maturationFactor).toBeGreaterThan(0.76);
    expect(twelve.maturationFactor).toBeLessThan(0.79);
    expect(ageNotice(twelve)).toBe('minor');

    const adult = ageModelInfo(bornAt(54), NOW_H);
    expect(adult.band).toBe('adult');
    expect(adult.isMinor).toBe(false);
    expect(adult.isExtrapolated).toBe(false);
    expect(adult.maturationFactor).toBe(1);
    expect(ageNotice(adult)).toBeNull();

    const older = ageModelInfo(bornAt(80), NOW_H);
    expect(older.band).toBe('older');
    expect(older.isMinor).toBe(false);
    expect(older.isExtrapolated).toBe(true);
    expect(ageNotice(older)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/age.test.ts -t "age model info"`
Expected: FAIL because `ageModelInfo` and `ageNotice` are not exported.

- [ ] **Step 3: Implement the model info helpers**

Add below `ageBand`:

```ts
export interface AgeModelInfo {
  ageYears: number | null;
  band: AgeBand | null;
  isMinor: boolean;
  isExtrapolated: boolean;
  maturationFactor: number;
}

function pubertyMaturationFactor(ageYears: number): number {
  if (ageYears < 10) return 0.7;
  if (ageYears >= 19) return 1;
  if (ageYears < 12) return 0.7 + (0.78 - 0.7) * ((ageYears - 10) / 2);
  if (ageYears < 15) return 0.78 + (0.9 - 0.78) * ((ageYears - 12) / 3);
  return 0.9 + (1 - 0.9) * ((ageYears - 15) / 4);
}

export function ageModelInfo(birthYear: number | null, timeH: number): AgeModelInfo {
  if (birthYear === null) {
    return {
      ageYears: null,
      band: null,
      isMinor: false,
      isExtrapolated: false,
      maturationFactor: 1,
    };
  }
  const ageYears = ageAtH(birthYear, timeH);
  return {
    ageYears,
    band: ageBand(ageYears),
    isMinor: ageYears < 18,
    isExtrapolated: ageYears < 19 || ageYears > 75,
    maturationFactor: pubertyMaturationFactor(ageYears),
  };
}

export function ageNotice(info: AgeModelInfo): 'prepubertal' | 'minor' | null {
  if (info.band === 'prepubertal') return 'prepubertal';
  if (info.isMinor) return 'minor';
  return null;
}
```

Export the type and both functions from `src/domain/index.ts`:

```ts
export type { AgeBand, AgeModelInfo } from './features/popPK';
export { ageBand, ageModelInfo, ageNotice } from './features/popPK';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/age.test.ts -t "age model info"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/features/popPK.ts src/domain/index.ts tests/age.test.ts
git commit -m "feat(age): add age model info and notices"
```

---

### Task 3: Replace the `<19` clamp with the puberty ramp

**Files:**

- Modify: `src/domain/features/popPK.ts`
- Test: `tests/age.test.ts`

**Interfaces:**

- Consumes: `ageAtH`, `pubertyMaturationFactor`, `AGE_CLEARANCE_SLOPE`, `AGE_REF_YEARS`
- Produces: updated `ageClearanceMultiplier(hormone, birthYear, timeH)`

- [ ] **Step 1: Write the failing tests**

Replace the existing `it('holds its end value outside 19–75', ...)` block with:

```ts
it('ramps through puberty and holds only above 75', () => {
  const slope = {
    t: Math.log(1821 / 1390) / (67 - 27),
    e2: Math.log(1 / 0.75) / (79 - 27),
  };
  for (const h of ['e2', 't'] as const) {
    const adult19 = Math.exp(-slope[h] * (19 - AGE_REF_YEARS));

    expect(at(h, 9)).toBeCloseTo(at(h, 10), 12);
    expect(at(h, 10) / at(h, 19)).toBeCloseTo(0.7, 12);
    expect(at(h, 12) / at(h, 19)).toBeCloseTo(0.78, 12);
    expect(at(h, 15) / at(h, 19)).toBeCloseTo(0.9, 12);
    expect(at(h, 19)).toBeCloseTo(adult19, 12);
    expect(at(h, 19) / at(h, 18.999)).toBeCloseTo(1, 4);
    expect(at(h, 90)).toBeCloseTo(at(h, 75), 12);

    let previous = at(h, 10);
    for (let age = 10.05; age <= 19; age += 0.05) {
      const current = at(h, age);
      expect(current).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = current;
    }
  }
});

it('leaves the adult branch unchanged', () => {
  const slope = {
    t: Math.log(1821 / 1390) / (67 - 27),
    e2: Math.log(1 / 0.75) / (79 - 27),
  };
  for (const h of ['e2', 't'] as const) {
    for (const age of [19, 25, 54, 70, 75]) {
      expect(at(h, age)).toBeCloseTo(Math.exp(-slope[h] * (age - AGE_REF_YEARS)), 12);
    }
    expect(at(h, 90)).toBeCloseTo(at(h, 75), 12);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/age.test.ts -t "ramps through puberty"`
Expected: FAIL because the current code holds the 19-year-old value for all ages below 19.

- [ ] **Step 3: Implement the ramp**

Replace `const AGE_RANGE_YEARS = [19, 75] as const;` with:

```ts
const AGE_MAX_YEARS = 75;
```

Then add `ADULT_CLEARANCE_AT_19` **after** the existing `AGE_CLEARANCE_SLOPE` definition (it must not be evaluated before the slope exists):

```ts
const ADULT_CLEARANCE_AT_19 = {
  t: Math.exp(-AGE_CLEARANCE_SLOPE.t * (19 - AGE_REF_YEARS)),
  e2: Math.exp(-AGE_CLEARANCE_SLOPE.e2 * (19 - AGE_REF_YEARS)),
};
```

Replace `ageClearanceMultiplier` with:

```ts
export function ageClearanceMultiplier(hormone: 'e2' | 't', birthYear: number | null, timeH: number): number {
  if (birthYear === null) return 1;
  const age = ageAtH(birthYear, timeH);
  if (age < 19) return ADULT_CLEARANCE_AT_19[hormone] * pubertyMaturationFactor(age);
  return Math.exp(-AGE_CLEARANCE_SLOPE[hormone] * (Math.min(AGE_MAX_YEARS, age) - AGE_REF_YEARS));
}
```

Update the comment block above `AGE_REF_YEARS` so it says:

- ages `>= 19` use the original adult log-linear curve and hold at 75;
- ages `10–18.99` use `adult(19) ×` a provisional maturation ramp with anchors 10 → 0.70, 12 → 0.78, 15 → 0.90, 19 → 1.00;
- ages `< 10` hold the lowest ramp value (0.70) and are labelled outside the validated range in the UI;
- the ramp is a provisional assumption, not a validated Tanner-stage model;
- CPA, absorption rates, and the oral estrone pool are unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/age.test.ts -t "ramps through puberty"`
Expected: PASS.

Run the whole age file: `npx vitest run tests/age.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/features/popPK.ts tests/age.test.ts
git commit -m "feat(age): ramp clearance through puberty"
```

---

### Task 4: Show the age band and minor warnings

**Files:**

- Modify: `src/pages/AgeSettings.tsx`
- Modify: `src/i18n/translations.ts`
- Test: `tests/translations.test.ts`

**Interfaces:**

- Consumes: `ageModelInfo`, `ageNotice`, `AgeBand`
- Produces: `AgeSettings` renders `age.band` and the relevant warning; translation keys exist in every locale.

- [ ] **Step 1: Write the failing translation test**

Add to `tests/translations.test.ts`:

```ts
describe('age model copy', () => {
  const locales = ['en', 'zh', 'zh-TW', 'yue', 'ja', 'ko', 'tr', 'ru', 'uk'] as const;

  for (const lang of locales) {
    it(`${lang} has age band and warning copy`, () => {
      const pack = TRANSLATIONS[lang] as Record<string, string>;
      expect(pack['age.band']).toContain('{range}');
      expect(pack['age.warning.minor']).toBeTruthy();
      expect(pack['age.warning.prepubertal']).toBeTruthy();
    });
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/translations.test.ts -t "age model copy"`
Expected: FAIL because the keys are missing.

- [ ] **Step 3: Add the copy in all locales**

Insert after each locale's existing `age.explain` entry. Use these English and Chinese strings as the source, and the provided translations for the rest:

| Locale | `age.band`                          | `age.warning.minor`                                                                                                                                                | `age.warning.prepubertal`                                                                                      |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| en     | `Model age band: {range}`           | `This model is built for adults. Under 18, the estimate is an extrapolation and not a dosing recommendation; discuss changes with a clinician.`                    | `Under 10 is outside the model's validated range. The estimate is not reliable; discuss with a clinician.`     |
| zh     | `模型年龄区间：{range}`             | `本模型以成人为基础。18 岁以下的估算属于外推，不是给药建议；调整方案请与临床医生讨论。`                                                                            | `10 岁以下超出模型的验证范围，估算不可靠；请与临床医生讨论。`                                                  |
| zh-TW  | `模型年齡區間：{range}`             | `本模型以成人為基礎。18 歲以下的估算屬於外推，不是給藥建議；調整方案請與臨床醫師討論。`                                                                            | `10 歲以下超出模型的驗證範圍，估算不可靠；請與臨床醫師討論。`                                                  |
| yue    | `模型年齡區間：{range}`             | `本模型以成人為基礎。18 歲以下嘅估算屬於外推，唔係給藥建議；調整方案請同臨床醫生傾。`                                                                              | `10 歲以下超出模型嘅驗證範圍，估算唔可靠；請同臨床醫生傾。`                                                    |
| ja     | `モデルの年齢帯：{range}`           | `本モデルは成人向けです。18歳未満の推定は外挿であり、投与量の提案ではありません。変更は臨床医と相談してください。`                                                 | `10歳未満はモデルの検証範囲外です。推定は信頼できません。臨床医と相談してください。`                           |
| ko     | `모델 연령대: {range}`              | `이 모델은 성인을 기준으로 합니다. 18세 미만의 추정치는 외삽이며 투여 권고가 아닙니다. 변경은 임상의와 상담하세요.`                                                | `10세 미만은 모델의 검증 범위를 벗어납니다. 추정치를 신뢰할 수 없습니다. 임상의와 상담하세요.`                 |
| tr     | `Model yaş aralığı: {range}`        | `Bu model yetişkinler için tasarlanmıştır. 18 yaş altındaki tahminler ekstrapolasyondur ve doz önerisi değildir; değişiklikleri bir klinisyenle görüşün.`          | `10 yaş altı modelin doğrulanmış aralığının dışındadır. Tahmin güvenilir değildir; bir klinisyenle görüşün.`   |
| ru     | `Возрастная группа модели: {range}` | `Эта модель рассчитана на взрослых. Для лиц младше 18 лет оценка является экстраполяцией и не является рекомендацией по дозированию; обсудите изменения с врачом.` | `Возраст младше 10 лет выходит за пределы проверенного диапазона модели. Оценка ненадёжна; обсудите с врачом.` |
| uk     | `Вікова група моделі: {range}`      | `Ця модель розрахована на дорослих. Для осіб молодше 18 років оцінка є екстраполяцією і не є рекомендацією щодо дозування; обговоріть зміни з лікарем.`            | `Вік молодше 10 років виходить за межі перевіреного діапазону моделі. Оцінка ненадійна; обговоріть з лікарем.` |

- [ ] **Step 4: Run the translation test to verify it passes**

Run: `npx vitest run tests/translations.test.ts -t "age model copy"`
Expected: PASS.

- [ ] **Step 5: Update `AgeSettings.tsx`**

Change the import to:

```ts
import { isPlausibleBirthYear, BIRTH_YEAR_MIN, AGE_REF_YEARS, ageModelInfo, ageNotice } from '../../logic';
import type { AgeBand } from '../../logic';
```

Add above the component:

```ts
const BAND_RANGE: Record<AgeBand, string> = {
  prepubertal: '<10',
  earlyPuberty: '10–12',
  midPuberty: '13–15',
  latePuberty: '16–18',
  adult: '19–75',
  older: '>75',
};
```

Inside the component, after `const showError = tried && !valid;`, add:

```ts
const nowH = Date.now() / 3_600_000;
const info = valid ? ageModelInfo(year, nowH) : null;
const notice = info ? ageNotice(info) : null;
```

After the `age.explain` paragraph and before the submit button, add:

```tsx
{
  info && info.band && (
    <p className="mt-2 text-xs text-[var(--text-muted)]">{fill(t('age.band'), { range: BAND_RANGE[info.band] })}</p>
  );
}
{
  notice && (
    <p role="status" className="mt-3 text-xs leading-relaxed text-[var(--warning)]">
      {t(notice === 'prepubertal' ? 'age.warning.prepubertal' : 'age.warning.minor')}
    </p>
  );
}
```

- [ ] **Step 6: Run the focused tests and build**

Run: `npx vitest run tests/translations.test.ts`
Expected: PASS.

Run: `npm run build`
Expected: PASS, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/AgeSettings.tsx src/i18n/translations.ts tests/translations.test.ts
git commit -m "feat(age): show age band and minor warnings"
```

---

### Task 5: Document the new age model

**Files:**

- Modify: `Algorithm Explanation.md`

**Interfaces:**

- Consumes: the final formula and anchors from Task 3.
- Produces: §17 and §10 describe the age bands, the provisional ramp, and the guardrails.

- [ ] **Step 1: Update §17**

Replace the current clamp formula

```text
m(age) = exp(-s × (min(75, max(19, age)) - 54))
```

with:

```text
m(age) =
  exp(-s × (min(75, age) - 54)),                  age >= 19
  exp(-s × (19 - 54)) × r(age),                   10 <= age < 19
  exp(-s × (19 - 54)) × 0.70,                     age < 10
```

where `r(age)` is piecewise linear with anchors:

| Age | `r(age)` |
| --- | -------- |
| 10  | 0.70     |
| 12  | 0.78     |
| 15  | 0.90     |
| 19  | 1.00     |

Add a table for the clearance multiplier at ages 10, 12, 15, 18, 19, 25, 54, 70, and 75 for both hormones. Label the `<19` values **provisional and not clinically validated**.

Add a paragraph explaining:

- the adult branch (`>=19`) is unchanged;
- the `<19` branch is a size/maturation placeholder until Tanner stage, weight allometry, and SHBG/free-hormone covariates are implemented;
- `<10` is outside the validated range and the UI warns;
- the evidence is sparse and mostly from Turner syndrome, trans youth, and paediatric tacrolimus/CYP3A4 ontogeny studies;
- this is not a dosing recommendation.

Add citations to:

- [Age/Tanner reference intervals, 2026](https://pubmed.ncbi.nlm.nih.gov/42554720/)
- [Tacrolimus puberty PK, 2017](https://pubmed.ncbi.nlm.nih.gov/27966227/)
- [Anderson & Holford, size + maturation, 2009](https://pubmed.ncbi.nlm.nih.gov/19252334/)

- [ ] **Step 2: Update §10**

Replace the age line in the known-gaps list with:

> Age is now split into bands with a provisional puberty ramp, but Tanner stage, sex-specific SHBG/free-hormone baselines, weight allometry, body composition, and GnRH-agonist effects are still unmodeled. Under 10 is outside the validated range; under 19 is labelled extrapolated.

- [ ] **Step 3: Verify the docs**

Run: `grep -n "puberty ramp\|Tanner\|42554720\|27966227\|19252334" "Algorithm Explanation.md"`
Expected: matches in §17 and §10.

- [ ] **Step 4: Commit**

```bash
git add "Algorithm Explanation.md"
git commit -m "docs(age): document the puberty ramp"
```

---

## Final verification

- [ ] Run the full suite: `npm test`
- [ ] Run lint: `npm run lint`
- [ ] Run the production build: `npm run build`
- [ ] Check whitespace: `git diff --check`
- [ ] Confirm `git diff main --stat` contains only the files listed in this plan
- [ ] Confirm the PR body links issue #316 and states that adult `>=19` predictions are unchanged
- [ ] Open the PR against `main`; wait for CI green before merge

Expected final state: the `<19 → 19` clamp is gone, adult predictions are byte-for-byte unchanged, the UI shows an age band and a minor/prepubertal warning, all locales have the new copy, and the docs describe the model as provisional.
