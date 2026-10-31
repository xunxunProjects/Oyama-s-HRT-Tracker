import { aesGcmDecrypt, aesGcmEncrypt, pbkdf2Sha256, randomBytes } from './src/utils/cryptoCompat';
import { MAX_DECOMPRESSED_BACKUP_BYTES, decompressGzipWithLimit } from './src/services/boundedDecompression';

// --- Types & Enums ---

export enum Route {
    sublingual = 'sublingual',
    injection = 'injection',
    patchApply = 'patchApply',
    patchRemove = 'patchRemove',
    gel = 'gel',
    oral = 'oral',
}

export enum Ester {
    E2 = 'E2',
    EB = 'EB',
    EV = 'EV',
    EC = 'EC',
    EN = 'EN',
    EU = 'EU',
    CPA = 'CPA',
    // Anti-androgens and a SERM, as listed on mtf.wiki. None has a level model:
    // see UNMODELLED_DRUGS.
    SPIRO = 'SPIRO', // Spironolactone
    BICA = 'BICA', // Bicalutamide
    MPA = 'MPA', // Medroxyprogesterone acetate
    LEUP = 'LEUP', // Leuprorelin (GnRH agonist)
    TRIP = 'TRIP', // Triptorelin (GnRH agonist)
    RLX = 'RLX', // Raloxifene (SERM)
    // Transmasculine HRT (testosterone) esters
    T = 'T', // Unesterified testosterone (gel / patch base)
    TC = 'TC', // Testosterone Cypionate
    TE = 'TE', // Testosterone Enanthate
    TU = 'TU', // Testosterone Undecanoate
}

// Set of testosterone-based esters (used to route simulation into the T curve).
export const T_ESTERS: ReadonlySet<Ester> = new Set<Ester>([Ester.T, Ester.TC, Ester.TE, Ester.TU]);

export function isTestosteroneEster(e: Ester): boolean {
    return T_ESTERS.has(e);
}

/**
 * Drugs the plan and the log carry with no level model behind them. Their
 * doses are tracked as taken or not and nothing more: the simulation leaves
 * them out, so they draw no curve and add nothing to any estimate.
 */
export const UNMODELLED_DRUGS: ReadonlySet<Ester> = new Set<Ester>([
    Ester.SPIRO,
    Ester.BICA,
    Ester.MPA,
    Ester.LEUP,
    Ester.TRIP,
    Ester.RLX,
]);

/** GnRH agonists: a depot injection every few weeks rather than a daily pill. */
export const GNRH_AGONISTS: ReadonlySet<Ester> = new Set<Ester>([Ester.LEUP, Ester.TRIP]);

const KNOWN_ESTERS: ReadonlySet<string> = new Set<string>(Object.values(Ester));

/**
 * Whether this build knows the drug code. A newer version can log a drug this
 * one has never heard of; the import sanitiser keeps such a dose exactly as
 * stored, so the code reaching here is typed `Ester` but may be none of them.
 */
export function isKnownEster(e: unknown): e is Ester {
    return typeof e === 'string' && KNOWN_ESTERS.has(e);
}

/**
 * A syntactically valid drug code, whether or not this build knows the drug.
 * A newer version can use a code this one has never heard of; storage, sync,
 * and import preserve it exactly rather than rewriting it to a known ester.
 */
export function isDrugCode(e: unknown): e is Ester {
    return typeof e === 'string' && /^[A-Za-z0-9_]{1,24}$/.test(e);
}

/** No level model behind it: one of UNMODELLED_DRUGS, or a code this build doesn't know. */
export function isUnmodelledDrug(e: Ester): boolean {
    return !KNOWN_ESTERS.has(e) || UNMODELLED_DRUGS.has(e);
}

/** An estradiol form, i.e. what feeds the E2 curve: not testosterone, not cyproterone, not an unmodelled drug. */
export function isEstradiolEster(e: Ester): boolean {
    return !T_ESTERS.has(e) && e !== Ester.CPA && !isUnmodelledDrug(e);
}

// HRT mode used by the UI/storage layer. Not persisted inside DoseEvent.
export type HRTMode = 'transfem' | 'transmasc';

export enum ExtraKey {
    concentrationMGmL = 'concentrationMGmL',
    areaCM2 = 'areaCM2',
    releaseRateUGPerDay = 'releaseRateUGPerDay',
    sublingualTheta = 'sublingualTheta',
    sublingualTier = 'sublingualTier',
    gelSite = 'gelSite',
    // Planned wear duration (hours) for a patch application. When set, the patch
    // is treated as removed `patchWearH` hours after it is applied, so a single
    // "apply" event self-completes without a separate "remove" event. An explicit
    // patchRemove event still takes precedence, up to PATCH_MAX_OVERWEAR_H past
    // the planned wear.
    patchWearH = 'patchWearH',
}

enum GelSite {
    arm = 'arm',
    thigh = 'thigh',
    scrotal = 'scrotal',
}

export const GEL_SITE_ORDER = ['arm', 'thigh', 'scrotal'] as const;

export interface DoseEvent {
    id: string;
    route: Route;
    timeH: number; // Hours since 1970
    doseMG: number; // Dose in mg (of the ester/compound), NOT E2-equivalent
    ester: Ester;
    extras: Partial<Record<ExtraKey, number>>;
    // Epoch ms of the last edit, stamped by the app on write. Only cloud sync
    // reads it: when two devices hold the same id with different contents, this
    // is what says which edit came second. Optional because records written
    // before sync existed (and hand-made imports) simply don't have one.
    updatedAt?: number;
}

export interface SimulationResult {
    timeH: number[];
    concPGmL: number[];
    concPGmL_E2: number[];
    concPGmL_CPA: number[];
    // Transmasculine: total testosterone concentration in ng/dL
    concNGdL_T: number[];
    // Area under the E2 curve (pg·h/mL) over the whole grid. Only E2: concPGmL
    // adds CPA converted to pg/mL, a different drug in a unit a thousand times
    // larger, which would swamp it.
    auc: number;
}

// --- Lab Results & Calibration ---

export interface LabResult {
    id: string;
    timeH: number;
    concValue: number; // Value in the user's unit
    // E2 units (transfem) or T units (transmasc). Kept in one field for storage simplicity.
    unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l';
    // How the lab measured it, when the person knows. Immunoassays read
    // estradiol higher than LC-MS/MS at low levels, so a lab compared with the
    // model means more when the method is known. Absent means not sure.
    assay?: LabAssay;
    // Epoch ms of the last edit — see DoseEvent.updatedAt.
    updatedAt?: number;
}

export type LabAssay = 'lcms' | 'immuno';
export const LAB_ASSAYS: readonly LabAssay[] = ['immuno', 'lcms'];
export const isLabAssay = (v: unknown): v is LabAssay => v === 'lcms' || v === 'immuno';

export function convertToPgMl(val: number, unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l'): number {
    if (unit === 'pg/ml') return val;
    if (unit === 'pmol/l') return val / 3.671;
    return val; // ng/dl / nmol/l are T units, not meaningful as pg/mL — caller should filter
}

// Convert a testosterone lab value to ng/dL (transmasc native unit).
export function convertToNgDl(val: number, unit: 'pg/ml' | 'pmol/l' | 'ng/dl' | 'nmol/l'): number {
    if (unit === 'ng/dl') return val;
    if (unit === 'nmol/l') return val * 28.842; // 1 nmol/L T ≈ 28.842 ng/dL
    return val; // pg/ml / pmol/l are E2 units — not meaningful as ng/dL
}

export function isT_LabUnit(unit: LabResult['unit']): boolean {
    return unit === 'ng/dl' || unit === 'nmol/l';
}

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
 */
export type CalibrationMethod = 'off' | 'ekf' | 'ou_kalman' | 'mipd';

/**
 * How newly-added labs are allowed to act on the historical curve.
 *  - 'forward'       : causal filtering — each point in time only uses labs up
 *                      to that moment, so past estimates are never rewritten.
 *  - 'retrospective' : smoothing — all labs (and the final personal fit) are
 *                      used to re-estimate the whole history. More accurate in
 *                      hindsight; a new lab can revise older estimates.
 */
export type CalibrationHistoryMode = 'forward' | 'retrospective';

/** Map legacy stored method ids onto the current estimator set. */
export function normalizeCalibrationMethod(raw: string | null | undefined): CalibrationMethod {
    if (raw === 'off' || raw === 'ekf' || raw === 'ou_kalman' || raw === 'mipd') return raw;
    if (raw === 'average') return 'mipd'; // amplitude-only LS → MAP with prior
    if (raw === 'adaptive') return 'ekf'; // amplitude + clearance fit → EKF
    return 'mipd';
}

/** A single measured-vs-model comparison derived from one E2 lab result. */
export interface CalibrationPoint {
    id: string;
    timeH: number;
    obs: number; // measured E2, converted to pg/mL
    pred: number; // raw model-predicted E2 at the lab time (pg/mL)
    ratio: number; // obs / pred (how far the body runs above/below the model)
}

const clampRatio = (r: number) => Math.max(0.01, Math.min(100, r));

/**
 * Compare each E2 lab result against the raw model prediction at the same time.
 * Returned points power both the calibration factor and the per-lab UI insight.
 * Testosterone-unit labs and points where the model predicts ~0 are excluded
 * (a near-zero prediction means the lab doesn't correspond to the simulated PK
 * state — e.g. a baseline draw before any dose — and would yield an absurd ratio).
 */
export function computeCalibrationPoints(sim: SimulationResult | null, results: LabResult[]): CalibrationPoint[] {
    if (!sim || !results.length) return [];

    const getNearestConc_E2 = (timeH: number): number | null => {
        if (!sim.timeH.length) return null;
        let low = 0;
        let high = sim.timeH.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (sim.timeH[mid] === timeH) return sim.concPGmL_E2[mid];
            if (sim.timeH[mid] < timeH) low = mid;
            else high = mid;
        }
        const idx = Math.abs(sim.timeH[high] - timeH) < Math.abs(sim.timeH[low] - timeH) ? high : low;
        return sim.concPGmL_E2[idx];
    };

    return results
        .filter(r => !isT_LabUnit(r.unit))
        .map(r => {
            const obs = convertToPgMl(r.concValue, r.unit);
            let pred = interpolateConcentration_E2(sim, r.timeH);
            if (pred === null || Number.isNaN(pred)) pred = getNearestConc_E2(r.timeH);
            if (pred === null || pred < 1 || obs <= 0) return null;
            return { id: r.id, timeH: r.timeH, obs, pred, ratio: obs / pred };
        })
        .filter((p): p is CalibrationPoint => !!p)
        .sort((a, b) => a.timeH - b.timeH);
}

/** Geometric mean of the (clamped) lab ratios — the natural average for a multiplicative correction. */
export function geometricMeanRatio(points: CalibrationPoint[]): number {
    if (!points.length) return 1;
    const sumLog = points.reduce((s, p) => s + Math.log(clampRatio(p.ratio)), 0);
    return Math.exp(sumLog / points.length);
}

/** Typical residual of a log-space fit, expressed as a ± percentage (null if undefined). */
function logRmsePct(sse: number, n: number): number | null {
    if (n < 2) return null;
    const rmse = Math.sqrt(sse / n);
    return (Math.exp(rmse) - 1) * 100;
}

/** Outcome of fitting the personal E2 calibration to the user's labs. */
export interface CalibrationResult {
    method: CalibrationMethod;
    /** Scale function r(t): calibrated E2 = model E2(t) * factorFn(t). */
    factorFn: (timeH: number) => number;
    /** Personal amplitude multiplier (bioavailability/Vd correction). */
    scale: number;
    /** Personal clearance multiplier (1 = unchanged; >1 = faster clearance). */
    kMul: number;
    /** Change in elimination half-life vs the model, as a signed percentage. */
    halfLifeDeltaPct: number;
    /** Number of E2 labs used in the fit. */
    n: number;
    /** Typical fit error as ±% (log-space RMSE), or null when not estimable (<2 labs / off). */
    fitErrPct: number | null;
    /** Per-lab measured-vs-model comparison points. */
    points: CalibrationPoint[];
}

// Clearance search bounds for the personal-clearance fit: personal clearance
// stays within 2× of the model in either direction (half-life within [0.5×, 2×]).
const KMUL_MIN = 0.5;
const KMUL_MAX = 2.0;
const KMUL_STEPS = 21;

// Log-space measurement noise of a single E2 lab (assay + draw-timing scatter),
// as a fractional SD (~13%).
const CAL_MEAS_SD = 0.13;
// Population priors (log-space SD) for the personal parameters. Amplitude varies
// a lot between people; clearance less so, and is only identifiable from several
// well-spaced labs.
const CAL_PRIOR_SD_AMP = 0.5; // ≈ ±65% amplitude
const CAL_PRIOR_SD_K = 0.35; // ≈ ±42% clearance
// Minimum labs before personal *clearance* (curve shape) is allowed to move.
// Labs drawn within LAB_CLUSTER_H of each other count once: several draws at
// the same moment say nothing about how fast the level falls, and used to
// invent a half-life change (+27% from three same-hour labs).
const MIN_LABS_FOR_CLEARANCE = 3;
const LAB_CLUSTER_H = 6;
// OU mean-reversion timescale for the dynamic (OU-Kalman) correction.
const OU_TAU_H = 336; // ~2 weeks; ≈63% of info decays per τ
const OU_STAT_SD = 0.5; // stationary SD of the log-correction
const CAL_STUDENT_NU = 4; // Student-t dof for the robust MIPD likelihood

const clampFactor = (x: number) => Math.max(0.01, Math.min(100, x));
// The fitted clearance stays on the grid the curve is drawn from. Clamping
// only to [0.01, 100] let the estimate drift past the grid edge, where the
// predictions stop changing, so the reported kMul and half-life change (shown
// in CalibrationPlot, CalibrationSettings and Forecast) described a curve
// other than the one drawn.
const LOG_KMUL_MIN = Math.log(KMUL_MIN);
const LOG_KMUL_MAX = Math.log(KMUL_MAX);
const clampLogK = (k: number) => Math.max(LOG_KMUL_MIN, Math.min(LOG_KMUL_MAX, k));

/** Whether the first `count` labs are numerous and spread out enough to move clearance. */
function clearanceIdentifiable(labTimes: number[], count: number): boolean {
    // Each cluster is measured from its first lab, so a run of labs a few
    // hours apart still counts once per LAB_CLUSTER_H, not once in all.
    let clusters = 0;
    let anchor = -Infinity;
    for (let i = 0; i < count; i++) {
        if (labTimes[i] - anchor > LAB_CLUSTER_H) {
            clusters++;
            anchor = labTimes[i];
        }
    }
    return clusters >= MIN_LABS_FOR_CLEARANCE;
}

/**
 * Precomputed personal-clearance response. For a grid of clearance multipliers we
 * re-simulate the PK once and record, per lab, the model-predicted log E2. The
 * estimators then evaluate log-pred(amplitude a, log-clearance k) ≈ a + g_i(k),
 * with g_i interpolated across the grid — so fitting needs no further simulation.
 */
interface ClearanceField {
    logK: number[]; // grid knots (ascending), log clearance-mult
    sims: (SimulationResult | null)[]; // sim per knot (baseline reused at k≈0)
    gLog: number[][]; // gLog[knot][lab] = log model E2 at lab time
    baselineSim: SimulationResult;
}

function buildClearanceField(
    baselineSim: SimulationResult,
    events: DoseEvent[],
    bodyWeightKG: number,
    labTimes: number[],
    birthYear: number | null,
): ClearanceField {
    const baseParams = getActivePKParams();
    const logKmin = Math.log(KMUL_MIN);
    const logKmax = Math.log(KMUL_MAX);
    const logK: number[] = [];
    const sims: (SimulationResult | null)[] = [];
    const gLog: number[][] = [];

    for (let j = 0; j < KMUL_STEPS; j++) {
        const lk = logKmin + (logKmax - logKmin) * (j / (KMUL_STEPS - 1));
        const kMul = Math.exp(lk);
        const atUnity = Math.abs(kMul - 1) < 1e-3;
        const sim = atUnity
            ? baselineSim
            : runSimulationWithParams(
                  events,
                  bodyWeightKG,
                  {
                      ...baseParams,
                      e2_kClear: baseParams.e2_kClear * kMul,
                      e2_kClearInj: baseParams.e2_kClearInj * kMul,
                  },
                  birthYear,
              );
        logK.push(lk);
        sims.push(sim);
        const row: number[] = [];
        for (const t of labTimes) {
            let c = sim ? interpolateConcentration_E2(sim, t) : null;
            if (c === null || Number.isNaN(c) || c < 1e-6) {
                const b = interpolateConcentration_E2(baselineSim, t);
                c = b === null || b < 1e-6 ? 1e-6 : b; // fall back to baseline shape
            }
            row.push(Math.log(c));
        }
        gLog.push(row);
    }
    return { logK, sims, gLog, baselineSim };
}

/** Model log-E2 at lab i for log-clearance k (linear interpolation across grid). */
function fieldG(field: ClearanceField, i: number, k: number): number {
    const { logK, gLog } = field;
    const n = logK.length;
    if (k <= logK[0]) return gLog[0][i];
    if (k >= logK[n - 1]) return gLog[n - 1][i];
    let j = 1;
    while (j < n && logK[j] < k) j++;
    const t = (k - logK[j - 1]) / (logK[j] - logK[j - 1]);
    return gLog[j - 1][i] * (1 - t) + gLog[j][i] * t;
}

/**
 * dg_i/dk via local grid slope (Jacobian of the clearance channel). Zero
 * outside the grid, where fieldG is flat, so no estimator is pushed further out.
 */
function fieldGSlope(field: ClearanceField, i: number, k: number): number {
    const { logK, gLog } = field;
    const n = logK.length;
    if (k < logK[0] || k > logK[n - 1]) return 0;
    let j = 1;
    while (j < n - 1 && logK[j] < k) j++;
    return (gLog[j][i] - gLog[j - 1][i]) / (logK[j] - logK[j - 1]);
}

/** Log E2 at `timeH` of the knot-`j` simulation, with fieldG's fallbacks. */
function knotLogConc(field: ClearanceField, j: number, timeH: number): number {
    const sim = field.sims[j];
    let c = sim ? interpolateConcentration_E2(sim, timeH) : null;
    if (c === null || Number.isNaN(c) || c < 1e-6) {
        const b = interpolateConcentration_E2(field.baselineSim, timeH);
        c = b === null || b < 1e-6 ? 1e-6 : b;
    }
    return Math.log(c);
}

/**
 * Log E2 at any time for log-clearance k, interpolated across the knots exactly
 * as fieldG does at the lab times. Snapping to the nearest knot instead drew a
 * curve up to about 5% away from the one that was fitted.
 */
function fieldLogConcAt(field: ClearanceField, k: number, timeH: number): number {
    const { logK } = field;
    const n = logK.length;
    const kc = clampLogK(k);
    let j = 1;
    while (j < n - 1 && logK[j] < kc) j++;
    const w = (kc - logK[j - 1]) / (logK[j] - logK[j - 1]);
    if (w <= 0) return knotLogConc(field, j - 1, timeH);
    if (w >= 1) return knotLogConc(field, j, timeH);
    return knotLogConc(field, j - 1, timeH) * (1 - w) + knotLogConc(field, j, timeH) * w;
}

/** Constant-parameter factor: calibrated = model · scale · (curve_k / baseline). */
function constantFactor(field: ClearanceField, a: number, k: number): (timeH: number) => number {
    const scale = Math.exp(a);
    const atBaseline = Math.abs(k) < 1e-9;
    return (timeH: number) => {
        const b = interpolateConcentration_E2(field.baselineSim, timeH);
        if (b === null || b < 1 || atBaseline) return clampFactor(scale);
        return clampFactor((scale * Math.exp(fieldLogConcAt(field, k, timeH))) / b);
    };
}

/**
 * Piecewise factor for forward (causal) mode: the segment after lab i uses only
 * the parameters learned from labs up to i; before the first lab there is no
 * calibration. Past estimates therefore never change when a later lab is added.
 */
function piecewiseFactor(
    field: ClearanceField,
    labTimes: number[],
    params: { a: number; k: number }[],
): (timeH: number) => number {
    const segFns = params.map(p => constantFactor(field, p.a, p.k));
    return (timeH: number) => {
        if (!labTimes.length || timeH < labTimes[0]) return 1;
        let idx = 0;
        for (let i = 0; i < labTimes.length; i++) {
            if (labTimes[i] <= timeH) idx = i;
            else break;
        }
        return segFns[idx](timeH);
    };
}

interface EstimatorOut {
    factorFn: (timeH: number) => number;
    scale: number;
    kMul: number;
    halfLifeDeltaPct: number;
    fitErrPct: number | null;
}

/**
 * Typical deviation of the labs from the curve actually drawn (model × factor),
 * so it agrees with the plot in every method and history mode. Forecast uses it
 * for its uncertainty band.
 */
function curveFitErrPct(points: CalibrationPoint[], factorFn: (timeH: number) => number): number | null {
    let sse = 0;
    for (const p of points) {
        const r = Math.log(p.obs) - Math.log(p.pred * factorFn(p.timeH));
        sse += r * r;
    }
    return logRmsePct(sse, points.length);
}

/**
 * Extended Kalman Filter over state [log-amplitude, log-clearance], processing
 * the first `count` labs chronologically. Near-zero process noise = permanent
 * memory. Returns the final state, whose amplitude is the posterior median: an
 * earlier Jensen term (adding half the amplitude variance) moved the curve up
 * to about 7% away from labs that matched the model exactly.
 */
function ekfFit(field: ClearanceField, logObs: number[], count: number, allowClearance: boolean) {
    let x0 = 0,
        x1 = 0; // [a, k]
    let p00 = CAL_PRIOR_SD_AMP ** 2;
    let p11 = allowClearance ? CAL_PRIOR_SD_K ** 2 : 1e-8;
    let p01 = 0,
        p10 = 0;
    const R = CAL_MEAS_SD ** 2;
    const q00 = Math.log(1.01) ** 2; // tiny amplitude drift
    const q11 = allowClearance ? Math.log(1.005) ** 2 : 0;

    for (let i = 0; i < count; i++) {
        p00 += q00;
        p11 += q11; // predict (random walk)
        const H0 = 1;
        const H1 = allowClearance ? fieldGSlope(field, i, x1) : 0;
        const innov = logObs[i] - (x0 + fieldG(field, i, x1));
        const ph0 = p00 * H0 + p01 * H1; // P·Hᵀ
        const ph1 = p10 * H0 + p11 * H1;
        const S = H0 * ph0 + H1 * ph1 + R;
        const kg0 = ph0 / S,
            kg1 = ph1 / S; // Kalman gain
        x0 += kg0 * innov;
        x1 = clampLogK(x1 + kg1 * innov);
        // P ← (I − K·H)·P
        const a00 = 1 - kg0 * H0,
            a01 = -kg0 * H1,
            a10 = -kg1 * H0,
            a11 = 1 - kg1 * H1;
        const np00 = a00 * p00 + a01 * p10,
            np01 = a00 * p01 + a01 * p11;
        const np10 = a10 * p00 + a11 * p10,
            np11 = a10 * p01 + a11 * p11;
        p00 = np00;
        p01 = np01;
        p10 = np10;
        p11 = np11;
    }
    return { a: x0, k: x1 };
}

/**
 * Hybrid model-informed MAP fit of [log-amplitude, log-clearance] under a Gaussian
 * population prior, by iteratively reweighted Gauss-Newton over the first
 * `count` labs. Shrinks to the population mean (0,0) when labs are scarce.
 *
 * The likelihood is Student-t (downweighting an outlier) only once there are
 * MIN_LABS_FOR_CLEARANCE labs: with one or two labs nothing can tell an outlier
 * from a real difference, and the redescending Student-t made the fitted level
 * fall as a single lab rose. The robust posterior can have several modes, so
 * the fit starts from several points across the clearance grid and keeps the
 * best.
 */
function mipdFit(field: ClearanceField, logObs: number[], count: number, allowClearance: boolean) {
    const sigma = CAL_MEAS_SD,
        nu = CAL_STUDENT_NU;
    const robust = count >= MIN_LABS_FOR_CLEARANCE;
    const precA = 1 / CAL_PRIOR_SD_AMP ** 2;
    const precK = 1 / CAL_PRIOR_SD_K ** 2;

    // Negative log posterior, up to a constant.
    const objective = (a: number, k: number) => {
        let f = 0.5 * precA * a * a + (allowClearance ? 0.5 * precK * k * k : 0);
        for (let i = 0; i < count; i++) {
            const u = (logObs[i] - (a + fieldG(field, i, k))) / sigma;
            f += robust ? 0.5 * (nu + 1) * Math.log(1 + (u * u) / nu) : 0.5 * u * u;
        }
        return f;
    };

    const solve = (a0: number, k0: number) => {
        let a = a0,
            k = allowClearance ? k0 : 0;
        for (let iter = 0; iter < 50; iter++) {
            let A00 = precA,
                A01 = 0,
                A11 = allowClearance ? precK : 1;
            let b0 = -precA * a,
                b1 = allowClearance ? -precK * k : 0; // prior pulls toward (0,0)
            for (let i = 0; i < count; i++) {
                const r = logObs[i] - (a + fieldG(field, i, k));
                const u = r / sigma;
                const w = robust ? (nu + 1) / (nu + u * u) / (sigma * sigma) : 1 / (sigma * sigma);
                const J1 = allowClearance ? fieldGSlope(field, i, k) : 0;
                A00 += w;
                A01 += w * J1;
                A11 += w * J1 * J1;
                b0 += w * r;
                b1 += w * J1 * r;
            }
            const det = A00 * A11 - A01 * A01;
            if (Math.abs(det) < 1e-12) break;
            const d0 = (A11 * b0 - A01 * b1) / det;
            const d1 = allowClearance ? (A00 * b1 - A01 * b0) / det : 0;
            // Halve the step until the posterior does not get worse.
            const f0 = objective(a, k);
            let t = 1;
            while (t > 1e-4 && objective(a + t * d0, clampLogK(k + t * d1)) > f0 + 1e-12) t /= 2;
            const na = a + t * d0,
                nk = clampLogK(k + t * d1);
            const moved = Math.abs(na - a) + Math.abs(nk - k);
            a = na;
            k = nk;
            if (moved < 1e-7) break;
        }
        return { a, k, f: objective(a, k) };
    };

    const starts = allowClearance ? field.logK.filter((_, j) => j % 5 === 0) : [0];
    let best = solve(0, 0);
    for (const k0 of starts) {
        // Start the amplitude at the median residual for this clearance.
        const res = Array.from({ length: count }, (_, i) => logObs[i] - fieldG(field, i, k0)).sort((x, y) => x - y);
        const cand = solve(res[Math.floor(count / 2)] ?? 0, k0);
        if (cand.f < best.f) best = cand;
    }
    return { a: best.a, k: best.k };
}

/**
 * Ornstein-Uhlenbeck Kalman calibration: the log-correction z(t) is a mean-
 * reverting process, fit by a forward Kalman filter + RTS smoother over the labs.
 * Produces a time-varying factor that relaxes back to the model between/after
 * labs. Forward mode uses the causal filter; retrospective uses the smoother.
 */
function ouCalibrate(points: CalibrationPoint[], historyMode: CalibrationHistoryMode): EstimatorOut {
    const n = points.length;
    const labTimes = points.map(p => p.timeH);
    const m = points.map(p => Math.log(p.obs) - Math.log(p.pred)); // observed log-correction
    const theta = 1 / OU_TAU_H;
    const Pstat = OU_STAT_SD ** 2;
    const R = CAL_MEAS_SD ** 2;

    const zf = new Array(n),
        Pf = new Array(n),
        zPred = new Array(n),
        Ppred = new Array(n);
    for (let i = 0; i < n; i++) {
        if (i === 0) {
            zPred[i] = 0;
            Ppred[i] = Pstat;
        } else {
            const phi = Math.exp(-theta * (labTimes[i] - labTimes[i - 1]));
            zPred[i] = phi * zf[i - 1];
            Ppred[i] = phi * phi * Pf[i - 1] + Pstat * (1 - phi * phi);
        }
        const S = Ppred[i] + R;
        const kg = Ppred[i] / S;
        zf[i] = zPred[i] + kg * (m[i] - zPred[i]);
        Pf[i] = (1 - kg) * Ppred[i];
    }
    const zs = zf.slice(),
        Ps = Pf.slice();
    for (let i = n - 2; i >= 0; i--) {
        const phi = Math.exp(-theta * (labTimes[i + 1] - labTimes[i]));
        const C = (Pf[i] * phi) / Ppred[i + 1];
        zs[i] = zf[i] + C * (zs[i + 1] - zPred[i + 1]);
        Ps[i] = Pf[i] + C * C * (Ps[i + 1] - Ppred[i + 1]);
    }

    const forward = historyMode === 'forward';
    const factorFn = (t: number): number => {
        let z: number;
        if (forward) {
            let j = -1;
            for (let i = 0; i < n; i++) {
                if (labTimes[i] <= t) j = i;
                else break;
            }
            z = j < 0 ? 0 : Math.exp(-theta * (t - labTimes[j])) * zf[j];
        } else if (t <= labTimes[0]) {
            z = Math.exp(-theta * (labTimes[0] - t)) * zs[0];
        } else if (t >= labTimes[n - 1]) {
            z = Math.exp(-theta * (t - labTimes[n - 1])) * zs[n - 1];
        } else {
            let j = 0;
            for (let i = 0; i < n - 1; i++) {
                if (labTimes[i] <= t) j = i;
                else break;
            }
            const D = labTimes[j + 1] - labTimes[j],
                s = t - labTimes[j];
            const sh = Math.sinh(theta * D) || 1; // OU bridge conditional mean
            z = (Math.sinh(theta * (D - s)) * zs[j] + Math.sinh(theta * s) * zs[j + 1]) / sh;
        }
        return clampFactor(Math.exp(z));
    };

    const zUse = forward ? zf : zs;
    let sse = 0;
    for (let i = 0; i < n; i++) {
        const r = m[i] - zUse[i];
        sse += r * r;
    }
    const zRep = zUse[n - 1];
    return {
        factorFn,
        scale: clampFactor(Math.exp(zRep)),
        kMul: 1,
        halfLifeDeltaPct: 0,
        fitErrPct: logRmsePct(sse, n),
    };
}

/**
 * Fit the personal E2 calibration to lab results.
 *
 * `method` selects the estimator (off / EKF / OU-Kalman / Hybrid-MIPD — the
 * learning models mirror those on hrt.transmtf.com). `historyMode` selects how
 * the result is applied across time: 'forward' is causal (past is never
 * rewritten); 'retrospective' uses all labs to re-estimate the whole history.
 *
 * Lab results measure E2 only, so this never affects CPA/T. The returned factorFn
 * is the time-varying multiplier on the baseline E2 curve, so all downstream
 * consumers keep working unchanged.
 */
export function computeCalibration(
    baselineSim: SimulationResult | null,
    events: DoseEvent[],
    bodyWeightKG: number,
    results: LabResult[],
    method: CalibrationMethod = 'mipd',
    historyMode: CalibrationHistoryMode = 'retrospective',
    /** The one `baselineSim` was run with: the clearance grid reruns the model and must match it. */
    birthYear: number | null = null,
): CalibrationResult {
    const points = computeCalibrationPoints(baselineSim, results);
    const identity: CalibrationResult = {
        method,
        factorFn: () => 1,
        scale: 1,
        kMul: 1,
        halfLifeDeltaPct: 0,
        n: points.length,
        fitErrPct: null,
        points,
    };
    if (method === 'off' || !baselineSim || points.length === 0) return identity;

    const n = points.length;
    const logObs = points.map(p => Math.log(p.obs));
    const labTimes = points.map(p => p.timeH);

    // OU-Kalman models a time-varying amplitude correction; no clearance grid needed.
    if (method === 'ou_kalman') {
        const out = ouCalibrate(points, historyMode);
        return { method, ...out, fitErrPct: curveFitErrPct(points, out.factorFn), n, points };
    }

    // EKF and MIPD identify amplitude + clearance; both share the clearance field.
    // Whether clearance may move is decided per prefix of the labs, so in forward
    // mode a later lab never changes the segments before it.
    const field = buildClearanceField(baselineSim, events, bodyWeightKG, labTimes, birthYear);
    const fit = (count: number) =>
        method === 'ekf'
            ? ekfFit(field, logObs, count, clearanceIdentifiable(labTimes, count))
            : mipdFit(field, logObs, count, clearanceIdentifiable(labTimes, count));

    let factorFn: (timeH: number) => number;
    let aRep: number, kRep: number;
    if (historyMode === 'forward') {
        const params = Array.from({ length: n }, (_, i) => fit(i + 1));
        factorFn = piecewiseFactor(field, labTimes, params);
        aRep = params[n - 1].a;
        kRep = params[n - 1].k;
    } else {
        const f = fit(n);
        aRep = f.a;
        kRep = f.k;
        factorFn = constantFactor(field, aRep, kRep);
    }

    const kMul = Math.exp(kRep);
    return {
        method,
        factorFn,
        scale: clampFactor(Math.exp(aRep)),
        kMul,
        halfLifeDeltaPct: (1 / kMul - 1) * 100, // half-life ∝ 1/clearance
        n,
        fitErrPct: curveFitErrPct(points, factorFn),
        points,
    };
}

// --- Compression Utilities ---

export async function decompressData(
    base64: string,
    maxOutputBytes: number = MAX_DECOMPRESSED_BACKUP_BYTES,
): Promise<string> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(await decompressGzipWithLimit(bytes, maxOutputBytes));
}

const CorePK = {
    vdPerKG: 2.0, // L/kg for E2
    vdPerKG_CPA: 14.0, // L/kg for CPA (Cyproterone Acetate, ~986L/70kg)
    kClear: 0.41,
    kClearInjection: 0.041,
    depotK1Corr: 1.0,
};

const EsterInfo = {
    [Ester.E2]: { name: 'Estradiol', mw: 272.38 },
    [Ester.EB]: { name: 'Estradiol Benzoate', mw: 376.5 },
    [Ester.EV]: { name: 'Estradiol Valerate', mw: 356.5 },
    [Ester.EC]: { name: 'Estradiol Cypionate', mw: 396.58 },
    [Ester.EN]: { name: 'Estradiol Enanthate', mw: 384.56 },
    [Ester.EU]: { name: 'Estradiol Undecylate', mw: 440.66 },
    [Ester.CPA]: { name: 'Cyproterone Acetate', mw: 416.94 },
    [Ester.SPIRO]: { name: 'Spironolactone', mw: 416.57 },
    [Ester.BICA]: { name: 'Bicalutamide', mw: 430.37 },
    [Ester.MPA]: { name: 'Medroxyprogesterone Acetate', mw: 386.52 },
    [Ester.LEUP]: { name: 'Leuprorelin', mw: 1209.42 },
    [Ester.TRIP]: { name: 'Triptorelin', mw: 1311.45 },
    [Ester.RLX]: { name: 'Raloxifene', mw: 473.58 },
    // Testosterone esters (MW = parent + ester group)
    [Ester.T]: { name: 'Testosterone', mw: 288.42 },
    [Ester.TC]: { name: 'Testosterone Cypionate', mw: 412.6 },
    [Ester.TE]: { name: 'Testosterone Enanthate', mw: 400.59 },
    [Ester.TU]: { name: 'Testosterone Undecanoate', mw: 456.7 },
};

/** What a dose delivers, in English: the hormone for an estradiol or testosterone ester, otherwise the drug itself. */
export function activeCompoundName(ester: Ester): string {
    if (!isKnownEster(ester)) return ester; // a newer version's drug: its code is all there is to go on
    if (isTestosteroneEster(ester)) return 'Testosterone';
    if (isEstradiolEster(ester)) return 'Estradiol';
    return EsterInfo[ester].name;
}

/**
 * mg of estradiol per mg of the dose as logged (for a testosterone ester, mg of
 * testosterone), from molecular weights. 1 for estradiol itself and for drugs
 * with no estradiol in them, cyproterone included.
 */
export function getToE2Factor(ester: Ester): number {
    if (ester === Ester.E2) return 1.0;
    // No estradiol in these (or nothing known about them): a dose stays the number it was typed as.
    if (isUnmodelledDrug(ester) || ester === Ester.CPA) return 1.0;
    if (isTestosteroneEster(ester)) {
        // "to‑T" factor: mg of ester → mg of free testosterone
        return EsterInfo[Ester.T].mw / EsterInfo[ester].mw;
    }
    return EsterInfo[Ester.E2].mw / EsterInfo[ester].mw;
}

// -----------------------------------------------------------------------------
// Transmasculine (testosterone) PK parameters
// -----------------------------------------------------------------------------
//
// Gel and injection levels are checked at 70 kg against the labels cited
// where their parameters are set (tests/literature.test.ts). Label populations
// are mostly heavier than that; one weight for every route keeps the routes
// consistent with each other.
//   - Androgel 50 mg/day → C_avg ≈ 555 ng/dL (AndroGel 1% label)
//   - Androderm 5 mg/day patch → C_avg ≈ 500–700 ng/dL
//   - TC / TE / TU injection levels: see DEFAULT_PK_PARAMS.t_ff_TE
//   - TU curve shape: see T_DepotPK
// These are research/teaching estimates; they are NOT for individual dosing decisions.
//
const T_CorePK = {
    vdPerKG: 1.0, // L/kg for total testosterone (apparent)
    kClear: 0.5, // h⁻¹ — fast native T clearance (gel / patch / oral)
    kClearInjection: 0.035, // h⁻¹ — effective clearance used with the flip‑flop depot model
};

// Two-part depot absorption (fast + slow library), analogous to the E2 injection model.
//
// Undecanoate has a single depot. The Nebido label
// (https://www.rxreasoner.com/monographs/nebido/pharmacology) gives a peak
// 7 days after a first 1000 mg injection, a release half-life of 90 ± 40 days,
// and at steady state on 1000 mg every 10 weeks a peak of about 37 nmol/L and a
// trough of about 16 nmol/L, a trough/peak ratio of 0.43. A 50 day release
// half-life, at the low end of the label's range, gives that ratio. That
// depot on its own, or with the hydrolysis step at the other esters' 0.20/h,
// peaks at about day 5; slowing the step (T_EsterPK.k2) to about the injection
// clearance rate (DEFAULT_PK_PARAMS.t_kClearInj) moves the peak to day 7, the
// label's and Aveed's median, and changes levels by under 2%. That step stands
// for whatever delays the rise in the label data and was fitted to it, not
// measured on its own. The older parameters peaked at about 3 days and fell to
// a trough of 0.17 of the peak.
const T_DepotPK = {
    Frac_fast: { [Ester.TC]: 0.35, [Ester.TE]: 0.4, [Ester.TU]: 0 },
    // Fast library k1 (h⁻¹) — controls Tmax/Cmax
    k1_fast: { [Ester.TC]: 0.025, [Ester.TE]: 0.035, [Ester.TU]: Math.LN2 / (50 * 24) },
    // Slow library k1 (h⁻¹) — controls terminal tail (flip‑flop)
    k1_slow: { [Ester.TC]: 0.005, [Ester.TE]: 0.008, [Ester.TU]: Math.LN2 / (50 * 24) },
};

// Hydrolysis rate (k2) for T esters in the 3-compartment analytical path.
// Kept much larger than the slow‑library k1 so terminal kinetics are flip‑flop.
// Undecanoate: see T_DepotPK.
const T_EsterPK = {
    k2: { [Ester.TC]: 0.2, [Ester.TE]: 0.2, [Ester.TU]: 0.036 },
};

const T_GelPK = {
    k1: 0.05, // h⁻¹ (Tmax ≈ a few hours after application)
    // Bioavailability (F) is site-dependent — see DEFAULT_PK_PARAMS.t_gel_*.
};

const T_PatchPK = {
    k1: 0.03, // h⁻¹ — used only if no nominal µg/day release is provided
    F: 1.0, // zero‑order input uses the nominal release rate directly
};

const TwoPartDepotPK = {
    Frac_fast: {
        [Ester.EB]: 0.9,
        [Ester.EV]: 0.4,
        [Ester.EC]: 0.229164549,
        [Ester.EN]: 0.05,
        [Ester.EU]: 0.08,
        [Ester.E2]: 1.0,
    },
    k1_fast: {
        [Ester.EB]: 0.144,
        [Ester.EV]: 0.0216,
        [Ester.EC]: 0.005035046,
        [Ester.EN]: 0.001,
        [Ester.EU]: 0.006,
        [Ester.E2]: 0.5,
    }, // Added non-zero k1 for E2
    k1_slow: {
        [Ester.EB]: 0.114,
        [Ester.EV]: 0.0138,
        [Ester.EC]: 0.004510574,
        [Ester.EN]: 0.005,
        [Ester.EU]: 0.0022,
        [Ester.E2]: 0,
    },
};

const InjectionPK = {
    formationFraction: {
        [Ester.EB]: 0.1092,
        [Ester.EV]: 0.0623,
        [Ester.EC]: 0.1173,
        [Ester.EN]: 0.12,
        [Ester.EU]: 0.04,
        [Ester.E2]: 1.0,
    },
};

const EsterPK = {
    k2: { [Ester.EB]: 0.09, [Ester.EV]: 0.07, [Ester.EC]: 0.045, [Ester.EN]: 0.015, [Ester.EU]: 0.012, [Ester.E2]: 0 },
};

const OralPK = {
    kAbsE2: 0.32,
    kAbsEV: 0.05,
    // Swallowed estradiol mostly reaches the blood as estrone and estrone
    // sulfate, a large pool that turns back into estradiol over many hours, so
    // after an oral dose estradiol peaks late and falls slowly. Without this
    // step the model fell with the 2.2 h half-life of kAbsE2 and dropped to
    // almost nothing between daily doses. The pool's rate is set from the
    // estradiol half-life measured after oral estradiol valerate, 14.36 h
    // fasting (Zhang et al. 2024, Table 2, PMC11246651); that study's median
    // Tmax of 10 h and Cmax/AUC of 0.034/h are what the chain then gives
    // (10.3 h, 0.032/h). Oral EV already falls at kAbsEV (13.9 h) and is left
    // as it was, so it peaks earlier than E2 (about 6 h). Total exposure is
    // unchanged: F·D/k3 whatever the rates.
    //
    // The peak runs late against other data. 10 h is the fasting arm; the same
    // study's fed arm peaked at 2 to 2.25 h. A single 1 mg tablet of plain E2
    // peaks at a median of 6 h (Activella label) and was still rising at 8 h in
    // Doll 2022, but at steady state the Angeliq label gives a median of about
    // 2 h, where the chain peaks at 8.5 h. Sending part of the dose straight
    // to the blood cannot fit both single-dose and steady-state data, so the
    // shape is left to timed lab results (tests/literature.test.ts, known gaps).
    kE1Pool: Math.LN2 / 14.36,
    bioavailability: 0.03,
    kAbsSL: 1.8,
};

// Define deterministic order for mapping integer tiers (0-3)   to keys
export const SL_TIER_ORDER = ['quick', 'casual', 'standard', 'strict'] as const;

export const SublingualTierParams = {
    quick: { theta: 0.01, hold: 2 },
    casual: { theta: 0.04, hold: 5 },
    standard: { theta: 0.11, hold: 10 },
    strict: { theta: 0.18, hold: 15 },
};

// --- PK Custom Parameters ---

export interface PKCustomParams {
    // E2 elimination rates
    e2_kClear: number; // non-injection h⁻¹ (default: 0.41)
    e2_kClearInj: number; // injection h⁻¹ (default: 0.041)
    // E2 injection formation fractions (active E2 per mg ester)
    e2_ff_EB: number; // Estradiol Benzoate (default: 0.1092)
    e2_ff_EV: number; // Estradiol Valerate (default: 0.0623)
    e2_ff_EC: number; // Estradiol Cypionate (default: 0.1173)
    e2_ff_EN: number; // Estradiol Enanthate (default: 0.12)
    e2_ff_EU: number; // Estradiol Undecylate (default: 0.040)
    // E2 oral/sublingual
    e2_oral_bio: number; // oral bioavailability fraction (default: 0.03)
    e2_sl_quick: number; // SL theta — quick tier (default: 0.01)
    e2_sl_casual: number; // SL theta — casual tier (default: 0.04)
    e2_sl_standard: number; // SL theta — standard tier (default: 0.11)
    e2_sl_strict: number; // SL theta — strict tier (default: 0.18)
    // E2 gel bioavailability per site
    e2_gel_arm: number; // Arm (default: 0.05)
    e2_gel_thigh: number; // Thigh (default: 0.05)
    e2_gel_scrotal: number; // Scrotal (default: 0.25)
    // Testosterone elimination rates
    t_kClear: number; // non-injection h⁻¹ (default: 0.5)
    t_kClearInj: number; // injection h⁻¹ (default: 0.035)
    // T injection formation fractions
    t_ff_TC: number; // Testosterone Cypionate (default: 0.043)
    t_ff_TE: number; // Testosterone Enanthate (default: 0.043)
    t_ff_TU: number; // Testosterone Undecanoate (default: 0.043)
    // T gel bioavailability per site (arm/thigh ~AndroGel-like; scrotal skin is
    // markedly more permeable — see DEFAULT_PK_PARAMS comment for sources)
    t_gel_arm: number; // Arm (default: 0.10)
    t_gel_thigh: number; // Thigh (default: 0.10)
    t_gel_scrotal: number; // Scrotal (default: 0.50)
}

export const DEFAULT_PK_PARAMS: PKCustomParams = {
    e2_kClear: 0.41,
    e2_kClearInj: 0.041,
    e2_ff_EB: 0.1092,
    e2_ff_EV: 0.0623,
    e2_ff_EC: 0.1173,
    e2_ff_EN: 0.12,
    e2_ff_EU: 0.04,
    e2_oral_bio: 0.03,
    e2_sl_quick: 0.01,
    e2_sl_casual: 0.04,
    e2_sl_standard: 0.11,
    e2_sl_strict: 0.18,
    // Arm/thigh: ~5% of the applied dose arriving as circulating estradiol.
    // Back-calculated from the labels' own steady-state serum levels, because no
    // US estradiol gel label states a percentage at all — Divigel (NDA 022038)
    // and EstroGel (NDA 021166) both describe absorption only qualitatively.
    // Divigel 0.25/0.5/1.0 mg/day gives Cavg 9.8/21/30.5 pg/mL and EstroGel
    // 0.75 mg/day gives 28.3 pg/mL; this model reproduces those at F = 0.039–
    // 0.058 across 65–70 kg (mean 0.050). Those label figures are uncorrected for
    // baseline, so they are upper bounds and the true value likely sits nearer
    // 0.04. Treat 0.05 as one significant figure: Divigel reports %CV of 81–149%.
    //
    // The widely quoted "10%" is a DIFFERENT QUANTITY and must not be pasted in
    // here. It is the fraction crossing skin under the manufacturer's large-area
    // technique (Oestrogel SmPC, 750 cm² whole arm; Wikipedia "Pharmacokinetics
    // of estradiol" carries the same 10% via Sitruk-Ware 1989, for alcoholic
    // estradiol solutions as a class). Besins states 5–6% "Bioverfügbarkeit" for
    // the identical 0.06% gel in the German Gynokadin Fachinformation, off the
    // same 60–80 pg/mL serum data. F enters linearly and exactly once, so 0.10
    // doubles every predicted level — and because users titrate against the
    // prediction, an F that is 2x high pushes real doses toward under-treatment.
    //
    // Järvinen et al. 1999 (Maturitas) cannot establish this number and should
    // not be cited for it: "61% of tablet / 109% of patch" are RELATIVE
    // bioavailabilities. The patch arm does corroborate the magnitude, though —
    // 1.09 × 50 µg/day delivered from 1.5 mg applied works out to ~3.6%.
    //
    // Scrotal/genital: ~5x arm/thigh, extrapolated from scrotal E2
    // patch data (Premoli et al. 2005) and scrotal T gel data, since no direct
    // human study of scrotal E2 gel exists (see transfemscience.org/articles/genital-e2-application/).
    e2_gel_arm: 0.05,
    e2_gel_thigh: 0.05,
    e2_gel_scrotal: 0.25,
    t_kClear: 0.5,
    t_kClearInj: 0.035,
    // One formation fraction per mg of testosterone for all three esters: two
    // labels for different esters land on the same value at 70 kg.
    //   - Xyosted (enanthate, subcutaneous, weekly) label, week 12, N = 137:
    //     Cavg 553 ng/dL (https://medlibrary.org/lib/rx/meds/xyosted/page/4/).
    //     Doses were titrated; the FDA clinical pharmacology review gives
    //     25 men on 50 mg, 93 on 75 mg and 19 on 100 mg, a mean of 73.9 mg/week
    //     (https://www.accessdata.fda.gov/drugsatfda_docs/nda/2019/209863Orig1s000ClinPharmR.pdf).
    //     0.043 gives 555 ng/dL on 73.9 mg/week.
    //   - Aveed (undecanoate 750 mg at weeks 0 and 4, then every 10 weeks)
    //     label, after the third injection, N = 117: Cavg 495 ng/dL
    //     (https://medlibrary.org/lib/rx/meds/aveed/page/6/). 0.043 gives 503.
    // 100 mg/week of cypionate or enanthate then averages about 730–750 ng/dL.
    // The old value, 0.025, put 100 mg/week at about 430 ng/dL, under the 600
    // this file used to state as its target, and gave about 0.6 of both labels.
    // The Azmiro (cypionate 200 mg IM) label reports less, but its values are
    // baseline-corrected after a dose that suppresses the men's own
    // testosterone, which understates the dose's share; tests/literature.test.ts
    // keeps it as a lower bound.
    // Fitting at 70 kg may read low. Aveed's label also splits by weight:
    // Cavg 568 ng/dL at 65–100 kg and 426 at 100 kg or more, a ratio that
    // matches the model's 1/weight scaling for group means near 85 and 113 kg.
    // Fitted at those weights the fraction would be about 0.055–0.06, so a
    // 70 kg person's real level may be about 1.3–1.4x what the model shows;
    // Spratt et al. (tests/literature.test.ts) point the same way. 70 kg is
    // kept, as for gel, until timed lab results say how far to move it.
    t_ff_TC: 0.043,
    t_ff_TE: 0.043,
    t_ff_TU: 0.043,
    // Arm/thigh: ~10% absolute bioavailability, matching AndroGel/Testim FDA
    // labeling. Scrotal: scrotal skin is ~5–8x more permeable to androgens than
    // arm/thigh skin (Iyer et al. 2017, Andrology; Kuhnert et al. 2005) — 0.50
    // uses the conservative end of that range rather than the full 8x.
    t_gel_arm: 0.1,
    t_gel_thigh: 0.1,
    t_gel_scrotal: 0.5,
};

/**
 * Bounds for the user-supplied numbers that feed the simulation.
 *
 * Finiteness alone is not enough. Body weight sets the distribution volume, so
 * `weight: 1e-9` — which passes a bare `> 0` check, whether typed in or
 * imported — divides a normal dose into a reading of ~1.2e13 pg/mL. A dose of
 * 1e12 mg does the same from the other side, and a timestamp far outside the
 * app's lifetime dilutes the simulation grid across geological time.
 */
export const BODY_WEIGHT_KG_MIN = 20;
export const BODY_WEIGHT_KG_MAX = 400;
export const DOSE_MG_MAX = 10000;
/** Hours since 1970: 1970-01-01 through roughly the year 2140. */
export const EVENT_TIME_H_MIN = 0;
export const EVENT_TIME_H_MAX = 1_500_000;

export function isPlausibleBodyWeightKG(kg: number): boolean {
    return Number.isFinite(kg) && kg >= BODY_WEIGHT_KG_MIN && kg <= BODY_WEIGHT_KG_MAX;
}

/**
 * Year of birth, for the age adjustment below. It is optional: none (null)
 * leaves the model as it was. Anything outside 1900 to the current year, typed
 * in or imported, is read as none.
 */
export const BIRTH_YEAR_MIN = 1900;

export function isPlausibleBirthYear(year: unknown, nowYear = new Date().getFullYear()): year is number {
    return typeof year === 'number' && Number.isInteger(year) && year >= BIRTH_YEAR_MIN && year <= nowYear;
}

// -----------------------------------------------------------------------------
// Age
// -----------------------------------------------------------------------------
//
// Clearance of estradiol and testosterone falls with age. With a year of birth
// the clearance rate k3 is scaled log-linearly in age, relative to the mean age
// of the people the defaults were fitted on: 54.2 years in Aveed's trial and
// 53.8 in AndroGel 1.62%'s (labels, section 14), and 54.0 in the
// postmenopausal women behind the oral estrone pool (Zhang et al. 2024,
// Table 1, PMC11246651). At 54 nothing changes, and no year of birth reads as 54.
//
//   - Testosterone: Coviello et al. 2006 (J Clin Endocrinol Metab 91:4669,
//     PMID 16912120) suppressed men's own production with a GnRH agonist and
//     gave weekly testosterone enanthate. Apparent clearance was 1821 L/day at
//     19–35 and 1390 L/day at 59–75, about 0.68% a year between the groups'
//     midpoints. Wang et al. 2004 (PMID 15181080) measured their own
//     testosterone's clearance 36% lower in middle-aged men than in young men.
//   - Estradiol: Longcope 1971 (Am J Obstet Gynecol 111:778) measured
//     clearance in five women aged 70–88 about 25% below young women's, about
//     0.55% a year taking the young women as 27 (the abstract gives no ages).
//     The evidence is weaker than for testosterone. In postmenopausal women aged
//     46–90, Longcope et al. 1980 (Maturitas 2:283, PMID 7231200) found no trend
//     with age, and put the lower clearance after menopause down to the low
//     estradiol levels then; Järvinen et al. 2004 (PMID 15036491) found no
//     significant difference in oral estradiol valerate kinetics between women
//     under 60 and over 65.
//
// Outside 19–75, the ages the testosterone study covered, the multiplier
// holds at its end value. Cyproterone, the absorption rates and the oral
// estrone pool are left as they are. Lab results still correct estradiol from
// here: the calibration's personal clearance starts from the adjusted model.
export const AGE_REF_YEARS = 54;
const AGE_RANGE_YEARS = [19, 75] as const;
const AGE_CLEARANCE_SLOPE = {
    t: Math.log(1821 / 1390) / (67 - 27),
    e2: Math.log(1 / 0.75) / (79 - 27),
};
const HOURS_PER_YEAR = 365.2425 * 24;

/** Age in years at `timeH` (hours since 1970), taking the middle of the year of birth. */
export function ageAtH(birthYear: number, timeH: number): number {
    return 1970 + timeH / HOURS_PER_YEAR - (birthYear + 0.5);
}

/** Multiplier on the clearance of free estradiol or testosterone at `timeH`; 1 with no year of birth. */
export function ageClearanceMultiplier(hormone: 'e2' | 't', birthYear: number | null, timeH: number): number {
    if (birthYear === null) return 1;
    const [lo, hi] = AGE_RANGE_YEARS;
    const age = Math.min(hi, Math.max(lo, ageAtH(birthYear, timeH)));
    return Math.exp(-AGE_CLEARANCE_SLOPE[hormone] * (age - AGE_REF_YEARS));
}

/**
 * Accepted range per parameter, mirroring the clamps the settings screen applies
 * as you type. Kept here, next to the defaults, because the settings screen is
 * not the only writer: an imported backup file can carry a `pkParams` block too,
 * and that path had no validation at all.
 */
export const PK_PARAM_RANGES: Record<keyof PKCustomParams, readonly [number, number]> = {
    e2_kClear: [0.001, 5],
    e2_kClearInj: [0.001, 1],
    e2_ff_EB: [0, 1],
    e2_ff_EV: [0, 1],
    e2_ff_EC: [0, 1],
    e2_ff_EN: [0, 1],
    e2_ff_EU: [0, 1],
    e2_oral_bio: [0, 1],
    e2_sl_quick: [0, 1],
    e2_sl_casual: [0, 1],
    e2_sl_standard: [0, 1],
    e2_sl_strict: [0, 1],
    e2_gel_arm: [0, 1],
    e2_gel_thigh: [0, 1],
    e2_gel_scrotal: [0, 1],
    t_kClear: [0.001, 5],
    t_kClearInj: [0.001, 1],
    t_ff_TC: [0, 1],
    t_ff_TE: [0, 1],
    t_ff_TU: [0, 1],
    t_gel_arm: [0, 1],
    t_gel_thigh: [0, 1],
    t_gel_scrotal: [0, 1],
};

/**
 * Defaults this file used to ship. The settings page saves every field, so a
 * stored value equal to a former default was, in all likelihood, never chosen
 * by anyone; it is read as the current default, or a corrected default would
 * never reach a person who once pressed Save. The same goes for that value
 * typed on the page now; any other, such as 0.0251, is used as typed.
 */
const PK_FORMER_DEFAULTS: Partial<Record<keyof PKCustomParams, number[]>> = {
    t_ff_TC: [0.025],
    t_ff_TE: [0.025],
    t_ff_TU: [0.025],
};

/**
 * Clamp an untrusted parameter blob into a usable model.
 *
 * Anything non-numeric, NaN, Infinity or unrecognised is dropped back to the
 * default rather than carried through: an elimination rate of 0 or a negative
 * one turns decay into growth, and a single NaN propagates to every displayed
 * concentration. A former default is read as the current one (see
 * PK_FORMER_DEFAULTS). Returns null when nothing usable was supplied.
 */
export function sanitizePKParams(raw: unknown): PKCustomParams | null {
    if (!raw || typeof raw !== 'object') return null;
    const src = raw as Record<string, unknown>;
    const out: PKCustomParams = { ...DEFAULT_PK_PARAMS };
    let recognised = 0;
    for (const key of Object.keys(PK_PARAM_RANGES) as (keyof PKCustomParams)[]) {
        if (!(key in src)) continue;
        // Only a number, or a string spelling one. Number() alone reads null,
        // '', false and [] as 0, which the clamp below would turn into each
        // parameter's minimum (an elimination rate 400 times too slow).
        const rawValue = src[key];
        const value =
            typeof rawValue === 'number'
                ? rawValue
                : typeof rawValue === 'string' && rawValue.trim() !== ''
                  ? Number(rawValue)
                  : NaN;
        if (!Number.isFinite(value)) continue;
        recognised++;
        if (PK_FORMER_DEFAULTS[key]?.includes(value)) continue;
        const [min, max] = PK_PARAM_RANGES[key];
        out[key] = Math.min(max, Math.max(min, value));
    }
    return recognised > 0 ? out : null;
}

let _activePKParams: PKCustomParams = { ...DEFAULT_PK_PARAMS };

/**
 * Single choke point for user-supplied parameters — sanitised here so no caller
 * can poison the model, whatever route the blob arrived by.
 */
export function applyPKOverrides(params: PKCustomParams | null): void {
    _activePKParams = sanitizePKParams(params) ?? { ...DEFAULT_PK_PARAMS };
}

/** Snapshot of the currently-active (merged) PK parameters. */
export function getActivePKParams(): PKCustomParams {
    return { ..._activePKParams };
}

/**
 * Run a simulation with an explicit parameter set, restoring the previously
 * active parameters afterwards. Used by the adaptive calibration to evaluate
 * candidate personal-PK fits without disturbing the live simulation's params.
 */
export function runSimulationWithParams(
    events: DoseEvent[],
    bodyWeightKG: number,
    params: PKCustomParams,
    birthYear: number | null = null,
): SimulationResult | null {
    const saved = _activePKParams;
    _activePKParams = { ...DEFAULT_PK_PARAMS, ...params };
    try {
        return runSimulation(events, bodyWeightKG, birthYear);
    } finally {
        _activePKParams = saved;
    }
}

// Internal helpers
function _getSLTheta(tierKey: string): number {
    const p = _activePKParams;
    if (tierKey === 'quick') return p.e2_sl_quick;
    if (tierKey === 'casual') return p.e2_sl_casual;
    if (tierKey === 'strict') return p.e2_sl_strict;
    return p.e2_sl_standard;
}

/**
 * θ for a custom sublingual hold time in minutes, interpolated between the
 * tiers as currently in effect (custom PK parameters included). Below the
 * shortest tier the line runs on down to θ = 0. Past the longest tier θ follows
 * the dissolution-and-swallowing model the tiers were computed from, which
 * levels off as the dissolved drug runs out (about 0.34 at 30 minutes and 0.45
 * at 60 with the default tiers); the straight line used to run on to 0.81 at
 * 60 minutes.
 */
export function sublingualThetaFromHold(holdMin: number): number {
    if (!(holdMin > 0)) return 0;
    const pts = _slHoldPoints();
    const h = Math.max(1, holdMin);
    const last = pts[pts.length - 1];
    if (h >= last.hold) return _slThetaPastTiers(h, last);
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (h >= p1.hold && h <= p2.hold) {
            const t = (h - p1.hold) / (p2.hold - p1.hold || 1);
            return Math.min(1, Math.max(0, p1.theta + (p2.theta - p1.theta) * t));
        }
    }
    const slope = (pts[1].theta - pts[0].theta) / (pts[1].hold - pts[0].hold || 1);
    return Math.min(1, Math.max(0, pts[0].theta + (h - pts[0].hold) * slope));
}

/**
 * The hold time in minutes behind a stored custom θ, for showing it again: the
 * inverse of sublingualThetaFromHold, up to the 60 minutes the dose form
 * offers. A θ no hold of 60 minutes or less reaches (one saved while the
 * straight line still ran on) shows as 60.
 */
export function sublingualHoldFromTheta(theta: number): number {
    const pts = _slHoldPoints();
    const last = pts[pts.length - 1];
    if (theta > last.theta) {
        if (theta >= _slThetaPastTiers(SL_MAX_HOLD_MIN, last)) return SL_MAX_HOLD_MIN;
        let lo = last.hold;
        let hi = SL_MAX_HOLD_MIN;
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (_slThetaPastTiers(mid, last) < theta) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (theta >= Math.min(p1.theta, p2.theta) && theta <= Math.max(p1.theta, p2.theta)) {
            const t = (theta - p1.theta) / (p2.theta - p1.theta || 1);
            return p1.hold + (p2.hold - p1.hold) * t;
        }
    }
    const slope = (pts[1].hold - pts[0].hold) / (pts[1].theta - pts[0].theta || 1);
    return Math.max(1, pts[0].hold + (theta - pts[0].theta) * slope);
}

const SL_MAX_HOLD_MIN = 60;

/**
 * Fraction of a sublingual dose absorbed through the mucosa within a hold of
 * `holdMin` minutes, from the model in Algorithm Explanation §6.2 (middle
 * scenario): the tablet dissolves with a 5-minute half-life, and dissolved
 * drug is absorbed at k_SL = 1.8 h⁻¹ or swallowed at 1.8 h⁻¹. It gives 0.007,
 * 0.038, 0.112 and 0.189 at the tiers' 2, 5, 10 and 15 minutes (the tiers round
 * these to 0.01, 0.04, 0.11 and 0.18) and tends to k_SL / (k_SL + k_sw) = 0.5.
 */
function _slThetaModel(holdMin: number): number {
    const kDiss = Math.LN2 / (5 / 60);
    const kOut = OralPK.kAbsSL + 1.8;
    const T = holdMin / 60;
    return (
        ((OralPK.kAbsSL * kDiss) / (kDiss - kOut)) *
        ((1 - Math.exp(-kOut * T)) / kOut - (1 - Math.exp(-kDiss * T)) / kDiss)
    );
}

/** θ past the longest tier: the model's curve, scaled to meet that tier's θ as in effect. */
function _slThetaPastTiers(holdMin: number, last: { hold: number; theta: number }): number {
    return Math.min(1, (last.theta * _slThetaModel(holdMin)) / _slThetaModel(last.hold));
}

function _slHoldPoints(): { hold: number; theta: number }[] {
    return SL_TIER_ORDER.map(k => ({ hold: SublingualTierParams[k].hold, theta: _getSLTheta(k) })).sort(
        (a, b) => a.hold - b.hold,
    );
}

function _getE2InjFF(ester: Ester): number {
    const p = _activePKParams;
    if (ester === Ester.EB) return p.e2_ff_EB;
    if (ester === Ester.EV) return p.e2_ff_EV;
    if (ester === Ester.EC) return p.e2_ff_EC;
    if (ester === Ester.EN) return p.e2_ff_EN;
    if (ester === Ester.EU) return p.e2_ff_EU;
    if (ester === Ester.E2) return InjectionPK.formationFraction[Ester.E2];
    return 0.08;
}

function _getGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.e2_gel_arm;
    if (siteKey === 'thigh') return p.e2_gel_thigh;
    if (siteKey === 'scrotal') return p.e2_gel_scrotal;
    return p.e2_gel_arm;
}

function _getTGelBio(siteKey: string): number {
    const p = _activePKParams;
    if (siteKey === 'arm') return p.t_gel_arm;
    if (siteKey === 'thigh') return p.t_gel_thigh;
    if (siteKey === 'scrotal') return p.t_gel_scrotal;
    return p.t_gel_arm;
}

function _getTInjFF(ester: Ester): number {
    const p = _activePKParams;
    if (ester === Ester.TC) return p.t_ff_TC;
    if (ester === Ester.TE) return p.t_ff_TE;
    if (ester === Ester.TU) return p.t_ff_TU;
    return DEFAULT_PK_PARAMS.t_ff_TE;
}

// Oral cyproterone acetate, from the Androcur 50 mg SmPC, section 5.2
// (https://www.medicines.org.uk/emc/product/15996/smpc/print): bioavailability
// 88%; two 50 mg tablets give "maximum serum levels of about 285 ng/ml at about
// 3 hours"; terminal half-life 43.9 h; total clearance 3.5 ml/min/kg.
//
// Absorbed at ka, it then leaves the blood in two phases, so the response to
// the absorbed amount, read through the 14 L/kg volume the CPA curve uses, is
// (wFast·e^(−αt) + wSlow·e^(−βt)) / V. The integral of the bracket, wFast/α + wSlow/β, is V/CL
// = 14 / (0.0035·60) = 66.7 h, which fixes total exposure at the label's
// clearance. ka = 0.5/h and α = 0.25/h (a 2.8 h first phase) put the peak at 3 h,
// and wFast is the weight that makes it 285 ng/mL; about a third of the exposure
// is in the first phase. The model used to put the whole dose straight into the
// slow phase with F = 0.7, which kept total exposure near (0.7x) but made the
// 100 mg peak about 67 ng/mL.
//
// All of this is single-dose data. Low doses likely read low: the Dianette
// (Diane-35) label gives 15 ng/mL at 1.6 h after 2 mg
// (https://www.medicines.org.uk/emc/product/1122/smpc), where the model peaks
// at about 5.7 ng/mL at 3 h at 70 kg, and a linear model fitted to 100 mg
// cannot follow both.
// Levels on daily dosing have not been checked against multiple-dose studies.
const CPA_ORAL = (() => {
    const alpha = 0.25;
    const beta = Math.LN2 / 43.9;
    const wFast = 5.2786;
    const exposureH = 14 / (0.0035 * 60);
    return { F: 0.88, ka: 0.5, alpha, beta, wFast, wSlow: (exposureH - wFast / alpha) * beta };
})();
const CPA_ORAL_F = CPA_ORAL.F;

export function getBioavailabilityMultiplier(
    route: Route,
    ester: Ester,
    extras: Partial<Record<ExtraKey, number>> = {},
): number {
    const mwFactor = getToE2Factor(ester);

    // Cyproterone: what resolveParams uses, by mouth only.
    if (ester === Ester.CPA) return route === Route.oral ? CPA_ORAL_F : 0;

    // Transmasculine (testosterone) path
    if (isTestosteroneEster(ester)) {
        switch (route) {
            case Route.injection: {
                if (ester === Ester.T) return 0;
                const formation = _getTInjFF(ester);
                return formation * mwFactor;
            }
            case Route.gel: {
                const siteIdx = Math.min(
                    GEL_SITE_ORDER.length - 1,
                    Math.max(0, Math.round(extras[ExtraKey.gelSite] ?? 0)),
                );
                const siteKey = GEL_SITE_ORDER[siteIdx] as GelSite;
                return _getTGelBio(siteKey) * mwFactor;
            }
            case Route.patchApply:
                return T_PatchPK.F * mwFactor;
            case Route.patchRemove:
            default:
                return 0;
        }
    }

    switch (route) {
        case Route.injection: {
            const formation = _getE2InjFF(ester);
            return formation * mwFactor;
        }
        case Route.oral:
            return _activePKParams.e2_oral_bio * mwFactor;
        case Route.sublingual: {
            let theta = _activePKParams.e2_sl_standard;
            if (extras[ExtraKey.sublingualTheta] !== undefined) {
                const customTheta = extras[ExtraKey.sublingualTheta];
                if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                    theta = Math.min(1, Math.max(0, customTheta));
                }
            } else if (extras[ExtraKey.sublingualTier] !== undefined) {
                const tierIdx = Math.min(
                    SL_TIER_ORDER.length - 1,
                    Math.max(0, Math.round(extras[ExtraKey.sublingualTier]!)),
                );
                const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                theta = _getSLTheta(tierKey);
            }
            return (theta + (1 - theta) * _activePKParams.e2_oral_bio) * mwFactor;
        }
        case Route.gel: {
            const siteIdx = Math.min(GEL_SITE_ORDER.length - 1, Math.max(0, Math.round(extras[ExtraKey.gelSite] ?? 0)));
            const siteKey = GEL_SITE_ORDER[siteIdx] as GelSite;
            const bio = _getGelBio(siteKey);
            return bio * mwFactor;
        }
        case Route.patchApply:
            return 1.0 * mwFactor;
        case Route.patchRemove:
        default:
            return 0;
    }
}

// --- Math Models ---

interface PKParams {
    Frac_fast: number;
    k1_fast: number;
    k1_slow: number;
    k2: number;
    // Second step of the slow (swallowed) sublingual branch: the oral route's
    // estrone pool, as k2 is for an oral dose. Absent means none.
    k2_slow?: number;
    k3: number;
    F: number;
    rateMGh: number;
    F_fast: number;
    F_slow: number;
}

function resolveParams(event: DoseEvent, birthYear: number | null): PKParams {
    const defaultK3 =
        (event.route === Route.injection ? _activePKParams.e2_kClearInj : _activePKParams.e2_kClear) *
        ageClearanceMultiplier('e2', birthYear, event.timeH);
    const toE2 = getToE2Factor(event.ester);
    const extras = event.extras ?? {};

    // Transmasculine (testosterone) path — use the dedicated T PK parameters.
    if (isTestosteroneEster(event.ester)) {
        const tK3 =
            (event.route === Route.injection ? _activePKParams.t_kClearInj : _activePKParams.t_kClear) *
            ageClearanceMultiplier('t', birthYear, event.timeH);
        switch (event.route) {
            case Route.injection: {
                if (event.ester === Ester.T) {
                    // Shouldn't happen (bare T is not injected in practice), return zeroed params.
                    return {
                        Frac_fast: 0,
                        k1_fast: 0,
                        k1_slow: 0,
                        k2: 0,
                        k3: tK3,
                        F: 0,
                        rateMGh: 0,
                        F_fast: 0,
                        F_slow: 0,
                    };
                }
                const Frac_fast = (T_DepotPK.Frac_fast as any)[event.ester] ?? 0.35;
                const k1_fast = (T_DepotPK.k1_fast as any)[event.ester] ?? 0.025;
                const k1_slow = (T_DepotPK.k1_slow as any)[event.ester] ?? 0.005;
                const k2 = (T_EsterPK.k2 as any)[event.ester] ?? 0.2;
                const F = getBioavailabilityMultiplier(Route.injection, event.ester, extras);
                return { Frac_fast, k1_fast, k1_slow, k2, k3: tK3, F, rateMGh: 0, F_fast: F, F_slow: F };
            }
            case Route.gel: {
                const F = getBioavailabilityMultiplier(Route.gel, event.ester, extras);
                return {
                    Frac_fast: 1.0,
                    k1_fast: T_GelPK.k1,
                    k1_slow: 0,
                    k2: 0,
                    k3: tK3,
                    F,
                    rateMGh: 0,
                    F_fast: F,
                    F_slow: F,
                };
            }
            case Route.patchApply: {
                const F = getBioavailabilityMultiplier(Route.patchApply, event.ester, extras);
                const releaseRateUGPerDay = extras[ExtraKey.releaseRateUGPerDay];
                const rateMGh =
                    typeof releaseRateUGPerDay === 'number' &&
                    Number.isFinite(releaseRateUGPerDay) &&
                    releaseRateUGPerDay > 0
                        ? (releaseRateUGPerDay / 24 / 1000) * F
                        : 0;
                if (rateMGh > 0) {
                    return { Frac_fast: 1.0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F, rateMGh, F_fast: F, F_slow: F };
                }
                return {
                    Frac_fast: 1.0,
                    k1_fast: T_PatchPK.k1,
                    k1_slow: 0,
                    k2: 0,
                    k3: tK3,
                    F,
                    rateMGh: 0,
                    F_fast: F,
                    F_slow: F,
                };
            }
            case Route.patchRemove:
                return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
            default:
                // Oral / sublingual T not supported in this MVP — fall through to zeroed params.
                return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: tK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
        }
    }

    // Cyproterone is modelled by mouth only. Any other route (it can only arrive
    // by import) used to fall through to the estradiol parameters below.
    if (event.ester === Ester.CPA && event.route !== Route.oral) {
        return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: defaultK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
    }

    switch (event.route) {
        case Route.injection: {
            const Frac_fast = TwoPartDepotPK.Frac_fast[event.ester] ?? 0.5;
            const k1_fast = (TwoPartDepotPK.k1_fast[event.ester] ?? 0.1) * CorePK.depotK1Corr;
            const k1_slow = (TwoPartDepotPK.k1_slow[event.ester] ?? 0.01) * CorePK.depotK1Corr;
            const k2 = EsterPK.k2[event.ester] ?? 0;
            const F = getBioavailabilityMultiplier(Route.injection, event.ester, extras);
            return { Frac_fast, k1_fast, k1_slow, k2, k3: defaultK3, F, rateMGh: 0, F_fast: F, F_slow: F };
        }

        case Route.sublingual: {
            let theta = _activePKParams.e2_sl_standard;
            if (extras[ExtraKey.sublingualTheta] !== undefined) {
                const customTheta = extras[ExtraKey.sublingualTheta];
                if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                    theta = Math.min(1, Math.max(0, customTheta));
                }
            } else if (extras[ExtraKey.sublingualTier] !== undefined) {
                const tierRaw = extras[ExtraKey.sublingualTier];
                if (typeof tierRaw === 'number' && Number.isFinite(tierRaw)) {
                    const tierIdx = Math.min(SL_TIER_ORDER.length - 1, Math.max(0, Math.round(tierRaw)));
                    const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                    theta = _getSLTheta(tierKey);
                }
            }
            // The swallowed share takes exactly the oral route's path, so θ = 0
            // is the oral curve.
            const k1_fast = OralPK.kAbsSL;
            const k1_slow = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2 = EsterPK.k2[event.ester] ?? 0;
            const k2_slow = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
            const F_fast = toE2;
            const F_slow = _activePKParams.e2_oral_bio * toE2;
            const F = theta * F_fast + (1 - theta) * F_slow;
            return { Frac_fast: theta, k1_fast, k1_slow, k2, k2_slow, k3: defaultK3, F, rateMGh: 0, F_fast, F_slow };
        }

        case Route.gel: {
            const F = getBioavailabilityMultiplier(Route.gel, event.ester, extras);
            // Under flip-flop kinetics (k1 << k3), the terminal decline is absorption-
            // limited, so k1 is set from the reported apparent elimination half-life of
            // transdermal E2 gel: k1 = ln(2)/36 ≈ 0.0193 h⁻¹.
            //
            // 36 h is EstroGel's, not Divigel's, which this comment previously
            // misattributed: "The apparent terminal exponential half-life for estradiol
            // was about 36 hours following administration of 1.25 g EstroGel"
            // (NDA 021166) versus "about 10 hours following administration of Divigel"
            // (NDA 022038). The two labels genuinely disagree, confounded by product,
            // formulation and site (arm vs thigh), so 36 h is a choice between them
            // rather than a consensus figure.
            //
            // k1 does not affect exposure either way: it cancels out of the kernel's
            // time-integral, so AUC = F·D/k3 regardless, and k1 sets only Tmax and the
            // peak-to-trough shape. Worth revisiting on its own evidence — the model's
            // gel Cmax runs low against both labels (predicted ~31 vs EstroGel's 46.4,
            // ~41 vs Divigel's 51.5) — but that is a k1 problem, not an F problem.
            const k1 = 0.0193;
            return {
                Frac_fast: 1.0,
                k1_fast: k1,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }

        case Route.patchApply: {
            const F = getBioavailabilityMultiplier(Route.patchApply, event.ester, extras);
            const releaseRateUGPerDay = extras[ExtraKey.releaseRateUGPerDay];
            const rateMGh =
                typeof releaseRateUGPerDay === 'number' &&
                Number.isFinite(releaseRateUGPerDay) &&
                releaseRateUGPerDay > 0
                    ? (releaseRateUGPerDay / 24 / 1000) * F
                    : 0;
            if (rateMGh > 0) {
                return {
                    Frac_fast: 1.0,
                    k1_fast: 0,
                    k1_slow: 0,
                    k2: 0,
                    k3: defaultK3,
                    F,
                    rateMGh,
                    F_fast: F,
                    F_slow: F,
                };
            }
            const k1 = 0.0075;
            return {
                Frac_fast: 1.0,
                k1_fast: k1,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }

        case Route.patchRemove:
            return {
                Frac_fast: 0,
                k1_fast: 0,
                k1_slow: 0,
                k2: 0,
                k3: defaultK3,
                F: 0,
                rateMGh: 0,
                F_fast: 0,
                F_slow: 0,
            };

        case Route.oral: {
            // === 针对 CPA 的特殊处理开始 ===
            // Only ka and the slow phase's β matter here, for how long the dose
            // counts (computeMaxLifetimeH); the curve itself is drawn from
            // CPA_ORAL in PrecomputedEventModel.
            if (event.ester === Ester.CPA) {
                return {
                    Frac_fast: 1.0,
                    k1_fast: CPA_ORAL.ka,
                    k1_slow: 0,
                    k2: 0,
                    k3: CPA_ORAL.beta,
                    F: CPA_ORAL_F,
                    rateMGh: 0,
                    F_fast: CPA_ORAL_F,
                    F_slow: CPA_ORAL_F,
                };
            }
            // === 针对 CPA 的特殊处理结束 ===

            // EV: one step at kAbsEV. Everything else: absorption, then the
            // estrone pool (see OralPK.kE1Pool).
            const k1Value = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
            const k2Value = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
            const F = _activePKParams.e2_oral_bio * toE2;
            return {
                Frac_fast: 1.0,
                k1_fast: k1Value,
                k1_slow: 0,
                k2: k2Value,
                k3: defaultK3,
                F,
                rateMGh: 0,
                F_fast: F,
                F_slow: F,
            };
        }
    }

    return { Frac_fast: 0, k1_fast: 0, k1_slow: 0, k2: 0, k3: defaultK3, F: 0, rateMGh: 0, F_fast: 0, F_slow: 0 };
}

/**
 * First divided difference of s ↦ e^(−sτ) at x and y, (e^(−xτ) − e^(−yτ)) / (x − y),
 * taken without cancellation when x and y are close: it tends to −τ·e^(−xτ).
 */
function _expDivDiff1(x: number, y: number, tau: number): number {
    const z = (Math.abs(y - x) * tau) / 2;
    if (z > 1) return (Math.exp(-x * tau) - Math.exp(-y * tau)) / (x - y);
    const sinhc = z === 0 ? 1 : Math.sinh(z) / z;
    return -tau * Math.exp((-(x + y) / 2) * tau) * sinhc;
}

/**
 * Second divided difference of s ↦ e^(−sτ) at a, b and c. Written as the usual
 * sum of three exponentials over products of rate differences, it loses every
 * significant digit as two or three rates meet (testosterone enanthate's
 * absorption and elimination rates are equal by default). Here the outer
 * difference is taken across the widest pair of rates, and when all three sit
 * within 0.5/τ of each other a Taylor series about their mean is used instead:
 *   τ²·e^(−mτ) · Σ_j H_j(u) / (j + 2)!,   u_i = (m − k_i)·τ,
 * with H_j the complete homogeneous symmetric polynomial of degree j.
 */
function _expDivDiff2(a: number, b: number, c: number, tau: number): number {
    if (a > b) [a, b] = [b, a];
    if (b > c) [b, c] = [c, b];
    if (a > b) [a, b] = [b, a];
    if ((c - a) * tau >= 0.5) return (_expDivDiff1(b, c, tau) - _expDivDiff1(a, b, tau)) / (c - a);
    const mean = (a + b + c) / 3;
    const ua = (mean - a) * tau;
    const ub = (mean - b) * tau;
    const uc = (mean - c) * tau;
    // H_j over {ua}, {ua, ub} and {ua, ub, uc}, built up one degree at a time.
    let h1 = 1;
    let h2 = 1;
    let h3 = 1;
    let fact = 2;
    let sum = 0.5;
    for (let j = 1; j < 20; j++) {
        h1 *= ua;
        h2 = h1 + ub * h2;
        h3 = h2 + uc * h3;
        fact *= j + 2;
        sum += h3 / fact;
    }
    return tau * tau * Math.exp(-mean * tau) * sum;
}

// 2-Compartment (Bateman) solution: absorption k_a → elimination k_e, no
// hydrolysis step. Used wherever there is no ester to cleave — the 3C form is
// multiplied by k2 throughout, so feeding it k2 = 0 returns a flat zero.
//   amount = dose·F·k_a·(e^(−k_e·τ) − e^(−k_a·τ)) / (k_a − k_e)
function _analytic2C(tau: number, doseMG: number, F: number, ka: number, ke: number): number {
    if (ka <= 0 || doseMG <= 0) return 0;
    return -doseMG * F * ka * _expDivDiff1(ka, ke, tau);
}

// 3-Compartment Analytical Solution (sequential first-order: absorption k1 → ester
// hydrolysis k2 → central-compartment elimination k3). Returns the central-compartment
// amount for a bolus, scaled by dose·F:
//   amount = dose·F·k1·k2·Σ_i e^(−k_i·τ) / Π_(j≠i) (k_j − k_i)
// which is k1·k2 times the second divided difference of e^(−sτ) at the three
// rates, so coincident rates take their exact limit.
function _analytic3C(tau: number, doseMG: number, F: number, k1: number, k2: number, k3: number): number {
    if (k1 <= 0 || doseMG <= 0) return 0;
    return doseMG * F * k1 * k2 * _expDivDiff2(k1, k2, k3, tau);
}

function oneCompAmount(tau: number, doseMG: number, p: PKParams): number {
    return _analytic2C(tau, doseMG, p.F, p.k1_fast, p.k3);
}

/**
 * Pair each patch application with its own removal.
 *
 * Nothing on a patchRemove event says which application it ends, so the pairing
 * is inferred: walk the removals in time order and give each one the oldest
 * patch that is plausibly still on the skin at that moment. Picking the first
 * removal *after* each application instead (what a per-event `find` does) hands
 * the same early removal to every overlapping patch, so on a staggered
 * two-patch regimen the second patch would stop delivering when the first
 * comes off.
 *
 * A patch counts as "on" for a removal when it is of the same hormone (the form
 * writes estradiol or testosterone on a removal by mode), was applied at least
 * PATCH_MIN_WEAR_H earlier, and, if it has a planned wear time, that wear ended
 * no more than PATCH_REMOVAL_GRACE_H before the removal. So:
 *   - a patch that already came off by its planned wear does not soak up a
 *     later removal of a newer patch;
 *   - a removal logged a little late still ends the old patch, not the new one
 *     put on just before it;
 *   - a removal logged at the same moment as, or minutes after, a new
 *     application (the old patch was on before the log started, or the change
 *     was entered in the other order) does not end the new patch;
 *   - a removal that fits no patch by its plan ends the newest patch of that
 *     hormone if that one is still unpaired and the removal comes no more
 *     than PATCH_MAX_OVERWEAR_H after its planned end, so the newest patch,
 *     left on past its plan and taken off later, is worn until the removal.
 *     An older patch left on while a newer one went on is not: a removal
 *     that fits the newer one by its plan ends the newer one;
 *   - any other removal that fits no patch is ignored instead of consuming
 *     the next application and shifting every later pairing by one. That
 *     includes a removal logged weeks later to close out a patch after a
 *     pause or a change of route, which must not keep it delivering through
 *     the gap.
 * Ties between patches applied at the same time are broken by their own
 * contents, the same way on both paths, and removals at the same moment by
 * hormone, so the result never depends on the order of the input array.
 *
 * Keyed on event identity rather than `id` because imported files can carry
 * duplicate ids. Memoised per event array: the caller builds one array per
 * simulation and asks once per patch event.
 */
const PATCH_MIN_WEAR_H = 1;
const PATCH_REMOVAL_GRACE_H = 24;
// How far past its planned wear a removal can still end a patch. A twice-weekly
// 0.1 mg/day patch holds about 15.6 days of drug at its labelled rate (Vivelle-Dot
// label: 1.56 mg), and 84 h of planned wear plus this stays inside that.
const PATCH_MAX_OVERWEAR_H = 240;

const patchRemovalCache = new WeakMap<DoseEvent[], Map<DoseEvent, number>>();

function _patchHormone(e: DoseEvent): 'e2' | 't' | null {
    if (isTestosteroneEster(e.ester)) return 't';
    if (isEstradiolEster(e.ester)) return 'e2';
    return null;
}

function _plannedWearH(e: DoseEvent): number | null {
    const planned = e.extras?.[ExtraKey.patchWearH];
    return typeof planned === 'number' && Number.isFinite(planned) && planned > 0 ? planned : null;
}

function patchRemovalTimes(allEvents: DoseEvent[]): Map<DoseEvent, number> {
    const cached = patchRemovalCache.get(allEvents);
    if (cached) return cached;
    const pairs = new Map<DoseEvent, number>();

    const byTimeThenContent = (a: DoseEvent, b: DoseEvent) =>
        a.timeH - b.timeH ||
        (_plannedWearH(a) ?? Infinity) - (_plannedWearH(b) ?? Infinity) ||
        a.doseMG - b.doseMG ||
        (Number(a.extras?.[ExtraKey.releaseRateUGPerDay]) || 0) -
            (Number(b.extras?.[ExtraKey.releaseRateUGPerDay]) || 0) ||
        String(a.ester).localeCompare(String(b.ester)) ||
        String(a.id).localeCompare(String(b.id));
    const applies = allEvents.filter(e => e.route === Route.patchApply).sort(byTimeThenContent);
    // A removal of either hormone goes before one that names neither, which
    // can take a patch of any hormone.
    const hormoneRank = (e: DoseEvent) => {
        const h = _patchHormone(e);
        return h === 'e2' ? 0 : h === 't' ? 1 : 2;
    };
    const removals = allEvents
        .filter(e => e.route === Route.patchRemove)
        .sort((a, b) => a.timeH - b.timeH || hormoneRank(a) - hormoneRank(b));

    let open: DoseEvent[] = []; // unpaired applications, oldest first
    let next = 0;
    for (const r of removals) {
        while (next < applies.length && applies[next].timeH <= r.timeH - PATCH_MIN_WEAR_H) open.push(applies[next++]);
        // Removals arrive in time order, so a patch whose planned wear ended
        // more than the grace period ago is never matched by plan again (only
        // by the fallback below).
        open = open.filter(a => {
            const wear = _plannedWearH(a);
            return wear === null || a.timeH + wear + PATCH_REMOVAL_GRACE_H >= r.timeH;
        });
        const hormone = _patchHormone(r);
        const idx = open.findIndex(a => hormone === null || _patchHormone(a) === hormone);
        if (idx >= 0) {
            pairs.set(open[idx], r.timeH);
            open.splice(idx, 1);
            continue;
        }
        // No patch fits by its plan. An explicit removal still ends a patch
        // worn past it (see ExtraKey.patchWearH), so it goes to the newest
        // patch of that hormone put on before it, if that one is unpaired and
        // within PATCH_MAX_OVERWEAR_H of its plan. An older patch is never
        // taken: a newer one replaced it. Patches put on at the same moment are
        // tried in the order the plan match above uses.
        const fits = (a: DoseEvent) => hormone === null || _patchHormone(a) === hormone;
        let last = next - 1;
        while (last >= 0 && !fits(applies[last])) last--;
        if (last < 0) continue;
        let first = last;
        while (first > 0 && applies[first - 1].timeH === applies[last].timeH) first--;
        for (let i = first; i <= last; i++) {
            const a = applies[i];
            if (!fits(a) || pairs.has(a)) continue;
            if (r.timeH > a.timeH + (_plannedWearH(a) ?? 0) + PATCH_MAX_OVERWEAR_H) continue;
            pairs.set(a, r.timeH);
            break;
        }
    }
    patchRemovalCache.set(allEvents, pairs);
    return pairs;
}

/**
 * How long (hours after application) a patch stays on the skin delivering drug.
 * Resolution order:
 *   1. The patchRemove event paired with this application wins (the user
 *      removed it at a known time, possibly earlier/later than planned).
 *   2. Otherwise the planned wear duration stored on the apply event is used, so
 *      a single "apply" event self-completes.
 *   3. Otherwise the patch is assumed to be worn indefinitely (legacy behaviour).
 */
function resolvePatchWearH(event: DoseEvent, allEvents: DoseEvent[]): number {
    const removeAt = patchRemovalTimes(allEvents).get(event);
    if (removeAt !== undefined && removeAt > event.timeH) return removeAt - event.timeH;
    const planned = event.extras?.[ExtraKey.patchWearH];
    if (typeof planned === 'number' && Number.isFinite(planned) && planned > 0) return planned;
    return Number.MAX_VALUE;
}

// Model Solver
class PrecomputedEventModel {
    private model: (t: number) => number;

    constructor(event: DoseEvent, allEvents: DoseEvent[], params: PKParams) {
        const startTime = event.timeH;
        const dose = event.doseMG;

        switch (event.route) {
            case Route.injection:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    const doseFast = dose * params.Frac_fast;
                    const doseSlow = dose * (1.0 - params.Frac_fast);

                    // Unesterified estradiol has k2 = 0 — nothing to hydrolyse —
                    // and the 3C kernel multiplies by k2, so it returned exactly
                    // zero for all time: a logged dose that contributed nothing,
                    // silently. Fall back to the two-compartment form, matching
                    // what the sublingual branch already does for the same case.
                    if (params.k2 > 0) {
                        return (
                            _analytic3C(tau, doseFast, params.F, params.k1_fast, params.k2, params.k3) +
                            _analytic3C(tau, doseSlow, params.F, params.k1_slow, params.k2, params.k3)
                        );
                    }
                    return (
                        _analytic2C(tau, doseFast, params.F, params.k1_fast, params.k3) +
                        _analytic2C(tau, doseSlow, params.F, params.k1_slow, params.k3)
                    );
                };
                break;
            case Route.gel:
            case Route.oral:
                if (event.route === Route.oral && event.ester === Ester.CPA) {
                    const { F, ka, alpha, beta, wFast, wSlow } = CPA_ORAL;
                    this.model = (timeH: number) => {
                        const tau = timeH - startTime;
                        if (tau < 0) return 0;
                        return (
                            _analytic2C(tau, dose, F * wFast, ka, alpha) + _analytic2C(tau, dose, F * wSlow, ka, beta)
                        );
                    };
                    break;
                }
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    if (params.k2 > 0) return _analytic3C(tau, dose, params.F, params.k1_fast, params.k2, params.k3);
                    return oneCompAmount(tau, dose, params);
                };
                break;
            case Route.sublingual:
                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;
                    const doseF = dose * params.Frac_fast;
                    const doseS = dose * (1.0 - params.Frac_fast);

                    // Dual-branch first-order helper (same closed form as oneCompAmount).
                    const fastAmount =
                        params.k2 > 0
                            ? _analytic3C(tau, doseF, params.F_fast, params.k1_fast, params.k2, params.k3)
                            : _analytic2C(tau, doseF, params.F_fast, params.k1_fast, params.k3);

                    // Swallowed (gut) fraction follows the oral route's path.
                    const slowAmount =
                        (params.k2_slow ?? 0) > 0
                            ? _analytic3C(tau, doseS, params.F_slow, params.k1_slow, params.k2_slow!, params.k3)
                            : _analytic2C(tau, doseS, params.F_slow, params.k1_slow, params.k3);

                    return fastAmount + slowAmount;
                };
                break;
            case Route.patchApply:
                const wearH = resolvePatchWearH(event, allEvents);

                this.model = (timeH: number) => {
                    const tau = timeH - startTime;
                    if (tau < 0) return 0;

                    // Zero Order
                    if (params.rateMGh > 0) {
                        if (tau <= wearH) {
                            return (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * tau));
                        } else {
                            const amtRemoval = (params.rateMGh / params.k3) * (1 - Math.exp(-params.k3 * wearH));
                            return amtRemoval * Math.exp(-params.k3 * (tau - wearH));
                        }
                    }
                    // First order legacy
                    const amtUnderPatch = oneCompAmount(tau, dose, params);
                    if (tau > wearH) {
                        const amtAtRemoval = oneCompAmount(wearH, dose, params);
                        return amtAtRemoval * Math.exp(-params.k3 * (tau - wearH));
                    }
                    return amtUnderPatch;
                };
                break;
            default:
                this.model = () => 0;
        }
    }

    amount(timeH: number): number {
        return this.model(timeH);
    }
}

// --- Simulation Engine ---

/**
 * Compute the maximum time (hours after dose) for which an event's PK model
 * contribution is non-negligible.  Once tau > maxLifetimeH the exponential
 * decay has reduced the amount to < 1e-6 of its peak, so we can safely skip
 * the evaluation — critical when there are hundreds of events (e.g. daily
 * oral recording for a year).
 */
function computeMaxLifetimeH(params: PKParams, event: DoseEvent, allEvents: DoseEvent[]): number {
    // For patches: account for wear duration + post-removal decay. Resolve the
    // wear of this very event: two patches applied at the same moment can come
    // off at different times.
    if (event.route === Route.patchApply) {
        const wearH = resolvePatchWearH(event, allEvents);
        if (wearH >= Number.MAX_VALUE) return Infinity; // Worn indefinitely, always contributes
        const decayH = params.k3 > 0 ? Math.ceil(13.816 / params.k3) : 10000;
        return wearH + decayH;
    }

    // Collect all non-zero rate constants that govern exponential decay
    const rates: number[] = [];
    if (params.k1_fast > 0) rates.push(params.k1_fast);
    if (params.k1_slow > 0) rates.push(params.k1_slow);
    if (params.k2 > 0) rates.push(params.k2);
    if ((params.k2_slow ?? 0) > 0) rates.push(params.k2_slow!);
    if (params.k3 > 0) rates.push(params.k3);

    if (rates.length === 0) return Infinity;

    // The slowest exponential dominates at large tau.
    // exp(-kMin * tau) < 1e-6  =>  tau > ln(1e6) / kMin ≈ 13.816 / kMin
    const kMin = Math.min(...rates);
    return Math.ceil(13.816 / kMin);
}

/** `birthYear`: for the age adjustment (see AGE_REF_YEARS); null, or one isPlausibleBirthYear rejects, leaves it out. */
export function runSimulation(
    events: DoseEvent[],
    bodyWeightKG: number,
    birthYear: number | null = null,
): SimulationResult | null {
    // Unmodelled drugs, and codes this build doesn't know, have no parameters
    // of their own: let through, they would fall into the estradiol branches
    // below and be counted as estradiol.
    events = events.filter(e => !isUnmodelledDrug(e.ester));
    if (events.length === 0 || bodyWeightKG <= 0) return null;
    const born = isPlausibleBirthYear(birthYear) ? birthYear : null;

    const sortedEvents = [...events].sort((a, b) => a.timeH - b.timeH);
    const precomputed = sortedEvents
        .filter(e => e.route !== Route.patchRemove)
        .map(e => {
            const params = resolveParams(e, born);
            const model = new PrecomputedEventModel(e, sortedEvents, params);
            const maxLifetimeH = computeMaxLifetimeH(params, e, sortedEvents);
            return { model, ester: e.ester, startTimeH: e.timeH, maxLifetimeH };
        });

    const startTime = sortedEvents[0].timeH - 24;
    const nowH = Date.now() / (1000 * 60 * 60);
    const endTime = Math.max(sortedEvents[sortedEvents.length - 1].timeH + 24 * 14, nowH + 24);
    // Adaptive step count: at least 1 point per hour, minimum 2000. The cap only
    // guards against a pathological/malformed event time (e.g. a bad timestamp
    // decades away) blowing up memory — at realistic usage spans (even several
    // years of history) it must stay well above the "1 point per hour" floor,
    // otherwise the grid gets diluted across the whole history-to-now range and
    // the curve visibly facets (straight-line segments, no smoothing) even when
    // zoomed into a recent window. See ResultChart's linePath().
    const totalHours = endTime - startTime;
    const steps = Math.min(100000, Math.max(2000, Math.ceil(totalHours)));

    // Different Vd for E2, CPA and T
    const plasmaVolumeML_E2 = CorePK.vdPerKG * bodyWeightKG * 1000; // E2: ~2.0 L/kg
    const plasmaVolumeML_CPA = CorePK.vdPerKG_CPA * bodyWeightKG * 1000; // CPA: ~14.0 L/kg
    const plasmaVolumeML_T = T_CorePK.vdPerKG * bodyWeightKG * 1000; // T: ~1.0 L/kg

    const timeH: number[] = [];
    const concPGmL: number[] = [];
    const concPGmL_E2: number[] = [];
    const concPGmL_CPA: number[] = []; // Will store in ng/mL (not pg/mL)
    const concNGdL_T: number[] = []; // Total testosterone in ng/dL
    let auc = 0;

    const stepSize = (endTime - startTime) / (steps - 1);
    const gridTimes = Array.from({ length: steps }, (_, i) => startTime + i * stepSize);

    // Add dense sampling points after every dose, so peaks and the first hours
    // after a dose are drawn from the model rather than from a straight line
    // across a coarse grid. This used to be limited to doses still contributing
    // at the end of the grid, which always excluded short-acting doses (the
    // grid ends at least 14 days after the last dose): with a long history the
    // base grid is about one point per hour, so a sublingual peak was drawn up
    // to about 7% low and the level read shortly after a dose about half the
    // model's value. Offsets past a dose's own lifetime add nothing and are
    // skipped.
    const periEventOffsets = [0.25, 0.5, 1, 2, 4, 6, 8, 12, 24, 48];
    const periEventTimes: number[] = [];
    for (const pc of precomputed) {
        for (const offset of periEventOffsets) {
            if (offset > pc.maxLifetimeH) break;
            const t = pc.startTimeH + offset;
            if (t >= startTime && t <= endTime) {
                periEventTimes.push(t);
            }
        }
    }

    // The current time is a sample point too, so the "current level" read off
    // the result is the model's value rather than an interpolation.
    const nowTimes = nowH >= startTime && nowH <= endTime ? [nowH] : [];

    const eventTimes = sortedEvents.map(e => e.timeH);
    const allTimes = Array.from(new Set([...gridTimes, ...eventTimes, ...periEventTimes, ...nowTimes])).sort(
        (a, b) => a - b,
    );

    // `precomputed` and `allTimes` are both sorted ascending by time, so which
    // events can contribute at a given t forms a sliding window: events
    // activate (once) as t reaches their startTimeH and drop out (once) once
    // their contribution has decayed past maxLifetimeH. Tracking that window
    // instead of rescanning the full event list at every grid point turns the
    // hot loop from O(steps × events) into O(steps × concurrently-active
    // events) — the same result, since a dropped event's amount() is 0 at t
    // anyway, just without visiting every historical event to find that out.
    let activateIdx = 0;
    const active: typeof precomputed = [];

    for (let i = 0; i < allTimes.length; i++) {
        const t = allTimes[i];

        while (activateIdx < precomputed.length && precomputed[activateIdx].startTimeH <= t) {
            active.push(precomputed[activateIdx]);
            activateIdx++;
        }
        for (let j = 0; j < active.length;) {
            if (t - active[j].startTimeH > active[j].maxLifetimeH) {
                active[j] = active[active.length - 1];
                active.pop();
            } else {
                j++;
            }
        }

        let totalAmountMG_E2 = 0;
        let totalAmountMG_CPA = 0;
        let totalAmountMG_T = 0;

        for (const { model, ester } of active) {
            const amount = model.amount(t);
            if (ester === Ester.CPA) {
                totalAmountMG_CPA += amount;
            } else if (T_ESTERS.has(ester)) {
                totalAmountMG_T += amount;
            } else {
                totalAmountMG_E2 += amount;
            }
        }

        // E2: pg/mL (using E2 Vd)
        const currentConc_E2 = (totalAmountMG_E2 * 1e9) / plasmaVolumeML_E2;

        // CPA: ng/mL (using CPA Vd, convert from mg to ng: 1e6 instead of 1e9)
        const currentConc_CPA = (totalAmountMG_CPA * 1e6) / plasmaVolumeML_CPA;

        // T: ng/dL (mg → ng: *1e6; mL → dL: /100 → factor 1e8/V_mL)
        const currentConc_T = (totalAmountMG_T * 1e8) / plasmaVolumeML_T;

        // Total in pg/mL (convert CPA from ng/mL to pg/mL for compatibility)
        const currentConc = currentConc_E2 + currentConc_CPA * 1000;

        timeH.push(t);
        concPGmL.push(currentConc);
        concPGmL_E2.push(currentConc_E2); // pg/mL
        concPGmL_CPA.push(currentConc_CPA); // ng/mL
        concNGdL_T.push(currentConc_T); // ng/dL

        if (i > 0) {
            const dt = t - allTimes[i - 1];
            auc += 0.5 * (currentConc_E2 + concPGmL_E2[i - 1]) * dt;
        }
    }

    return { timeH, concPGmL, concPGmL_E2, concPGmL_CPA, concNGdL_T, auc };
}

export function interpolateConcentration_E2(sim: SimulationResult, hour: number): number | null {
    if (!sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_E2[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_E2[sim.concPGmL_E2.length - 1];

    // Binary search for efficiency
    let low = 0;
    let high = sim.timeH.length - 1;

    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_E2[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_E2[low];
    const c1 = sim.concPGmL_E2[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

/**
 * The lowest cyproterone estimate (ng/mL) worth showing. Below it is the
 * washed-out tail of past doses, which never quite reaches zero: readings show
 * "--" for it and the chart leaves the curve out.
 */
export const CPA_MIN_NGML = 0.1;

export function interpolateConcentration_CPA(sim: SimulationResult, hour: number): number | null {
    if (!sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concPGmL_CPA[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concPGmL_CPA[sim.concPGmL_CPA.length - 1];

    // Binary search for efficiency
    let low = 0;
    let high = sim.timeH.length - 1;

    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concPGmL_CPA[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concPGmL_CPA[low];
    const c1 = sim.concPGmL_CPA[high];

    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

// Testosterone (ng/dL) interpolation
export function interpolateConcentration_T(sim: SimulationResult, hour: number): number | null {
    if (!sim.concNGdL_T || !sim.timeH.length) return null;
    if (hour <= sim.timeH[0]) return sim.concNGdL_T[0];
    if (hour >= sim.timeH[sim.timeH.length - 1]) return sim.concNGdL_T[sim.concNGdL_T.length - 1];

    let low = 0;
    let high = sim.timeH.length - 1;
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (sim.timeH[mid] === hour) return sim.concNGdL_T[mid];
        if (sim.timeH[mid] < hour) low = mid;
        else high = mid;
    }

    const t0 = sim.timeH[low];
    const t1 = sim.timeH[high];
    const c0 = sim.concNGdL_T[low];
    const c1 = sim.concNGdL_T[high];
    if (t1 === t0) return c0;
    const ratio = (hour - t0) / (t1 - t0);
    return c0 + (c1 - c0) * ratio;
}

// --- Encryption Utils ---
// Web Crypto where the page has it, the @noble fallback on a plain-http
// self-host (see src/utils/cryptoCompat.ts). Output is identical either way.

async function generateKey(password: string, salt: Uint8Array, iterations: number = 600000) {
    return pbkdf2Sha256(new TextEncoder().encode(password), salt, iterations, 32);
}

function buffToBase64(buff: Uint8Array): string {
    const bin = Array.from(buff, byte => String.fromCharCode(byte)).join('');
    return btoa(bin);
}

function base64ToBuff(b64: string): Uint8Array {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export async function encryptData(text: string, customPassword?: string): Promise<{ data: string; password: string }> {
    const password = customPassword || buffToBase64(randomBytes(12));
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const iterations = 600000;
    const key = await generateKey(password, salt, iterations);
    const encrypted = await aesGcmEncrypt(key, iv, new TextEncoder().encode(text));

    const bundle = {
        encrypted: true,
        iv: buffToBase64(iv),
        salt: buffToBase64(salt),
        iter: iterations,
        data: buffToBase64(encrypted),
    };
    return {
        data: JSON.stringify(bundle),
        password,
    };
}

export async function decryptData(jsonString: string, password: string): Promise<string | null> {
    try {
        const bundle = JSON.parse(jsonString);
        if (!bundle.encrypted) return jsonString;

        const salt = base64ToBuff(bundle.salt);
        const iv = base64ToBuff(bundle.iv);
        const data = base64ToBuff(bundle.data);
        // The iteration count comes out of the file being imported, so it is
        // attacker-controlled. A positivity check alone let `"iter": 1e11`
        // through to PBKDF2, where it never returns — the import silently hangs
        // forever with no error and no way to cancel. Bounded to the range this
        // app actually writes (600k today, 100k in older exports).
        const declaredIter = bundle.iter;
        const iterations =
            typeof declaredIter === 'number' &&
            Number.isSafeInteger(declaredIter) &&
            declaredIter >= 100000 &&
            declaredIter <= 1000000
                ? declaredIter
                : 100000;

        const key = await generateKey(password, salt, iterations);
        const decrypted = await aesGcmDecrypt(key, iv, data);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error(e);
        return null;
    }
}

// --- Cloud (end-to-end) encryption ---
// Cloud backups are encrypted client-side with a key derived from the login
// password so the server/admin can never read the plaintext health data.
// The salt is the user's stable id, so the key is consistent across devices
// and survives username changes (a password change re-derives a new key).

export interface CloudBundle {
    cloud: 1;
    iv: string;
    data: string;
}

// Derive the AES-GCM key from the password + a stable per-user salt,
// returning the raw key bytes (base64) for caching on this device. The raw key
// can decrypt backups but cannot be used to authenticate, so caching it is
// strictly safer than caching the password itself.
export async function deriveCloudKey(password: string, userId: string): Promise<string> {
    const enc = new TextEncoder();
    const raw = await pbkdf2Sha256(enc.encode(password), enc.encode(`hrt-cloud-v1:${userId}`), 600000, 32);
    return buffToBase64(raw);
}

export function isCloudEncrypted(obj: any): obj is CloudBundle {
    return !!(obj && obj.cloud === 1 && typeof obj.iv === 'string' && typeof obj.data === 'string');
}

export async function encryptCloudPayload(plaintext: string, rawKeyB64: string): Promise<CloudBundle> {
    const iv = randomBytes(12);
    const encrypted = await aesGcmEncrypt(base64ToBuff(rawKeyB64), iv, new TextEncoder().encode(plaintext));
    return {
        cloud: 1,
        iv: buffToBase64(iv),
        data: buffToBase64(encrypted),
    };
}

export async function decryptCloudPayload(bundle: any, rawKeyB64: string): Promise<string | null> {
    try {
        if (!isCloudEncrypted(bundle)) return null;
        const decrypted = await aesGcmDecrypt(
            base64ToBuff(rawKeyB64),
            base64ToBuff(bundle.iv),
            base64ToBuff(bundle.data),
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null;
    }
}

// --- Lab timing ---

/** A lab drawn more than this long after the last dose is not tied to one dose. */
const LAB_DOSE_LOOKBACK_H = 30 * 24;

export interface LabDoseContext {
    /** The newest dose of the lab's hormone at or before the draw. */
    event: DoseEvent;
    /** Hours from that dose to the draw. */
    hoursBefore: number;
    /** For a sublingual dose, the hold time in minutes it was logged with. */
    holdMin: number | null;
}

/** The hold time a sublingual dose was logged with: a custom one, its tier's, or the standard tier's. */
export function sublingualHoldMin(e: DoseEvent): number | null {
    if (e.route !== Route.sublingual) return null;
    const theta = e.extras[ExtraKey.sublingualTheta];
    if (typeof theta === 'number' && Number.isFinite(theta)) return Math.round(sublingualHoldFromTheta(theta));
    const tier = e.extras[ExtraKey.sublingualTier];
    const idx =
        typeof tier === 'number' && Number.isFinite(tier)
            ? Math.min(SL_TIER_ORDER.length - 1, Math.max(0, Math.round(tier)))
            : SL_TIER_ORDER.indexOf('standard');
    return SublingualTierParams[SL_TIER_ORDER[idx]].hold;
}

/**
 * The dose a lab reads after: the newest dose of the lab's hormone (estradiol
 * for an E2 lab, testosterone for a T lab) logged at or before the draw, and
 * how long before it. This is the timing a lab needs to be compared with the
 * model, and what a sublingual calibration (issue #22) asks for. Null when no
 * such dose falls in the 30 days before the draw.
 */
export function labDoseContext(lab: LabResult, events: DoseEvent[]): LabDoseContext | null {
    const isT = isT_LabUnit(lab.unit);
    let best: DoseEvent | null = null;
    for (const e of events) {
        if (e.route === Route.patchRemove || e.timeH > lab.timeH) continue;
        if (lab.timeH - e.timeH > LAB_DOSE_LOOKBACK_H) continue;
        if (isT ? !T_ESTERS.has(e.ester) : !isEstradiolEster(e.ester)) continue;
        if (!best || e.timeH > best.timeH) best = e;
    }
    if (!best) return null;
    return { event: best, hoursBefore: lab.timeH - best.timeH, holdMin: sublingualHoldMin(best) };
}

/**
 * What the model, before any calibration, says for the lab's hormone at the
 * draw: estradiol in pg/mL or total testosterone in ng/dL, the units the lab
 * is converted to for comparing. Null where the model has nothing to say
 * (no dose yet, or a level too small to compare with).
 */
export function rawModelAtLab(sim: SimulationResult | null, lab: LabResult): number | null {
    if (!sim) return null;
    const v = isT_LabUnit(lab.unit)
        ? interpolateConcentration_T(sim, lab.timeH)
        : interpolateConcentration_E2(sim, lab.timeH);
    return v != null && Number.isFinite(v) && v >= 1 ? v : null;
}

/** The lab converted to the unit the model uses for its hormone (pg/mL E2, ng/dL T). */
export function labInModelUnit(lab: LabResult): number {
    return isT_LabUnit(lab.unit) ? convertToNgDl(lab.concValue, lab.unit) : convertToPgMl(lab.concValue, lab.unit);
}
