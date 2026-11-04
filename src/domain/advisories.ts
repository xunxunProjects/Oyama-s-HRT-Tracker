// Dose and hormone-level advisories.
import { Ester, ExtraKey, Route } from './types';
import type { DoseEvent, LabResult } from './types';
import { getToE2Factor, isEstradiolEster, isTestosteroneEster } from './constants';
import { convertToNgDl, convertToPgMl, isT_LabUnit } from './labs';
import { _plannedWearH, patchRemovalTimes } from './shared/patch';

// --- Dose advisory ("you've taken a lot" heads-up) ---
//
// This looks at the *doses the person actually logged*, not the modelled blood
// level. Dose is a hard fact; the concentration curve is only an estimate that can
// be wrong until it's calibrated against labs. So the warning is anchored to how
// much medication is being taken, and the UI separately nudges toward calibration.

export interface DoseAdvisory {
    /**
     * Which compound the advisory is about (drives the message shown).
     * 'e2_cpa' fires when both are elevated at once — a real combination in
     * transfem regimens — so the two per-compound risks are named together
     * instead of silently dropping whichever has the lower ratio.
     */
    kind: 'e2' | 't' | 'cpa' | 'e2_cpa';
}

// Daily estradiol routes and testosterone gel sit at 1.5× the top of their
// usual range, so only clearly excessive use trips them, not merely a
// high-normal dose. Injections sit wider (about 3× for estradiol, 2× for
// testosterone) because a rate read from the person's own cadence is coarse.
// CPA sits at the top of its recommended range, not above it, because more
// blocks testosterone no better; older guidance's 25–50 mg/day does warn.
// Usual ranges: transfemscience.org "An Introduction to Transfeminine Hormone
// Therapy", Table 5 (E2) and "Cyproterone Acetate Dosage" (CPA,
// https://transfemscience.org/articles/cpa-dosage/; WPATH SOC 8 gives
// 10 mg/day); UCSF masculinizing-therapy guidance (T, 50–100 mg/week).
const DOSE_CEILING = {
    cpaPerDay: 12.5, // mg/day — CPA adds no extra blockade above ~10–12.5 mg/day
    e2OralPerDay: 12, // mg/day of estradiol — usual 2–8
    e2SublingualPerDay: 9, // mg/day of estradiol — usual 0.5–6
    e2GelPerDay: 9, // mg/day of estradiol — usual 1.5–6
    e2PatchPerDay: 0.6, // mg/day delivered — usual 0.05–0.4 (50–400 µg/day)
    // Injected estradiol, in mg of the ester. Table 5's usual ranges for the
    // valerate, cypionate, enanthate, benzoate and undecylate all top out
    // around 6 mg of ester a week (EB 2.25 mg/3 d, EU 24 mg/28 d), so one
    // weekly ceiling in ester mg fits every ester once each is read at its own
    // cadence (see _injectionWeeklyRate).
    e2InjPerWeek: 20,
    e2InjSingle: 50, // mg — a single injected-E2 dose this large is excessive
    tGelPerDay: 150, // mg/day — testosterone gel
    tInjPerWeek: 200, // mg/week — injected testosterone (50–100 mg/wk is typical)
} as const;

// Injections closer together than this are one dose split across sites.
const SPLIT_INJECTION_H = 12;
// How long a patch with neither a removal nor a planned wear time is assumed
// to be on. Short on purpose: a forgotten removal must not read as patches
// piling up.
const PATCH_UNKNOWN_WEAR_H = 24;

/**
 * Calendar day in the device's own time zone, as a day number. People think in
 * local days: two evening doses an hour apart must not land on different days
 * just because UTC midnight falls between them.
 */
function _localDay(timeH: number): number {
    const offsetH = new Date(timeH * 3600 * 1000).getTimezoneOffset() / 60;
    return Math.floor((timeH - offsetH) / 24);
}

/** Labelled release rate of a patch in mg/day, or null when only a reservoir dose was logged. */
function _patchRateMgPerDay(e: DoseEvent): number | null {
    const ug = e.extras?.[ExtraKey.releaseRateUGPerDay];
    return typeof ug === 'number' && Number.isFinite(ug) && ug > 0 ? ug / 1000 : null;
}

/** When local day `day` (a _localDay number) starts, in hours since the epoch. */
function _localDayStartH(day: number): number {
    // Searched for, as a day can start at a clock change rather than at
    // midnight. UTC offsets lie between −12 h and +14 h, and every offset and
    // clock change falls on a whole minute.
    let lo = day * 24 - 14;
    let hi = day * 24 + 12;
    while (hi - lo > 1e-4) {
        const mid = (lo + hi) / 2;
        if (_localDay(mid) >= day) hi = mid;
        else lo = mid;
    }
    return Math.round(hi * 60) / 60;
}

/**
 * Heaviest recent estradiol day, as a fraction of the ceiling (1 = at the
 * ceiling). Oral, sublingual and gel doses count by what was taken on each
 * local day, in mg of estradiol, plus what patches deliver on that same day.
 * A patch on its own counts by what it delivers over the 24 h from its
 * application. Routes add up as fractions of their own ceilings, so 6 mg oral
 * plus a 300 µg/day patch is half of one plus half of the other.
 *
 * A patch logged by reservoir dose only has no known daily delivery (its
 * reservoir is several times what it releases) and is left out, as the
 * per-dose guide in the dose form does.
 */
function _e2DailyRatio(events: DoseEvent[], nowH: number, days: number): number {
    const inWindow = (t: number) => nowH - t >= 0 && nowH - t <= days * 24;
    const byDay = new Map<number, number>();
    for (const e of events) {
        if (!isEstradiolEster(e.ester) || !inWindow(e.timeH)) continue;
        const ceiling =
            e.route === Route.oral
                ? DOSE_CEILING.e2OralPerDay
                : e.route === Route.sublingual
                  ? DOSE_CEILING.e2SublingualPerDay
                  : e.route === Route.gel
                    ? DOSE_CEILING.e2GelPerDay
                    : null;
        if (ceiling === null) continue;
        const day = _localDay(e.timeH);
        byDay.set(day, (byDay.get(day) ?? 0) + (e.doseMG * getToE2Factor(e.ester)) / ceiling);
    }

    const removals = patchRemovalTimes(events);
    const patches: { start: number; end: number; rate: number }[] = [];
    for (const e of events) {
        if (e.route !== Route.patchApply || !isEstradiolEster(e.ester) || e.timeH > nowH) continue;
        const rate = _patchRateMgPerDay(e);
        if (rate === null) continue;
        const removeAt = removals.get(e);
        const wear =
            removeAt !== undefined && removeAt > e.timeH
                ? removeAt - e.timeH
                : (_plannedWearH(e) ?? PATCH_UNKNOWN_WEAR_H);
        patches.push({ start: e.timeH, end: e.timeH + wear, rate });
    }

    // What the patches deliver from `from` to `to`, in mg per 24 h. Measuring
    // a day's delivery rather than the rate at one instant keeps a changeover,
    // where the new patch goes on minutes before the old one comes off, from
    // counting as two patches for the whole day. Rounded so that a day exactly
    // at the ceiling does not cross it by floating-point error.
    const patchMgPerDay = (from: number, to: number) => {
        let mg = 0;
        for (const p of patches) {
            const overlapH = Math.min(p.end, to) - Math.max(p.start, from);
            if (overlapH > 0) mg += (p.rate * overlapH) / 24;
        }
        return Math.round(((mg * 24) / (to - from)) * 1e6) / 1e6;
    };

    let mx = 0;
    // Each day with tablets or gel, with the patches worn that same day. A
    // switch from tablets in the morning to a patch at night is two half days,
    // not one full day of each.
    for (const [day, ratio] of byDay) {
        const total =
            ratio + patchMgPerDay(_localDayStartH(day), _localDayStartH(day + 1)) / DOSE_CEILING.e2PatchPerDay;
        if (total > mx) mx = total;
    }
    // Each application, where the patch total rises.
    for (const p of patches) {
        if (!inWindow(p.start)) continue;
        const ratio = patchMgPerDay(p.start, p.start + 24) / DOSE_CEILING.e2PatchPerDay;
        if (ratio > mx) mx = ratio;
    }
    return mx;
}

/**
 * CPA per day, averaged over the days it is taken in the trailing `days`. CPA
 * lasts long enough to be taken every 2 or 3 days (see the CPA dosage article
 * above DOSE_CEILING), and 25 mg every other day is the same 12.5 mg/day as
 * 12.5 mg daily, which a heaviest-day reading would flag. The mean dose per
 * dose day is divided by the mean gap between dose days, so a larger latest
 * dose counts at once; a single dose day counts in full.
 */
function _cpaPerDay(events: DoseEvent[], nowH: number, days: number): number {
    const byDay = new Map<number, number>();
    for (const e of events) {
        const age = nowH - e.timeH;
        if (e.ester === Ester.CPA && age >= 0 && age <= days * 24) {
            const day = _localDay(e.timeH);
            byDay.set(day, (byDay.get(day) ?? 0) + e.doseMG);
        }
    }
    const doseDays = [...byDay.keys()].sort((a, b) => a - b);
    if (doseDays.length === 0) return 0;
    const latest = doseDays[doseDays.length - 1];
    if (doseDays.length === 1) return byDay.get(latest)!;
    let total = 0;
    for (const mg of byDay.values()) total += mg;
    const meanGapDays = (latest - doseDays[0]) / (doseDays.length - 1);
    return total / doseDays.length / meanGapDays;
}

/**
 * Largest single local-day total dose (mg) within the trailing `days` window for
 * events matching `pred` — i.e. "how much did you take on your heaviest recent
 * day". Used for daily-dosed routes; robust to how much history exists and to
 * window edges (a trailing average would over/under-count depending on where
 * dose times fall).
 */
function _maxDailyDose(events: DoseEvent[], nowH: number, days: number, pred: (e: DoseEvent) => boolean): number {
    const byDay = new Map<number, number>();
    for (const e of events) {
        const age = nowH - e.timeH;
        if (age >= 0 && age <= days * 24 && pred(e)) {
            const day = _localDay(e.timeH);
            byDay.set(day, (byDay.get(day) ?? 0) + e.doseMG);
        }
    }
    let mx = 0;
    for (const v of byDay.values()) if (v > mx) mx = v;
    return mx;
}

/** Injections in the trailing window, with doses split across sites merged into one. */
function _mergedInjections(events: DoseEvent[], nowH: number, days: number, pred: (e: DoseEvent) => boolean) {
    const injections = events
        .filter(e => e.route === Route.injection && pred(e) && nowH - e.timeH >= 0 && nowH - e.timeH <= days * 24)
        .sort((a, b) => a.timeH - b.timeH);
    const merged: { ester: Ester; timeH: number; doseMG: number }[] = [];
    const latest = new Map<Ester, { ester: Ester; timeH: number; doseMG: number }>();
    for (const e of injections) {
        const prev = latest.get(e.ester);
        if (prev && e.timeH - prev.timeH < SPLIT_INJECTION_H) {
            prev.doseMG += e.doseMG;
        } else {
            const m = { ester: e.ester, timeH: e.timeH, doseMG: e.doseMG };
            merged.push(m);
            latest.set(e.ester, m);
        }
    }
    return merged;
}

function _median(xs: number[]): number {
    const v = [...xs].sort((a, b) => a - b);
    const n = v.length;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

/**
 * Cadence of one drug's doses, oldest first: the typical gap between them (the
 * mean of the last four, so a change of schedule shows within a few doses and
 * a Monday/Thursday rhythm reads as 3.5 days), and when its latest run began.
 * A lone gap over twice the usual one is a stop and restart, not part of the
 * rhythm; two or more in a row are a longer schedule. With a single dose the
 * gap is unknowable (null). `earlierRun` spans the run before the latest one,
 * if there was one.
 */
function _cadence(times: number[]): { gapH: number | null; runStartH: number; earlierRun: [number, number] | null } {
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
    if (!gaps.length) return { gapH: null, runStartH: times[0], earlierRun: null };
    const usual = _median(gaps);
    const long = gaps.map(g => g > 2 * usual);
    let runStart = 0;
    let earlierStart = -1;
    const kept: number[] = [];
    gaps.forEach((g, i) => {
        if (long[i] && !long[i - 1] && !long[i + 1]) {
            earlierStart = runStart;
            runStart = i + 1;
        } else {
            kept.push(g);
        }
    });
    const recent = kept.slice(-4);
    return {
        gapH: recent.reduce((a, b) => a + b, 0) / recent.length,
        runStartH: times[runStart],
        earlierRun: earlierStart >= 0 ? [times[earlierStart], times[runStart - 1]] : null,
    };
}

/**
 * Weekly-equivalent dose for an injected family, inferred from the person's own
 * cadence (dose ÷ typical gap between injections). This avoids false alarms right
 * after a long-interval depot (e.g. undecanoate every 10–12 weeks), which a fixed
 * trailing window would wrongly read as a huge weekly rate.
 *
 * Each ester is read at its own cadence, and only while it is still being
 * taken: a regimen counts until two of its gaps pass with no injection, or
 * until another ester with a known cadence starts, or starts again, after its
 * last injection (a switch). Esters taken side by side add up, also when one
 * of them pauses and resumes. An ester needs ≥2 injections to infer a gap; a
 * lone depot's schedule is unknowable, so it adds nothing and does not yet
 * replace the ester before it.
 */
function _injectionWeeklyRate(events: DoseEvent[], nowH: number, pred: (e: DoseEvent) => boolean): number {
    const merged = _mergedInjections(events, nowH, 120, pred);
    const regimens = new Map<Ester, { times: number[]; lastDoseMG: number } & ReturnType<typeof _cadence>>();
    for (const ester of new Set(merged.map(m => m.ester))) {
        const own = merged.filter(m => m.ester === ester);
        const times = own.map(m => m.timeH);
        regimens.set(ester, { times, lastDoseMG: own[own.length - 1].doseMG, ..._cadence(times) });
    }
    let total = 0;
    for (const [ester, r] of regimens) {
        const lastH = r.times[r.times.length - 1];
        if (r.gapH === null || nowH - lastH > 2 * r.gapH) continue;
        let switchedAway = false;
        for (const [other, o] of regimens) {
            if (other === ester || o.gapH === null || o.runStartH <= lastH) continue;
            // Taken during the other ester's earlier run, this one ran beside
            // it, so the other resuming is not a switch away from this one.
            const earlier = o.earlierRun;
            if (earlier && r.times.some(t => t >= earlier[0] && t <= earlier[1])) continue;
            switchedAway = true;
        }
        if (switchedAway) continue;
        total += r.lastDoseMG / (r.gapH / 168); // 168 h = 1 week
    }
    return total;
}

/**
 * A gentle, non-diagnostic heads-up when the *logged doses* run clearly above the
 * usual range. Returns the single most-exceeded family, or null. Not medical advice.
 */
export function getDoseAdvisory(
    events: DoseEvent[],
    nowH: number = Date.now() / (1000 * 60 * 60),
): DoseAdvisory | null {
    if (!events.length) return null;

    const isE2 = (e: DoseEvent) => isEstradiolEster(e.ester);
    const isT = (e: DoseEvent) => isTestosteroneEster(e.ester);

    // Daily-dosed families: heaviest single local day in the trailing 14 days,
    // except CPA, which is averaged over the days it is taken. Testosterone
    // patches can't be logged from the app (see DoseForm), so only gel counts
    // for T.
    const cpaPerDay = _cpaPerDay(events, nowH, 14);
    const e2DailyRatio = _e2DailyRatio(events, nowH, 14);
    const tGelPerDay = _maxDailyDose(events, nowH, 14, e => isT(e) && e.route === Route.gel);

    // Injected families: cadence-inferred weekly rate, plus a single-dose guard for E2.
    const e2InjWk = _injectionWeeklyRate(events, nowH, isE2);
    const tInjWk = _injectionWeeklyRate(events, nowH, isT);
    let e2InjSingle = 0;
    for (const m of _mergedInjections(events, nowH, 30, isE2)) {
        if (m.doseMG > e2InjSingle) e2InjSingle = m.doseMG;
    }

    const cpaRatio = cpaPerDay / DOSE_CEILING.cpaPerDay;
    const e2Ratio = Math.max(e2DailyRatio, e2InjWk / DOSE_CEILING.e2InjPerWeek, e2InjSingle / DOSE_CEILING.e2InjSingle);
    const tRatio = Math.max(tGelPerDay / DOSE_CEILING.tGelPerDay, tInjWk / DOSE_CEILING.tInjPerWeek);

    // Both estrogen and antiandrogen running high at once is a real combination
    // (they're routinely dosed together in transfem regimens) and each carries
    // its own distinct risk, so it takes priority over reporting just one.
    if (e2Ratio > 1 && cpaRatio > 1) return { kind: 'e2_cpa' };

    const checks: { kind: DoseAdvisory['kind']; ratio: number }[] = [
        { kind: 'cpa', ratio: cpaRatio },
        { kind: 'e2', ratio: e2Ratio },
        { kind: 't', ratio: tRatio },
    ];
    const hit = checks.filter(c => c.ratio > 1).sort((a, b) => b.ratio - a.ratio)[0];
    return hit ? { kind: hit.kind } : null;
}

// --- Combined hormone-level advisory (measured labs, not the modelled curve) ---
//
// Unlike getDoseAdvisory (which looks at logged doses), this looks at the
// person's actual lab results. Estradiol and testosterone are usually tracked
// together (many people check both to confirm suppression alongside
// replacement), and both landing low — or both landing high — at once is an
// unusual combination worth a second look, distinct from either hormone being
// off on its own. Thresholds reuse the same bands as the Home status chips.
const HORMONE_LEVEL_THRESHOLDS = {
    e2LowPgMl: 30, // below follicular-phase range
    e2HighPgMl: 300, // Home status chip's "high" cutoff
    tLowNgDl: 50, // well within the typical feminizing-suppression target
    tHighNgDl: 300, // adult male reference range lower bound
} as const;

// The latest E2 and T labs are read together only when drawn this close in time;
// further apart, they describe two different moments.
const HORMONE_PAIR_MAX_GAP_H = 30 * 24;

export interface HormoneLevelAdvisory {
    kind: 'both_low' | 'both_high';
}

/** The latest lab of one hormone, averaged over every lab logged at that same moment. */
function _latestLab(labs: LabResult[], convert: (r: LabResult) => number): { timeH: number; value: number } {
    const timeH = labs.reduce((mx, r) => Math.max(mx, r.timeH), -Infinity);
    const same = labs.filter(r => r.timeH === timeH);
    return { timeH, value: same.reduce((s, r) => s + convert(r), 0) / same.length };
}

/**
 * Compares the most recent estradiol lab against the most recent testosterone
 * lab (independently latest per hormone) and flags when both are low or both
 * are high at once. Requires at least one lab of each hormone, drawn within 30
 * days of each other. Not medical advice.
 */
export function getHormoneLevelAdvisory(results: LabResult[]): HormoneLevelAdvisory | null {
    const e2Labs = results.filter(r => !isT_LabUnit(r.unit));
    const tLabs = results.filter(r => isT_LabUnit(r.unit));
    if (!e2Labs.length || !tLabs.length) return null;

    const latestE2 = _latestLab(e2Labs, r => convertToPgMl(r.concValue, r.unit));
    const latestT = _latestLab(tLabs, r => convertToNgDl(r.concValue, r.unit));
    if (Math.abs(latestE2.timeH - latestT.timeH) > HORMONE_PAIR_MAX_GAP_H) return null;
    const e2 = latestE2.value;
    const t = latestT.value;

    const { e2LowPgMl, e2HighPgMl, tLowNgDl, tHighNgDl } = HORMONE_LEVEL_THRESHOLDS;
    if (e2 < e2LowPgMl && t < tLowNgDl) return { kind: 'both_low' };
    if (e2 > e2HighPgMl && t > tHighNgDl) return { kind: 'both_high' };
    return null;
}

/**
 * Personal E2 calibration estimators. The three learning methods below mirror
 * the calibration models offered by hrt.transmtf.com; they are reimplemented
 * here over the two parameters this PK engine can actually identify from labs:
 * a personal amplitude (Vd/bioavailability) and a personal clearance (half-life).
 *
 *  - 'off'       : no calibration; raw model.
 *  - 'ekf'       : Extended Kalman Filter. Processes labs in time order, keeping
 *                  a running estimate of (log-amplitude, log-clearance) with a
 *                  covariance. Permanent memory (no forgetting). The curve
 *                  follows the posterior median, so labs that match the model
 *                  leave it on them. Amplitude and clearance update through
 *                  independent innovation channels.
 *  - 'ou_kalman' : Ornstein-Uhlenbeck Kalman smoother. Models the log-correction
 *                  as a mean-reverting process; a forward filter + RTS smoother
 *                  yield a time-varying factor that decays toward the model
 *                  between labs (information is nearly gone after ~3 weeks).
 *  - 'mipd'      : Hybrid model-informed precision dosing. MAP fit of amplitude
 *                  and clearance under a population prior with a Student-t
 *                  (robust) likelihood once there are enough labs to tell an
 *                  outlier apart; shrinks to population when data is sparse.
 *  - 'bayes'     : Full Bayes. Original to this app, not one of the transmtf
 *                  models. A Bayesian model average over drift hypotheses that
 *                  contains MIPD (no drift) and OU-Kalman-like memory (drift)
 *                  as special cases, with per-lab noise from the assay, the
 *                  level and the curve's slope at the draw time, and a Laplace
 *                  posterior that gives the forecast a real uncertainty band.
 *                  See `bayesCalibrate`.
 */
