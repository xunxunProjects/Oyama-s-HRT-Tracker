import { useState, useEffect, useMemo, useRef } from 'react';
import type { ShowDialog } from '../contexts/DialogContext';
import {
    DoseEvent,
    SimulationResult,
    runSimulation,
    interpolateConcentration_E2,
    interpolateConcentration_CPA,
    interpolateConcentration_T,
    LabResult,
    computeCalibration,
    CalibrationMethod,
    CalibrationHistoryMode,
    normalizeCalibrationMethod,
    PKCustomParams,
    applyPKOverrides,
    sanitizePKParams,
    isPlausibleBirthYear,
} from '../../logic';
import { createDayLabelFormatter, toDayKey } from '../utils/helpers';
import { detectRegimens, dosesAhead, normalizeSupply, Supply } from '../utils/regimen';
import { PlanItem, normalizePlanItem, legacyCpaItem, regimensFromPlan } from '../utils/plan';
import {
    DoseTemplate,
    QuickDose,
    applySyncedStateToStorage,
    buildExportPayloadFromStorage,
    readTombstonesFromStorage,
    writeTombstonesToStorage,
} from '../utils/backupState';
import { ImportActiveRecords, mergeImportedDataToStorage, processImportedDataToStorage } from '../utils/backupImport';
import {
    buildCompleteBackupBundleReportFromStorage,
    inspectCompleteBackupBundle,
    mergeCompleteBackupBundleToStorage,
    replaceCompleteBackupBundleToStorage,
    type CompleteBackupActive,
} from '../utils/backupBundle';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useAuth } from '../contexts/AuthContext';
import { RecordKind, SyncState, Tombstones } from '../utils/syncMerge';

/** Namespace used while signed out. Its keys are the original, un-prefixed ones. */
const LOCAL_OWNER = 'local';

// Storage keys are namespaced by account as well as by HRT mode. Without the
// account half, a shared device (family tablet, clinic kiosk, installed PWA)
// showed the previous user's full dose history to whoever signed in next, and
// the auto-backup then encrypted those records under the new account's key and
// uploaded them.
//
// Signed-out keys keep their original, un-prefixed names, so records written
// before this change — and by anyone who never signs in — are still found
// exactly where they were.
const nsFor = (owner: string, suffix: string) => (owner === LOCAL_OWNER ? `hrt-${suffix}` : `hrt-u${owner}-${suffix}`);

const modeKeyFor = (owner: string, mode: 'transfem' | 'transmasc', suffix: string) =>
    nsFor(owner, mode === 'transmasc' ? `masc-${suffix}` : suffix);

const MODE_SUFFIXES = ['events', 'lab-results', 'dose-templates', 'quick-doses', 'deletions'] as const;
const SHARED_SUFFIXES = [
    'weight',
    'pk-params',
    'cal-method',
    'cal-history-mode',
    'weight-at',
    'pk-params-at',
    'birth-year',
    'birth-year-at',
] as const;

/**
 * First sign-in on this device adopts whatever was recorded while signed out.
 *
 * The entries are *moved*, not copied: leaving a copy behind under the
 * signed-out names is exactly the leak this namespacing exists to close, since
 * the next person to use the device would land on them. Adoption is skipped
 * once the account's namespace holds anything, so signing in on a second device
 * can't overwrite records already there.
 */
function adoptSignedOutData(owner: string): void {
    if (owner === LOCAL_OWNER) return;
    const moves: [string, string][] = [];
    for (const m of ['transfem', 'transmasc'] as const) {
        for (const s of MODE_SUFFIXES) {
            moves.push([modeKeyFor(LOCAL_OWNER, m, s), modeKeyFor(owner, m, s)]);
        }
    }
    for (const s of SHARED_SUFFIXES) moves.push([nsFor(LOCAL_OWNER, s), nsFor(owner, s)]);

    if (moves.some(([, to]) => localStorage.getItem(to) !== null)) return;
    for (const [from, to] of moves) {
        const value = localStorage.getItem(from);
        if (value === null) continue;
        localStorage.setItem(to, value);
        localStorage.removeItem(from);
    }
}

export type { DoseTemplate, QuickDose } from '../utils/backupState';

/** One day's worth of dose records, as the history list renders them. */
export interface DoseDayGroup {
    /** Stable "YYYY-MM-DD" identity. For grouping and React keys, never for display. */
    key: string;
    /** What the section heading shows, in the reader's language. */
    label: string;
    events: DoseEvent[];
}

/**
 * `withPrediction`: run the look-ahead simulation the Overview chart draws past "now". Off by default in Settings.
 * `withAge`: let the year of birth adjust the model (the age beta in Settings, off by default).
 */
export const useAppData = (
    showDialog: ShowDialog,
    { withPrediction = false, withAge = false }: { withPrediction?: boolean; withAge?: boolean } = {},
) => {
    const { t, lang } = useTranslation();
    const { mode, isTransmasc } = useHRTMode();
    const { user } = useAuth();

    // Everything below is scoped to (account, mode). `scope` is the composite the
    // reload/persist handshake keys on — see loadedScopeRef.
    const owner = user?.id ?? LOCAL_OWNER;
    const scope = `${owner}|${mode}`;
    const keyFor = (m: 'transfem' | 'transmasc', suffix: string) => modeKeyFor(owner, m, suffix);
    const sharedKey = (suffix: string) => nsFor(owner, suffix);

    const loadJSON = <T>(key: string, fallback: T): T => {
        try {
            const s = localStorage.getItem(key);
            return s ? (JSON.parse(s) as T) : fallback;
        } catch {
            return fallback;
        }
    };

    // --- Deletion log ------------------------------------------------------
    // Cloud sync unions records by id, so without a record of what was deleted
    // "the cloud has an id we don't" always reads as "another device added it".
    // Every deletion this device makes therefore leaves a tombstone, which is
    // what makes a delete stick instead of coming back on the next sync.
    // Tombstones live outside React state: they are never rendered, and reading
    // them straight from storage keeps deletes correct even when several land in
    // the same commit.
    const readTombstones = (m: 'transfem' | 'transmasc'): Tombstones =>
        readTombstonesFromStorage(localStorage, owner, m);

    const writeTombstones = (m: 'transfem' | 'transmasc', next: Tombstones) => {
        writeTombstonesToStorage(localStorage, owner, m, next);
    };

    const recordDeletions = (kind: RecordKind, ids: string[], m: 'transfem' | 'transmasc' = mode) => {
        if (!ids.length) return;
        const current = readTombstones(m);
        const at = Date.now();
        for (const id of ids) if (id) current[kind][id] = at;
        writeTombstones(m, current);
    };

    /**
     * Bringing a record back by hand — a file import, an explicit merge from a
     * backup — has to clear its tombstone, or the sync engine would dutifully
     * delete it again as soon as it ran.
     */
    const forgetDeletions = (kind: RecordKind, ids: string[], m: 'transfem' | 'transmasc' = mode) => {
        if (!ids.length) return;
        const current = readTombstones(m);
        let touched = false;
        for (const id of ids) {
            if (current[kind][id] !== undefined) {
                delete current[kind][id];
                touched = true;
            }
        }
        if (touched) writeTombstones(m, current);
    };

    // --- State ---
    const [events, setEvents] = useState<DoseEvent[]>(() => loadJSON(keyFor(mode, 'events'), [] as DoseEvent[]));
    const [weight, setWeightState] = useState<number>(() => {
        // Weight is shared across modes (a physical attribute of the person).
        const saved = localStorage.getItem(sharedKey('weight'));
        return saved ? parseFloat(saved) : 70.0;
    });
    // Weight and the PK overrides are single values, not record sets, so sync
    // resolves them last-write-wins — which needs a "when" alongside the "what".
    // Stamped here at the point of an actual user edit; the reload effect and
    // the sync apply path use the raw setters so neither forges a fresh write.
    const setWeight = (w: number) => {
        setWeightState(w);
        localStorage.setItem(sharedKey('weight-at'), String(Date.now()));
    };
    // Optional, unlike weight: none leaves the model at the age it was fitted
    // on (AGE_REF_YEARS). Shared across modes and synced the same way.
    const loadBirthYear = (): number | null => {
        const saved = Number(localStorage.getItem(sharedKey('birth-year')));
        return isPlausibleBirthYear(saved) ? saved : null;
    };
    const [birthYear, setBirthYearState] = useState<number | null>(loadBirthYear);
    const setBirthYear = (y: number | null) => {
        setBirthYearState(y);
        localStorage.setItem(sharedKey('birth-year-at'), String(Date.now()));
    };
    // What the model is given. With the beta off the year of birth is kept,
    // and still synced, but left out, so switching it back on brings it back.
    const modelBirthYear = withAge ? birthYear : null;
    const [labResults, setLabResults] = useState<LabResult[]>(() =>
        loadJSON(keyFor(mode, 'lab-results'), [] as LabResult[]),
    );
    const [calibrationMethod, setCalibrationMethodState] = useState<CalibrationMethod>(() =>
        // Hybrid-MIPD is the default; legacy 'average'/'adaptive' values are migrated.
        normalizeCalibrationMethod(localStorage.getItem(sharedKey('cal-method'))),
    );
    const setCalibrationMethod = (m: CalibrationMethod) => {
        setCalibrationMethodState(m);
        localStorage.setItem(sharedKey('cal-method'), m);
    };
    const [calibrationHistoryMode, setCalibrationHistoryModeState] = useState<CalibrationHistoryMode>(() => {
        const saved = localStorage.getItem(sharedKey('cal-history-mode'));
        return saved === 'forward' ? 'forward' : 'retrospective';
    });
    const setCalibrationHistoryMode = (m: CalibrationHistoryMode) => {
        setCalibrationHistoryModeState(m);
        localStorage.setItem(sharedKey('cal-history-mode'), m);
    };
    const [doseTemplates, setDoseTemplates] = useState<DoseTemplate[]>(() =>
        loadJSON(keyFor(mode, 'dose-templates'), [] as DoseTemplate[]),
    );
    const [quickDoses, setQuickDoses] = useState<QuickDose[]>(() =>
        loadJSON(keyFor(mode, 'quick-doses'), [] as QuickDose[]),
    );
    // What's left of each medicine on hand. Kept on this device only, like quick
    // doses: it is a count of the drawer, not part of the medical record, so it
    // stays out of exports and cloud sync.
    const loadSupplies = (m: 'transfem' | 'transmasc') =>
        loadJSON<unknown[]>(keyFor(m, 'supplies'), [])
            .map(normalizeSupply)
            .filter((x): x is Supply => x !== null);
    const [supplies, setSupplies] = useState<Supply[]>(() => loadSupplies(mode));
    const [pkParams, setPkParamsState] = useState<PKCustomParams | null>(() => {
        const saved = localStorage.getItem(sharedKey('pk-params'));
        if (!saved) return null;
        try {
            const parsed = sanitizePKParams(JSON.parse(saved));
            applyPKOverrides(parsed); // Apply immediately so first simulation uses custom params
            return parsed;
        } catch {
            return null;
        }
    });

    // The medication plan, entered by the person. Kept on this device, like supplies.
    const loadPlan = (m: 'transfem' | 'transmasc'): PlanItem[] => {
        if (localStorage.getItem(keyFor(m, 'plan')) === null && m === 'transfem') {
            const cpa = legacyCpaItem(localStorage.getItem(sharedKey('cpa-plan')));
            if (cpa) return [cpa];
        }
        return loadJSON<unknown[]>(keyFor(m, 'plan'), [])
            .map(normalizePlanItem)
            .filter((x): x is PlanItem => x !== null);
    };
    const [plan, setPlan] = useState<PlanItem[]>(() => loadPlan(mode));

    const [currentTime, setCurrentTime] = useState(new Date());

    // --- Effects ---
    // Tracks the (account, mode) scope whose data is currently held in state.
    // Persist effects must wait until the reload effect has swapped state to the
    // new scope's data, otherwise stale state would overwrite the newly-selected
    // scope's localStorage entries — writing the previous mode's doses into this
    // mode, or worse, the previous account's into this one.
    //
    // IMPORTANT: setState calls inside the reload effect do NOT apply to the
    // current commit — they schedule a re-render. Any persist effect that also
    // runs in the *same* commit (because `scope` is in its dep array) would
    // therefore observe stale state. We mark the ref as `null` during reload so
    // persist effects skip, and re-establish it only after the new data has
    // actually flushed into state (detected in a follow-up effect that also
    // watches the data itself).
    const loadedScopeRef = useRef<string | null>(scope);

    // Reload every piece of scoped state whenever the HRT mode OR the signed-in
    // account changes. Signing out drops `owner` back to the signed-out
    // namespace, which is empty once the account adopted it — that is what stops
    // the next person on a shared device from seeing the last one's records.
    //
    // Declared before the persist effects on purpose: on mount it runs first, so
    // adoption happens before any persist effect can write an empty array into
    // the account's namespace and make adoption think it was already used.
    useEffect(() => {
        adoptSignedOutData(owner);
        loadedScopeRef.current = null;
        setEvents(loadJSON(keyFor(mode, 'events'), [] as DoseEvent[]));
        setLabResults(loadJSON(keyFor(mode, 'lab-results'), [] as LabResult[]));
        setDoseTemplates(loadJSON(keyFor(mode, 'dose-templates'), [] as DoseTemplate[]));
        setQuickDoses(loadJSON(keyFor(mode, 'quick-doses'), [] as QuickDose[]));
        setSupplies(loadSupplies(mode));
        setPlan(loadPlan(mode));
        // Mode-independent, but still per-account, so they reload on the same beat.
        const savedWeight = localStorage.getItem(sharedKey('weight'));
        setWeightState(savedWeight ? parseFloat(savedWeight) : 70.0);
        setBirthYearState(loadBirthYear());
        setCalibrationMethodState(normalizeCalibrationMethod(localStorage.getItem(sharedKey('cal-method'))));
        setCalibrationHistoryModeState(
            localStorage.getItem(sharedKey('cal-history-mode')) === 'forward' ? 'forward' : 'retrospective',
        );
        setPkParamsState(sanitizePKParams(loadJSON<unknown>(sharedKey('pk-params'), null)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);

    // Mark the ref as "loaded for this mode" only after state updates have
    // flushed. Runs on every data mutation for the current mode, which is
    // harmless (idempotent assignment).
    //
    // `mode` is intentionally NOT in the dep array: including it would cause
    // this effect to fire in the same commit as the reload effect (which also
    // depends on `mode`), re-setting the ref to the new mode *before* the
    // reload's setState calls have flushed. The persist effects — which also
    // depend on `mode` and run in that same commit — would then observe
    // ref === mode and overwrite the new mode's localStorage with stale
    // previous-mode state. Watching only the data ensures we re-arm the ref
    // exactly when the reload's setState calls have actually committed
    // (because loadJSON always returns fresh array references).
    //
    // `readyScope` mirrors the ref into render output for the same reason, but
    // for consumers outside this hook: cloud sync must not read (let alone
    // upload) a payload assembled mid-switch, when in-memory state still belongs
    // to the previous account while the storage keys already point at the new
    // one. It waits for readyScope === scope.
    const [readyScope, setReadyScope] = useState<string>(scope);
    useEffect(() => {
        loadedScopeRef.current = scope;
        setReadyScope(prev => (prev === scope ? prev : scope));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, labResults, doseTemplates, quickDoses, supplies, plan]);

    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'events'), JSON.stringify(events));
    }, [events, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(sharedKey('weight'), weight.toString());
    }, [weight, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        if (birthYear !== null) localStorage.setItem(sharedKey('birth-year'), String(birthYear));
        else localStorage.removeItem(sharedKey('birth-year'));
    }, [birthYear, scope]);
    useEffect(() => {
        // The override is applied unconditionally — the simulation must track
        // whatever is in state right now. Only the *write* waits for the scope
        // handshake, so a mid-switch commit can't persist the previous account's
        // parameters into this one's namespace.
        applyPKOverrides(pkParams);
        if (loadedScopeRef.current !== scope) return;
        if (pkParams) {
            localStorage.setItem(sharedKey('pk-params'), JSON.stringify(pkParams));
        } else {
            localStorage.removeItem(sharedKey('pk-params'));
        }
    }, [pkParams, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'lab-results'), JSON.stringify(labResults));
    }, [labResults, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'dose-templates'), JSON.stringify(doseTemplates));
    }, [doseTemplates, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'quick-doses'), JSON.stringify(quickDoses));
    }, [quickDoses, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'supplies'), JSON.stringify(supplies));
    }, [supplies, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'plan'), JSON.stringify(plan));
        // The plan now carries what the standalone cyproterone choice used to.
        localStorage.removeItem(sharedKey('cpa-plan'));
    }, [plan, scope]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);
    // The clock only ticks once a minute, so a dose logged "now" is later than
    // it and reads as scheduled for the future until the next tick. Catch the
    // clock up whenever the log changes.
    useEffect(() => {
        setCurrentTime(new Date());
    }, [events]);

    // Derived in the same render as the events it comes from. As an effect it
    // landed one render late, so every open of the Overview with data (and
    // every import) first drew the chart with doses but no curve, which fell
    // through to the chart's "no records" state for as long as the simulation
    // took to run.
    const simulation = useMemo<SimulationResult | null>(
        () => (events.length > 0 ? runSimulation(events, weight, modelBirthYear) : null),
        [events, weight, modelBirthYear],
    );

    // What the person is taking now: their plan when they have entered one,
    // otherwise whatever rhythm the log shows. Moves with the clock so that
    // "last dose" and "next dose" stay current.
    const regimens = useMemo(() => {
        const nowH = currentTime.getTime() / 3600000;
        return plan.length ? regimensFromPlan(plan, events, nowH) : detectRegimens(events, nowH);
    }, [plan, events, currentTime]);

    // The chart's future. The simulation above runs on the log alone, so past
    // "now" it only ever drew the last dose washing out: a crash to zero on
    // every visit, plan or no plan. This is the same model with each current
    // regimen's next doses added, up to where that simulation ends. Keyed on
    // those doses, not the clock, so it reruns when one is logged or a slot
    // passes rather than every minute; and run on the last 120 days of the log,
    // since older doses move the future by less than 0.01% (see MC_HISTORY_H).
    // Not run at all while the prediction curve is switched off.
    const doses = useMemo(() => {
        if (!withPrediction || !simulation || !simulation.timeH.length) return [];
        const nowH = currentTime.getTime() / 3600000;
        return dosesAhead(regimens, nowH, simulation.timeH[simulation.timeH.length - 1]);
    }, [withPrediction, simulation, regimens, currentTime]);
    const dosesKey = doses.map(e => `${e.route}|${e.ester}|${e.doseMG}|${e.timeH}`).join(',');
    const simulationAhead = useMemo<SimulationResult | null>(() => {
        if (!doses.length) return null;
        const fromH = Math.min(...doses.map(e => e.timeH)) - 120 * 24;
        return runSimulation([...events.filter(e => e.timeH >= fromH), ...doses], weight, modelBirthYear);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dosesKey, events, weight, modelBirthYear]);

    // --- Derived State ---
    // Self-learning calibration: fits a personal amplitude (+ clearance, for the
    // EKF/MIPD models) to the user's labs via the selected estimator and history
    // mode. Returns the scale function plus the learned parameters and per-lab
    // comparison used by the Lab page UI.
    const calibration = useMemo(() => {
        return computeCalibration(
            simulation,
            events,
            weight,
            labResults,
            calibrationMethod,
            calibrationHistoryMode,
            modelBirthYear,
        );
    }, [simulation, events, weight, modelBirthYear, labResults, calibrationMethod, calibrationHistoryMode]);
    const calibrationFn = calibration.factorFn;

    const currentLevel = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        const baseE2 = interpolateConcentration_E2(simulation, h) || 0;
        return baseE2 * calibrationFn(h);
    }, [simulation, currentTime, calibrationFn]);

    // Cyproterone (ng/mL) at the current time. Uncalibrated: labs measure E2 only.
    const currentCPA = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        return interpolateConcentration_CPA(simulation, h) || 0;
    }, [simulation, currentTime]);

    // Total testosterone (ng/dL) at the current time — only meaningful in transmasc mode.
    const currentT = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        return interpolateConcentration_T(simulation, h) || 0;
    }, [simulation, currentTime]);

    // One section per local calendar day, newest first.
    //
    // #69: this used to accumulate into an object keyed by the day's *display*
    // label, which carries no year, so a dose on 2025-08-27 and one on 2026-08-27
    // hashed to the same bucket and rendered under a single "8月27日" heading.
    // Key and heading are two separate values now.
    //
    // An array rather than a Record, because `sorted` is already newest-first and
    // run-length grouping keeps that order structurally. Object key enumeration
    // would not: it quietly re-sorts any key that looks like an array index, so a
    // key such as "20260827" would have come back oldest-first.
    const groupedEvents = useMemo<DoseDayGroup[]>(() => {
        const formatLabel = createDayLabelFormatter(lang);
        const sorted = [...events].sort((a, b) => b.timeH - a.timeH);
        const groups: DoseDayGroup[] = [];
        for (const e of sorted) {
            const at = new Date(e.timeH * 3600000);
            const key = toDayKey(at);
            const last = groups[groups.length - 1];
            if (last && last.key === key) last.events.push(e);
            else groups.push({ key, label: formatLabel(at), events: [e] });
        }
        return groups;
    }, [events, lang]);

    const currentStatus = useMemo(() => {
        if (isTransmasc) {
            // Transmasc: total T status bands (ng/dL). Reference: male range 300–1000 ng/dL.
            if (currentT > 0) {
                const c = currentT;
                if (c > 1000)
                    return {
                        label: 'status.level.t_high',
                        color: 'text-[var(--warning)]',
                        bg: 'bg-[var(--surface-muted)]',
                        border: 'border-[var(--border)]',
                    };
                if (c >= 600)
                    return {
                        label: 'status.level.t_upper',
                        color: 'text-[var(--status-positive)]',
                        bg: 'bg-[var(--surface-muted)]',
                        border: 'border-[var(--border)]',
                    };
                if (c >= 300)
                    return {
                        label: 'status.level.t_male',
                        color: 'text-[var(--status-positive)]',
                        bg: 'bg-[var(--surface-muted)]',
                        border: 'border-[var(--border)]',
                    };
                if (c >= 100)
                    return {
                        label: 'status.level.t_subtarget',
                        color: 'text-[var(--status-violet)]',
                        bg: 'bg-[var(--surface-muted)]',
                        border: 'border-[var(--border)]',
                    };
                return {
                    label: 'status.level.t_low',
                    color: 'text-[var(--status-neutral)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            }
            return null;
        }
        if (currentLevel > 0) {
            const conc = currentLevel;
            if (conc > 300)
                return {
                    label: 'status.level.high',
                    color: 'text-[var(--warning)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            if (conc >= 100 && conc <= 200)
                return {
                    label: 'status.level.mtf',
                    color: 'text-[var(--status-positive)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            if (conc >= 70 && conc <= 300)
                return {
                    label: 'status.level.luteal',
                    color: 'text-[var(--status-info)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            if (conc >= 30 && conc < 70)
                return {
                    label: 'status.level.follicular',
                    color: 'text-[var(--status-violet)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            if (conc >= 8 && conc < 30)
                return {
                    label: 'status.level.male',
                    color: 'text-[var(--status-neutral)]',
                    bg: 'bg-[var(--surface-muted)]',
                    border: 'border-[var(--border)]',
                };
            return {
                label: 'status.level.low',
                color: 'text-[var(--warning)]',
                bg: 'bg-[var(--surface-muted)]',
                border: 'border-[var(--border)]',
            };
        }
        return null;
    }, [currentLevel, currentT, isTransmasc]);

    // --- Actions ---
    // Every write goes through here, which makes this the one place that has to
    // stamp `updatedAt`. Sync uses the stamp to tell an edit from its older
    // twin; an unstamped record silently loses that argument.
    const stamp = <T extends object>(record: T): T & { updatedAt: number } => ({ ...record, updatedAt: Date.now() });

    const addEvent = (e: DoseEvent) => {
        forgetDeletions('events', [e.id]);
        setEvents(prev => [...prev, stamp(e)]);
    };
    const addEvents = (list: DoseEvent[]) => {
        if (!list.length) return;
        forgetDeletions(
            'events',
            list.map(e => e.id),
        );
        setEvents(prev => [...prev, ...list.map(stamp)]);
    };
    const updateEvent = (e: DoseEvent) => {
        const next = stamp(e);
        setEvents(prev => prev.map(p => (p.id === e.id ? next : p)));
    };
    const deleteEvent = (id: string) => {
        recordDeletions('events', [id]);
        setEvents(prev => prev.filter(e => e.id !== id));
    };
    const deleteEvents = (ids: string[]) => {
        if (!ids.length) return;
        recordDeletions('events', ids);
        const idSet = new Set(ids);
        setEvents(prev => prev.filter(e => !idSet.has(e.id)));
    };
    const clearAllEvents = () => {
        if (!events.length) return;
        showDialog(
            'confirm',
            t('drawer.clear_confirm'),
            () => {
                recordDeletions(
                    'events',
                    events.map(e => e.id),
                );
                setEvents([]);
            },
            { danger: true, confirmLabel: t('btn.delete') },
        );
    };

    const addLabResult = (res: LabResult) => {
        forgetDeletions('labResults', [res.id]);
        setLabResults(prev => [...prev, stamp(res)]);
    };
    const updateLabResult = (res: LabResult) => {
        const next = stamp(res);
        setLabResults(prev => prev.map(r => (r.id === res.id ? next : r)));
    };
    const deleteLabResult = (id: string) => {
        recordDeletions('labResults', [id]);
        setLabResults(prev => prev.filter(r => r.id !== id));
    };
    const clearLabResults = () => {
        if (!labResults.length) return;
        showDialog(
            'confirm',
            t('lab.clear_confirm'),
            () => {
                recordDeletions(
                    'labResults',
                    labResults.map(r => r.id),
                );
                setLabResults([]);
            },
            { danger: true, confirmLabel: t('btn.delete') },
        );
    };

    const addTemplate = (template: DoseTemplate) => {
        forgetDeletions('doseTemplates', [template.id]);
        setDoseTemplates(prev => [...prev, stamp(template)]);
    };
    const deleteTemplate = (id: string) => {
        recordDeletions('doseTemplates', [id]);
        setDoseTemplates(prev => prev.filter(t => t.id !== id));
    };

    // Quick doses are a per-device shortcut list, not part of the record — they
    // are neither exported nor synced, so no tombstone is needed.
    const addQuickDose = (dose: QuickDose) => setQuickDoses(prev => [...prev, dose]);
    const saveSupply = (supply: Supply) =>
        setSupplies(prev =>
            prev.some(s => s.id === supply.id) ? prev.map(s => (s.id === supply.id ? supply : s)) : [...prev, supply],
        );
    const deleteSupply = (id: string) => setSupplies(prev => prev.filter(s => s.id !== id));
    const savePlanItem = (item: PlanItem) =>
        setPlan(prev =>
            prev.some(i => i.id === item.id) ? prev.map(i => (i.id === item.id ? item : i)) : [...prev, item],
        );
    const deletePlanItem = (id: string) => setPlan(prev => prev.filter(i => i.id !== id));
    const deleteQuickDose = (id: string) => setQuickDoses(prev => prev.filter(d => d.id !== id));

    const touchPkParams = () => localStorage.setItem(sharedKey('pk-params-at'), String(Date.now()));
    const setPkParams = (params: PKCustomParams) => {
        touchPkParams();
        setPkParamsState(params);
    };
    const clearPkParams = () => {
        touchPkParams();
        setPkParamsState(null);
    };
    /**
     * `check`: only say whether the payload holds anything to import, writing
     * nothing and showing nothing, so the import can ask "replace your
     * records?" for a file that can actually replace them and report a bad
     * file straight away instead.
     *
     * The reconciliation itself lives in `backupImport.ts`; this wrapper owns
     * only React state, the weight/PK setters, and the dialog.
     */
    const processImportedData = (parsed: any, { check = false }: { check?: boolean } = {}): boolean => {
        try {
            const active: ImportActiveRecords = { events, labResults, doseTemplates, weight, birthYear };
            const result = processImportedDataToStorage(
                parsed,
                { storage: localStorage, owner, mode, active },
                { check },
            );
            if (check) return true;
            if (result.events !== undefined) setEvents(result.events);
            if (result.labResults !== undefined) setLabResults(result.labResults);
            if (result.doseTemplates !== undefined) setDoseTemplates(result.doseTemplates);
            if (result.weight !== undefined) setWeight(result.weight);
            if (result.birthYear !== undefined) setBirthYear(result.birthYear);
            if (result.pkParams !== undefined) setPkParams(result.pkParams);

            showDialog('alert', t('drawer.import_success'));
            return true;
        } catch (err) {
            if (check) return false;
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const mergeImportedData = (parsed: any): boolean => {
        try {
            const active: ImportActiveRecords = { events, labResults, doseTemplates, weight, birthYear };
            const result = mergeImportedDataToStorage(parsed, { storage: localStorage, owner, mode, active });

            // Append only the new ids, using the same functional setters as
            // before. Tombstone clearing and other-mode merges already happened
            // in the helper.
            if (result.events.length > 0) setEvents(prev => [...prev, ...result.events]);
            if (result.weight !== undefined) setWeight(result.weight);
            if (result.birthYear !== undefined) setBirthYear(result.birthYear);
            if (result.labResults.length > 0) setLabResults(prev => [...prev, ...result.labResults]);
            if (result.doseTemplates.length > 0) setDoseTemplates(prev => [...prev, ...result.doseTemplates]);

            showDialog('alert', (t('account.merge_success') as string).replace('{n}', String(result.mergedCount)));
            return true;
        } catch (err) {
            console.error(err);
            showDialog('alert', t('account.merge_failed'));
            return false;
        }
    };

    const buildExportPayload = () =>
        buildExportPayloadFromStorage(localStorage, owner, mode, {
            events,
            labResults,
            doseTemplates,
            weight,
            birthYear,
            pkParams,
        });

    const completeBackupActive = (): CompleteBackupActive => ({
        events,
        labResults,
        doseTemplates,
        quickDoses,
        supplies,
        plan,
        weight,
        pkParams,
        calibrationMethod,
        calibrationHistoryMode,
    });

    /**
     * Unencrypted complete-device bundle plus a report of records dropped,
     * duplicate ids collapsed, or timestamps refused by the same bounds the
     * importer applies. Encryption belongs to the Tools project.
     */
    const buildCompleteBackupBundle = (createdAt?: string) =>
        buildCompleteBackupBundleReportFromStorage(localStorage, owner, mode, completeBackupActive(), createdAt);

    /** Validate and count a complete bundle without writing anything. */
    const previewCompleteBackupBundle = (parsed: unknown) =>
        inspectCompleteBackupBundle(parsed, {
            storage: localStorage,
            owner,
            mode,
            active: completeBackupActive(),
        });

    /**
     * Merge the safe categories of a complete bundle and install the active
     * mode's merged arrays. Preferences are returned to the caller because they
     * live in React contexts/state, not in this hook.
     */
    const applyCompleteBackupBundle = (parsed: unknown) => {
        const result = mergeCompleteBackupBundleToStorage(parsed, {
            storage: localStorage,
            owner,
            mode,
            active: completeBackupActive(),
        });
        const active = result.modes[mode];
        if (active?.events !== undefined) setEvents(active.events);
        if (active?.labResults !== undefined) setLabResults(active.labResults);
        if (active?.doseTemplates !== undefined) setDoseTemplates(active.doseTemplates);
        if (active?.quickDoses !== undefined) setQuickDoses(active.quickDoses);
        if (active?.supplies !== undefined) setSupplies(active.supplies);
        if (active?.plan !== undefined) setPlan(active.plan);
        if (result.weight !== undefined) setWeightState(result.weight);
        if (result.pkParams !== undefined) setPkParamsState(result.pkParams);
        if (result.calibration) {
            setCalibrationMethodState(result.calibration.method);
            setCalibrationHistoryModeState(result.calibration.historyMode);
        }
        return result;
    };

    /**
     * Replace both modes' record stores and the shared scalars from a complete
     * bundle. The storage helper owns the crash journal; this wrapper only
     * installs the active mode's arrays and scalar state after it returns.
     */
    const replaceCompleteBackupBundle = (parsed: unknown) => {
        const result = replaceCompleteBackupBundleToStorage(parsed, {
            storage: localStorage,
            owner,
            mode,
            active: completeBackupActive(),
        });
        const active = result.modes[mode];
        if (active?.events !== undefined) setEvents(active.events);
        if (active?.labResults !== undefined) setLabResults(active.labResults);
        if (active?.doseTemplates !== undefined) setDoseTemplates(active.doseTemplates);
        if (active?.quickDoses !== undefined) setQuickDoses(active.quickDoses);
        if (active?.supplies !== undefined) setSupplies(active.supplies);
        if (active?.plan !== undefined) setPlan(active.plan);
        if (result.weight !== undefined) setWeightState(result.weight);
        if (result.pkParams !== undefined) setPkParamsState(result.pkParams);
        setCalibrationMethodState(result.calibration.method);
        setCalibrationHistoryModeState(result.calibration.historyMode);
        return result;
    };

    /**
     * Install the result of a cloud sync. Deliberately silent: this runs on its
     * own schedule, not because anyone pressed anything, and a dialog for it
     * would fire at arbitrary moments.
     *
     * Records go through the same sanitisers as a file import — the payload has
     * made a round trip through storage this device does not control, and the
     * import limits (entry ceiling, field validation, timestamp range) are the
     * reason a malformed one can't wedge the simulation.
     */
    const applySyncedState = (state: SyncState): void => {
        // The helper sanitises both modes before writing. It can still leave
        // partial localStorage writes if a later setItem throws; the helper
        // returns only after all writes succeed, and no transaction is claimed.
        const applied = applySyncedStateToStorage(localStorage, owner, mode, state);
        setEvents(applied.active.events);
        setLabResults(applied.active.labResults);
        setDoseTemplates(applied.active.doseTemplates);
        if (applied.weight !== undefined) setWeightState(applied.weight);
        if (applied.birthYear !== undefined) setBirthYearState(applied.birthYear);
        if (applied.pkParams !== undefined) setPkParamsState(applied.pkParams);
    };

    return {
        events,
        weight,
        setWeight,
        birthYear,
        setBirthYear,
        modelBirthYear,
        labResults,
        doseTemplates,
        quickDoses,
        pkParams,
        setPkParams,
        clearPkParams,
        simulation,
        currentTime,
        calibrationFn,
        calibrationMethod,
        setCalibrationMethod,
        calibrationHistoryMode,
        setCalibrationHistoryMode,
        calibration,
        currentLevel,
        currentCPA,
        plan,
        savePlanItem,
        deletePlanItem,
        currentT,
        currentStatus,
        simulationAhead,
        groupedEvents,
        addEvent,
        addEvents,
        updateEvent,
        deleteEvent,
        deleteEvents,
        clearAllEvents,
        addLabResult,
        updateLabResult,
        deleteLabResult,
        clearLabResults,
        addTemplate,
        deleteTemplate,
        addQuickDose,
        deleteQuickDose,
        regimens,
        supplies,
        saveSupply,
        deleteSupply,
        processImportedData,
        mergeImportedData,
        buildExportPayload,
        buildCompleteBackupBundle,
        previewCompleteBackupBundle,
        applyCompleteBackupBundle,
        replaceCompleteBackupBundle,
        applySyncedState,
        // (account, mode) currently selected vs. the one whose data is actually
        // in state. Cloud sync waits for the two to agree — see readyScope.
        scope,
        readyScope,
    };
};
