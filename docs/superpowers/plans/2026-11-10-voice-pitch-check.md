# Voice Pitch Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in or local user read a fixed 5-second passage, estimate median F0 in the browser, score it toward the current HRT mode's voice direction, and keep a private local history.

**Architecture:** Pure TypeScript domain modules (`score.ts`, `pitch.ts`, `passage.ts`) do the math; `src/utils/voiceStorage.ts` owns account+mode-scoped persistence; `src/pages/Voice.tsx` owns the microphone lifecycle and UI. Navigation uses the existing Supplies pattern (`VIEW_TAB.voice='settings'` plus `ALSO_UNDER.voice='home'`) so Back returns to whichever page opened the voice page.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind utility classes, Vitest, Web Audio API (`getUserMedia`, `AudioContext`, `AnalyserNode`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-10-voice-pitch-preview-design.md`

## Global Constraints

- Score formula is exactly `raw = clamp(((F0 - 150) / 50) * 100, -100, 100)`; `transfem` score is `raw`, `transmasc` score is `-raw`.
- Buckets are `>=80 great`, `>=60 good`, `>=20 keep`, `>=-20 needs`, `< -20 start`.
- Recording is a fixed 5-second passage; `durationMs >= 2000`; analysis range is 70–500 Hz.
- Store only derived values, never audio. Persist under `modeKeyFor(owner, mode, 'voice-checks')`; cap 100 per mode; clear both modes for the current owner.
- Add `'voice-checks'` to `MODE_SUFFIXES` in `src/hooks/useAppData.ts`.
- Production `Permissions-Policy` must become `camera=(), microphone=(self), geolocation=()`.
- Add `voice.*` keys to zh, en, ru, and uk. ru/uk must have exactly the same keys and `{placeholder}` sets as en.
- No new npm dependencies. No React component tests; verify UI by build/typecheck and manual mic checks.
- Tauri v1 is best-effort: do not change `src-tauri`; show `voice.error.desktop` when the shell is detected and the mic fails.

## Review Focus

- Permission denial, insecure context, missing microphone, and Tauri failure all end in a readable message and a retry path.
- Silence, noise, clipping, and a too-short recording never save a bogus score.
- A 120 Hz harmonic-rich voice must not be scored as 60 or 240 Hz.
- localStorage quota/security errors still show the result and set `saveFailed`.
- Leaving the page or switching HRT mode stops every track and discards the sample.
- Scores from different passages are never plotted together.

---

### Task 1: Score domain

**Files:**

- Create: `src/domain/voice/types.ts`
- Create: `src/domain/voice/score.ts`
- Test: `tests/voiceScore.test.ts`

**Interfaces:**

- `export type VoicePassageId = 'zh' | 'en' | 'ru' | 'uk'`
- `export interface VoiceCheck { id: string; at: number; medianF0: number; p5: number; p95: number; score: number; voicedRatio: number; durationMs: number; passageId: VoicePassageId }`
- `export type VoiceBucket = 'great' | 'good' | 'keep' | 'needs' | 'start'`
- `export function scoreFromF0(f0: number, mode: 'transfem' | 'transmasc'): number`
- `export function bucketForScore(score: number): VoiceBucket`
- `export const SCORE_MIDPOINT_HZ = 150`, `SCORE_SPAN_HZ = 50`

- [ ] **Step 1: Write the failing test**

Create `tests/voiceScore.test.ts` with cases for 100/125/150/175/200 Hz in both modes, clamping at 0/300 Hz, and bucket boundaries 80/79/60/59/20/19/-20/-21.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/voiceScore.test.ts`
Expected: module not found for `src/domain/voice/score`.

- [ ] **Step 3: Implement the types and functions**

`scoreFromF0` clamps the input to 0–300 Hz before applying the formula, then clamps the result to [-100, 100] and rounds to one decimal. `bucketForScore` uses the table above with `>=` except `start`.

- [ ] **Step 4: Run it and make it pass**

Run: `npm test -- tests/voiceScore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/voice/types.ts src/domain/voice/score.ts tests/voiceScore.test.ts
git commit -m "feat(voice): add F0 score domain"
```

---

### Task 2: Pitch detection domain

**Files:**

- Create: `src/domain/voice/pitch.ts`
- Test: `tests/voicePitch.test.ts`

**Interfaces:**

- `export interface PitchReading { f0: number; clarity: number }`
- `export interface PitchSummary { medianF0: number; p5: number; p95: number; voicedRatio: number; voicedFrames: number; totalFrames: number }`
- `export function frameRms(frame: Float32Array): number`
- `export function detectPitch(frame: Float32Array, sampleRate: number): PitchReading | null`
- `export function summarizePitch(frames: Float32Array[], sampleRate: number): PitchSummary | null`
- Constants: `MIN_F0 = 70`, `MAX_F0 = 500`, `MIN_CLARITY = 0.8`, `MIN_VOICED_RATIO = 0.3`, `MIN_VOICED_FRAMES = 20`.

- [ ] **Step 1: Write the failing test**

Create `tests/voicePitch.test.ts` generating 48 kHz sine waves at 110, 150, 200, 250 Hz (0.2 amplitude, 4096 samples) plus a quiet 120 Hz + 0.5×240 Hz harmonic case. Assert each detected F0 is within ±2 Hz of the fundamental. Add silence (all zeros) and uniform white noise cases, expecting `null` or `clarity < 0.8`. For `summarizePitch`, feed 40 frames of 150 Hz plus 10 silent frames and assert median ≈ 150, `p5 <= median <= p95`, and `voicedRatio` between 0.7 and 0.9. Feed 10 frames and expect `null`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/voicePitch.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement YIN**

`detectPitch` removes the frame mean, computes the difference function for tau from `floor(sampleRate/MAX_F0)` to `ceil(sampleRate/MIN_F0)`, cumulative-mean normalizes it, picks the first local minimum below 0.15 (falling back to the global minimum if none), applies parabolic interpolation, and returns `clarity = 1 - cmnd[tau]`. Reject `clarity < MIN_CLARITY`. `summarizePitch` maps each frame through `detectPitch`, returns `null` when `frames.length === 0`, then computes median/p5/p95 over voiced F0 values and `voicedRatio = voicedFrames / totalFrames`; return `null` if `voicedFrames < MIN_VOICED_FRAMES` or `voicedRatio < MIN_VOICED_RATIO`. Use linear interpolation for percentiles.

- [ ] **Step 4: Run it and make it pass**

Run: `npm test -- tests/voicePitch.test.ts`
Expected: PASS; the harmonic case must stay near 120 Hz.

- [ ] **Step 5: Commit**

```bash
git add src/domain/voice/pitch.ts tests/voicePitch.test.ts
git commit -m "feat(voice): add YIN pitch detection"
```

---

### Task 3: Account+mode storage

**Files:**

- Create: `src/utils/voiceStorage.ts`
- Modify: `src/hooks/useAppData.ts` (`MODE_SUFFIXES`)
- Test: `tests/voiceStorage.test.ts`

**Interfaces:**

- `export const VOICE_CHECKS_SUFFIX = 'voice-checks'`
- `export const MAX_VOICE_CHECKS = 100`
- `export function voiceChecksKey(owner: string, mode: 'transfem' | 'transmasc'): string` — delegates to `modeKeyFor(owner, mode, VOICE_CHECKS_SUFFIX)`.
- `export function loadVoiceChecks(storage: StorageLike, owner: string, mode: 'transfem' | 'transmasc'): VoiceCheck[]` — returns `[]` for missing/invalid JSON and filters with `isVoiceCheck`.
- `export function addVoiceCheck(storage: StorageLike, owner: string, mode: 'transfem' | 'transmasc', check: VoiceCheck): VoiceCheck[]` — prepends, keeps newest 100, writes, returns the new list.
- `export function clearAllVoiceChecks(storage: StorageLike, owner: string): void` — removes both mode keys for that owner.
- `export function isVoiceCheck(value: unknown): value is VoiceCheck`

- [ ] **Step 1: Write the failing test**

Use `MemoryStorage` from `tests/memoryStorage.ts`. Assert:

1. `voiceChecksKey('local','transfem') === 'hrt-voice-checks'` and `voiceChecksKey('local','transmasc') === 'hrt-masc-voice-checks'`.
2. `voiceChecksKey('u1','transfem') === 'hrt-u1-voice-checks'`.
3. Adding 105 checks keeps 100 and the newest first.
4. Invalid JSON and malformed records are ignored.
5. `clearAllVoiceChecks('u1')` removes both `hrt-u1-voice-checks` and `hrt-u1-masc-voice-checks` but leaves `hrt-u2-voice-checks` alone.
6. `MODE_SUFFIXES` contains `'voice-checks'` (import it if exported; otherwise assert the source file contains the string).

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/voiceStorage.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement and wire adoption**

Implement the functions with `try/catch` around storage access (return `[]`/no-op on failure). Add `'voice-checks'` to `MODE_SUFFIXES`.

- [ ] **Step 4: Run it and make it pass**

Run: `npm test -- tests/voiceStorage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/voiceStorage.ts src/hooks/useAppData.ts tests/voiceStorage.test.ts
git commit -m "feat(voice): persist checks per account and mode"
```

---

### Task 4: Passage mapping

**Files:**

- Create: `src/domain/voice/passage.ts`
- Test: `tests/voicePassage.test.ts`

**Interfaces:**

- `export const PASSAGES: Record<VoicePassageId, string>` with the four exact sentences from the design.
- `export function passageIdForLang(lang: string): VoicePassageId` — `ru`/`uk` map to themselves; `zh`/`zh-TW`/`yue` map to `'zh'`; everything else maps to `'en'`.
- `export function passageKeyForId(id: VoicePassageId): string` — returns `voice.passage.${id}`.

- [ ] **Step 1: Write the failing test**

Assert the four language mappings, the four fallbacks, and `PASSAGES.zh === '今天天气很好，我准备出门走一走，顺便买点东西。'`.

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/voicePassage.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

Use the exact sentences from the design; do not translate them at runtime.

- [ ] **Step 4: Run it and make it pass**

Run: `npm test -- tests/voicePassage.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/voice/passage.ts tests/voicePassage.test.ts
git commit -m "feat(voice): map UI language to fixed passage"
```

---

### Task 5: Production microphone policy

**Files:**

- Modify: `worker.ts` (`Permissions-Policy` line)
- Test: `tests/securityHardening.test.ts`

- [ ] **Step 1: Add the failing assertion**

In the existing privacy-headers test, add:

```ts
expect(headers.get('Permissions-Policy')).toBe('camera=(), microphone=(self), geolocation=()');
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test -- tests/securityHardening.test.ts`
Expected: received `camera=(), microphone=(), geolocation=()`.

- [ ] **Step 3: Change the header**

Keep camera and geolocation at `()`, set microphone to `(self)`.

- [ ] **Step 4: Run it and make it pass**

Run: `npm test -- tests/securityHardening.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker.ts tests/securityHardening.test.ts
git commit -m "feat(voice): allow same-origin microphone in production"
```

---

### Task 6: Voice translations

**Files:**

- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/ru.ts`
- Modify: `src/i18n/uk.ts`

**Interfaces:** Define `VOICE_ZH` and `VOICE_EN` above `TRANSLATIONS_BASE`, spread them as the first properties of `TRANSLATIONS_BASE.zh` and `.en`. Define `VOICE_RU`/`VOICE_UK` in the language files and spread them as the first properties of `RU`/`UK`.

Required keys:
`voice.title`, `voice.subtitle`, `voice.mode.transfem`, `voice.mode.transmasc`, `voice.mode.note`, `voice.intro.title`, `voice.intro.body`, `voice.passage.title`, `voice.passage.zh`, `voice.passage.en`, `voice.passage.ru`, `voice.passage.uk`, `voice.start`, `voice.stop`, `voice.recording`, `voice.analyzing`, `voice.remaining`, `voice.live_hz`, `voice.level`, `voice.result.title`, `voice.result.median`, `voice.result.range`, `voice.result.retry`, `voice.axis.far`, `voice.axis.near`, `voice.axis.higher`, `voice.axis.lower`, `voice.bucket.great`, `voice.bucket.good`, `voice.bucket.keep`, `voice.bucket.needs`, `voice.bucket.start`, `voice.history.title`, `voice.history.empty`, `voice.history.date_score`, `voice.clear`, `voice.clear_confirm`, `voice.disclaimer`, `voice.evidence.title`, `voice.error.unsupported`, `voice.error.permission`, `voice.error.no_mic`, `voice.error.busy`, `voice.error.too_short`, `voice.error.too_quiet`, `voice.error.desktop`, `voice.error.generic`, `voice.save_failed`, `voice.entry`.

Placeholders: `voice.remaining` uses `{n}`; `voice.live_hz`, `voice.result.median`, `voice.history.date_score` use `{hz}`; `voice.result.range` uses `{low}` and `{high}`; `voice.history.date_score` also uses `{date}` and `{score}`. All four packs must use exactly the same placeholders per key. `voice.passage.*` are the exact sentences from Task 4; do not translate those values between packs (each pack carries all four sentences so the key exists everywhere).

- [ ] **Step 1: Add the blocks**

Start each spread as the first property so the translation-spread test passes. Do not add `voice.*` to `ZH_TW`, `yue`, `ja`, `ko`, or `tr`; runtime fallback covers them.

- [ ] **Step 2: Run the translation test**

Run: `npm test -- tests/translations.test.ts`
Expected: PASS; ru/uk key sets and placeholders match en.

- [ ] **Step 3: Commit**

```bash
git add src/i18n/translations.ts src/i18n/ru.ts src/i18n/uk.ts
git commit -m "feat(voice): add zh/en/ru/uk copy"
```

---

### Task 7: Voice page, navigation, entry points

**Files:**

- Create: `src/pages/Voice.tsx`
- Modify: `src/hooks/useAppNavigation.ts`
- Modify: `src/App.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/components/icons/glyphs.ts`
- Modify: `src/components/icons/index.tsx`
- Modify: `docs/superpowers/specs/2026-11-10-voice-pitch-preview-design.md`

**Interfaces:**

- `Voice` props: `{ onBack: () => void }`.
- Navigation: add `'voice'` to `ViewKey`, `VIEW_TAB.voice='settings'`, `ALSO_UNDER.voice='home'`, add `'voice'` to `VIEW_ORDER` after `'forecast'`.
- `HomeProps`/`SettingsProps` add `onNavigateToVoice: () => void`; App passes `() => handleViewChange('voice')`.
- Render `{currentView === 'voice' && <Voice onBack={() => handleViewChange('settings')} />}` next to Forecast.
- Add `Mic` glyph and export it.

**Page behavior**

- `useHRTMode()`, `useAuth()`, `useDialog()`, `useTranslation()`.
- `owner = user?.id ?? 'local'`; `passageId = passageIdForLang(lang)`; `passage = PASSAGES[passageId]`.
- State: `status: 'idle' | 'requesting' | 'recording' | 'analyzing' | 'done' | 'error'`, `history`, `result`, `errorKey`, `saveFailed`, `elapsedMs`, `liveHz`, `level`.
- Load history on owner/mode change from `loadVoiceChecks(localStorage, owner, mode)`.
- Start: check `navigator.mediaDevices?.getUserMedia` and `window.isSecureContext`; request `{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }`; create `AudioContext`, `createMediaStreamSource`, `AnalyserNode` with `fftSize = 4096`; sample every 40 ms into `Float32Array(4096)`.
- Stop at 5000 ms or on the Stop button: stop tracks, close context, reject `< 2000 ms`, call `summarizePitch`, reject when null, compute `Math.round(scoreFromF0(summary.medianF0, mode))`, build the `VoiceCheck` with `crypto.randomUUID()` and `Date.now()`, show it, then `addVoiceCheck`.
- If save throws, keep the result and set `saveFailed`.
- Cleanup on unmount/visibility hidden stops tracks and discards. Capture `mode`/`owner` at start; if they differ at stop, discard.
- Error mapping: `NotAllowedError`/`SecurityError` -> permission; `NotFoundError`/`DevicesNotFoundError` -> no mic; `NotReadableError`/`TrackStartError` -> busy; Tauri shell -> desktop; else generic. Missing API -> unsupported.
- UI: `PageHeader` title `voice.title`; mode badge; intro card; passage card with large text; primary record/stop button with `Mic`; progress bar and `{n}` countdown while recording; `aria-live` status; result card with signed score, bucket, median, p5–p95, axis marker at `left: calc(((score+100)/2)% - 8px)`; history filtered to current `passageId`, last 12, SVG polyline chart with a 0 midline, rows via `voice.history.date_score`; evidence links to PMIDs 36371270, 30503396, 26678122, 32104050, 35382956; disclaimer; clear button using `showDialog('confirm', t('voice.clear_confirm'), ...)` and `clearAllVoiceChecks(localStorage, owner)`.
- Use `fill()` from `src/utils/regimenText` for placeholders; `date.toLocaleDateString(lang, { month: 'short', day: 'numeric' })`.

**Docs:** soften design line 49 to “女性化嗓音不等于单纯提高音高；训练/手术是主要手段” and update §9 to the `VIEW_TAB.voice='settings'` + `ALSO_UNDER.voice='home'` implementation.

- [ ] **Step 1: Add the Mic glyph and navigation/view wiring**

Add the glyph, view key, `VIEW_TAB`, `ALSO_UNDER`, `VIEW_ORDER`, App import/render, and the Home/Settings props. Verify with `npm run build`.

- [ ] **Step 2: Implement the page**

Use the behavior above. Keep all microphone resources in a single `recordingRef`; never leave a track running.

- [ ] **Step 3: Build, lint, format**

Run: `npm run build`, `npm run lint`, `npm run format:check`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Voice.tsx src/hooks/useAppNavigation.ts src/App.tsx src/pages/Settings.tsx src/pages/Home.tsx src/components/icons/glyphs.ts src/components/icons/index.tsx docs/superpowers/specs/2026-11-10-voice-pitch-preview-design.md
git commit -m "feat(voice): add pitch check page and entry points"
```

---

### Task 8: Full verification and PR

- [ ] **Step 1: Run everything**

Run: `npm test`, `npm run build`, `npm run lint`, `npm run format:check`
Expected: all pass.

- [ ] **Step 2: Manual checks**

On the Vite dev server (`npm run dev`): allow mic, read the passage, confirm the 5-second stop, a result, a saved history row, a reload that keeps history, a mode switch that flips the score, denied permission, and silence. If a Tauri build is available, confirm the desktop error path does not crash.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/voice-pitch-check
gh pr create --repo xunxunProjects/Oyama-s-HRT-Tracker --base main --head fantuanmtf:feat/voice-pitch-check --title "feat: voice pitch check (F0) with goal scoring" --body "Closes #302. Implements the preview design: fixed 5-second passage, YIN median F0, mode-aware score, account+mode local history, zh/en/ru/uk copy, and same-origin microphone policy. @SmirnovaOyama"
```

- [ ] **Step 4: Verify the PR**

Run: `gh pr view --repo xunxunProjects/Oyama-s-HRT-Tracker feat/voice-pitch-check --json url,state,title,body`
Confirm the URL, open state, and `Closes #302`.
