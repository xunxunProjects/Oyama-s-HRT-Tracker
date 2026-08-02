import { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, SimulationResult, runSimulation, interpolateConcentration_E2, interpolateConcentration_CPA, interpolateConcentration_T, LabResult, computeCalibration, CalibrationMethod, CalibrationHistoryMode, normalizeCalibrationMethod, isTestosteroneEster, isT_LabUnit, PKCustomParams, applyPKOverrides, sanitizePKParams, isPlausibleBodyWeightKG,
         BODY_WEIGHT_KG_MIN, BODY_WEIGHT_KG_MAX, DOSE_MG_MAX,
         EVENT_TIME_H_MIN, EVENT_TIME_H_MAX } from '../../logic';
import { formatDate } from '../utils/helpers';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useAuth } from '../contexts/AuthContext';
import {
    MODE_KEYS, RecordKind, SyncState, Tombstones,
    pruneTombstones, sanitizeTombstones,
} from '../utils/syncMerge';

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
const nsFor = (owner: string, suffix: string) =>
    owner === LOCAL_OWNER ? `hrt-${suffix}` : `hrt-u${owner}-${suffix}`;

const modeKeyFor = (owner: string, mode: 'transfem' | 'transmasc', suffix: string) =>
    nsFor(owner, mode === 'transmasc' ? `masc-${suffix}` : suffix);

const MODE_SUFFIXES = ['events', 'lab-results', 'dose-templates', 'quick-doses', 'deletions'] as const;
const SHARED_SUFFIXES = [
    'weight', 'pk-params', 'cal-method', 'cal-history-mode',
    'weight-at', 'pk-params-at',
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

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: any;
    createdAt: number;
    /** Epoch ms of the last edit — see DoseEvent.updatedAt. */
    updatedAt?: number;
}

export interface QuickDose {
    id: string;
    route: Route;
    ester: Ester;
    value: number;
    createdAt: number;
}

export const useAppData = (showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void) => {
    const { t, lang } = useTranslation();
    const { mode, isTransmasc } = useHRTMode();
    const { user } = useAuth();

    // Everything below is scoped to (account, mode). `scope` is the composite the
    // reload/persist handshake keys on — see loadedScopeRef.
    const owner = user?.id ?? LOCAL_OWNER;
    const scope = `${owner}|${mode}`;
    const keyFor = (m: 'transfem' | 'transmasc', suffix: string) => modeKeyFor(owner, m, suffix);
    const sharedKey = (suffix: string) => nsFor(owner, suffix);

    const loadJSON = <T,>(key: string, fallback: T): T => {
        try {
            const s = localStorage.getItem(key);
            return s ? (JSON.parse(s) as T) : fallback;
        } catch { return fallback; }
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
        sanitizeTombstones(loadJSON<unknown>(keyFor(m, 'deletions'), null));

    const writeTombstones = (m: 'transfem' | 'transmasc', next: Tombstones) => {
        localStorage.setItem(keyFor(m, 'deletions'), JSON.stringify(pruneTombstones(next, Date.now())));
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
            if (current[kind][id] !== undefined) { delete current[kind][id]; touched = true; }
        }
        if (touched) writeTombstones(m, current);
    };

    /**
     * A replace-style import (including "restore this backup") is a statement
     * about the whole set: whatever it leaves out is meant to be gone. Recording
     * those as deletions is what lets a restore survive the next sync instead of
     * being immediately undone by the cloud copy it was restoring from.
     */
    const reconcileReplacement = (
        m: 'transfem' | 'transmasc',
        kind: RecordKind,
        before: { id: string }[],
        after: { id: string }[],
    ) => {
        const keep = new Set(after.map(r => r.id));
        const gone = before.map(r => r.id).filter(id => id && !keep.has(id));
        forgetDeletions(kind, [...keep], m);
        recordDeletions(kind, gone, m);
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
    const [labResults, setLabResults] = useState<LabResult[]>(() => loadJSON(keyFor(mode, 'lab-results'), [] as LabResult[]));
    const [calibrationMethod, setCalibrationMethodState] = useState<CalibrationMethod>(() =>
        // Hybrid-MIPD is the default; legacy 'average'/'adaptive' values are migrated.
        normalizeCalibrationMethod(localStorage.getItem(sharedKey('cal-method')))
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
    const [doseTemplates, setDoseTemplates] = useState<DoseTemplate[]>(() => loadJSON(keyFor(mode, 'dose-templates'), [] as DoseTemplate[]));
    const [quickDoses, setQuickDoses] = useState<QuickDose[]>(() => loadJSON(keyFor(mode, 'quick-doses'), [] as QuickDose[]));
    const [pkParams, setPkParamsState] = useState<PKCustomParams | null>(() => {
        const saved = localStorage.getItem(sharedKey('pk-params'));
        if (!saved) return null;
        try {
            const parsed = sanitizePKParams(JSON.parse(saved));
            applyPKOverrides(parsed); // Apply immediately so first simulation uses custom params
            return parsed;
        } catch { return null; }
    });

    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
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
        // Mode-independent, but still per-account, so they reload on the same beat.
        const savedWeight = localStorage.getItem(sharedKey('weight'));
        setWeightState(savedWeight ? parseFloat(savedWeight) : 70.0);
        setCalibrationMethodState(normalizeCalibrationMethod(localStorage.getItem(sharedKey('cal-method'))));
        setCalibrationHistoryModeState(localStorage.getItem(sharedKey('cal-history-mode')) === 'forward' ? 'forward' : 'retrospective');
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
    }, [events, labResults, doseTemplates, quickDoses]);


    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(keyFor(mode, 'events'), JSON.stringify(events));
    }, [events, scope]);
    useEffect(() => {
        if (loadedScopeRef.current !== scope) return;
        localStorage.setItem(sharedKey('weight'), weight.toString());
    }, [weight, scope]);
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
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (events.length > 0) {
            const res = runSimulation(events, weight);
            setSimulation(res);
        } else {
            setSimulation(null);
        }
    }, [events, weight]);

    // --- Derived State ---
    // Self-learning calibration: fits a personal amplitude (+ clearance, for the
    // EKF/MIPD models) to the user's labs via the selected estimator and history
    // mode. Returns the scale function plus the learned parameters and per-lab
    // comparison used by the Lab page UI.
    const calibration = useMemo(() => {
        return computeCalibration(simulation, events, weight, labResults, calibrationMethod, calibrationHistoryMode);
    }, [simulation, events, weight, labResults, calibrationMethod, calibrationHistoryMode]);
    const calibrationFn = calibration.factorFn;

    const currentLevel = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        const baseE2 = interpolateConcentration_E2(simulation, h) || 0;
        return baseE2 * calibrationFn(h);
    }, [simulation, currentTime, calibrationFn]);

    const currentCPA = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        const concCPA = interpolateConcentration_CPA(simulation, h) || 0;
        return concCPA;
    }, [simulation, currentTime]);

    // Total testosterone (ng/dL) at the current time — only meaningful in transmasc mode.
    const currentT = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        return interpolateConcentration_T(simulation, h) || 0;
    }, [simulation, currentTime]);

    const groupedEvents = useMemo(() => {
        const sorted = [...events].sort((a, b) => b.timeH - a.timeH);
        const groups: Record<string, DoseEvent[]> = {};
        sorted.forEach(e => {
            const d = formatDate(new Date(e.timeH * 3600000), lang);
            if (!groups[d]) groups[d] = [];
            groups[d].push(e);
        });
        return groups;
    }, [events, lang]);

    const currentStatus = useMemo(() => {
        if (isTransmasc) {
            // Transmasc: total T status bands (ng/dL). Reference: male range 300–1000 ng/dL.
            if (currentT > 0) {
                const c = currentT;
                if (c > 1000) return { label: 'status.level.t_high',    color: 'text-amber-600', bg: 'bg-amber-50',  border: 'border-amber-200' };
                if (c >= 600) return { label: 'status.level.t_upper',   color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
                if (c >= 300) return { label: 'status.level.t_male',    color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
                if (c >= 100) return { label: 'status.level.t_subtarget', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
                return { label: 'status.level.t_low', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
            }
            return null;
        }
        if (currentLevel > 0) {
            const conc = currentLevel;
            if (conc > 300) return { label: 'status.level.high', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
            if (conc >= 100 && conc <= 200) return { label: 'status.level.mtf', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
            if (conc >= 70 && conc <= 300) return { label: 'status.level.luteal', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
            if (conc >= 30 && conc < 70) return { label: 'status.level.follicular', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
            if (conc >= 8 && conc < 30) return { label: 'status.level.male', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
            return { label: 'status.level.low', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
        }
        return null;
    }, [currentLevel, currentT, isTransmasc]);


    // --- Actions ---
    // Every write goes through here, which makes this the one place that has to
    // stamp `updatedAt`. Sync uses the stamp to tell an edit from its older
    // twin; an unstamped record silently loses that argument.
    const stamp = <T extends object>(record: T): T & { updatedAt: number } =>
        ({ ...record, updatedAt: Date.now() });

    const addEvent = (e: DoseEvent) => {
        forgetDeletions('events', [e.id]);
        setEvents(prev => [...prev, stamp(e)]);
    };
    const addEvents = (list: DoseEvent[]) => {
        if (!list.length) return;
        forgetDeletions('events', list.map(e => e.id));
        setEvents(prev => [...prev, ...list.map(stamp)]);
    };
    const updateEvent = (e: DoseEvent) => {
        const next = stamp(e);
        setEvents(prev => prev.map(p => p.id === e.id ? next : p));
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
        showDialog('confirm', t('drawer.clear_confirm'), () => {
            recordDeletions('events', events.map(e => e.id));
            setEvents([]);
        });
    }

    const addLabResult = (res: LabResult) => {
        forgetDeletions('labResults', [res.id]);
        setLabResults(prev => [...prev, stamp(res)]);
    };
    const updateLabResult = (res: LabResult) => {
        const next = stamp(res);
        setLabResults(prev => prev.map(r => r.id === res.id ? next : r));
    };
    const deleteLabResult = (id: string) => {
        recordDeletions('labResults', [id]);
        setLabResults(prev => prev.filter(r => r.id !== id));
    };
    const clearLabResults = () => {
        if (!labResults.length) return;
        showDialog('confirm', t('lab.clear_confirm'), () => {
            recordDeletions('labResults', labResults.map(r => r.id));
            setLabResults([]);
        });
    }

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
    const deleteQuickDose = (id: string) => setQuickDoses(prev => prev.filter(d => d.id !== id));

    const touchPkParams = () => localStorage.setItem(sharedKey('pk-params-at'), String(Date.now()));
    const setPkParams = (params: PKCustomParams) => { touchPkParams(); setPkParamsState(params); };
    const clearPkParams = () => { touchPkParams(); setPkParamsState(null); };
    const resetPkParams = () => {
        showDialog('confirm', t('pk.reset_confirm'), () => {
            clearPkParams();
        });
    };

    // A backup with hundreds of thousands of same-day events makes the
    // simulation's peri-event sampling explode into a synchronous loop that
    // never finishes — and because state is persisted before the simulation
    // runs, the wedged data is reloaded on every subsequent open. Reject the
    // file outright so nothing is written.
    const MAX_IMPORT_ENTRIES = 20000;

    /** Carry a record's edit stamp through sanitising; absent or junk becomes undefined. */
    const keepStamp = (raw: any): number | undefined => {
        const n = Number(raw?.updatedAt);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const sanitizeImportedEvents = (raw: any): DoseEvent[] => {
        if (!Array.isArray(raw)) throw new Error('Invalid format');
        if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
        return raw.map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { route, timeH, doseMG, ester, extras } = item;
            if (!Object.values(Route).includes(route)) return null;
            const timeNum = Number(timeH);
            // Out-of-range timestamps are dropped rather than clamped: moving a
            // record to a date the user never chose is worse than losing it, and
            // a stray one stretches the simulation grid over the whole span.
            if (!Number.isFinite(timeNum) || timeNum < EVENT_TIME_H_MIN || timeNum > EVENT_TIME_H_MAX) return null;
            const doseNum = Number(doseMG);
            const validEster = Object.values(Ester).includes(ester) ? ester : Ester.E2;
            const sanitizedExtras = (extras && typeof extras === 'object') ? extras : {};
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                route,
                timeH: timeNum,
                doseMG: Number.isFinite(doseNum) ? Math.min(DOSE_MG_MAX, Math.max(0, doseNum)) : 0,
                ester: validEster,
                extras: sanitizedExtras,
                updatedAt: keepStamp(item)
            } as DoseEvent;
        }).filter((item): item is DoseEvent => item !== null);
    };

    const sanitizeImportedLabResults = (raw: any): LabResult[] => {
        if (!Array.isArray(raw)) return [];
        if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
        return raw.map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { timeH, concValue, unit } = item;
            const timeNum = Number(timeH);
            const valNum = Number(concValue);
            if (!Number.isFinite(timeNum) || !Number.isFinite(valNum)) return null;
            const unitVal = (unit === 'pg/ml' || unit === 'pmol/l' || unit === 'ng/dl' || unit === 'nmol/l') ? unit : 'pmol/l';
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                timeH: timeNum,
                concValue: valNum,
                unit: unitVal,
                updatedAt: keepStamp(item)
            } as LabResult;
        }).filter((item): item is LabResult => item !== null);
    };

    const sanitizeImportedTemplates = (raw: any): DoseTemplate[] => {
        if (!Array.isArray(raw)) return [];
        if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
        return raw.map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { name, route, ester, doseMG, extras, createdAt } = item;
            if (!Object.values(Route).includes(route)) return null;
            if (!Object.values(Ester).includes(ester)) return null;
            const doseNum = Number(doseMG);
            if (!Number.isFinite(doseNum) || doseNum < 0) return null;
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                name: typeof name === 'string' ? name : 'Template',
                route,
                ester,
                doseMG: doseNum,
                extras: (extras && typeof extras === 'object') ? extras : {},
                createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
                updatedAt: keepStamp(item)
            } as DoseTemplate;
        }).filter((item): item is DoseTemplate => item !== null);
    };

    const processImportedData = (parsed: any): boolean => {
        try {
            let newEvents: DoseEvent[] = [];
            let newWeight: number | undefined = undefined;
            let newLabs: LabResult[] = [];
            let newTemplates: DoseTemplate[] = [];
            let newPkParams: PKCustomParams | undefined = undefined;
            let importedOtherMode = false;
            // Which kinds the payload actually *speaks about*, tracked one by
            // one. A single "it had something for this mode" flag replaced all
            // three lists, so a file carrying only `events` — the shape a v1
            // export or a hand-written file often has — cleared the user's lab
            // results and templates as a side effect of importing doses.
            //
            // A present-but-empty array still means "none", so restoring a
            // backup with no labs still clears them. Only an absent key is
            // silence. The distinction matters more now that a replace-import
            // records what it drops as deletions: silence used to cost a wipe
            // this device might get back from another one, and would now cost
            // the same wipe on every device.
            const replaced = { events: false, labResults: false, doseTemplates: false };

            // New multi-mode payload: { modes: { transfem: {...}, transmasc: {...} } }
            if (parsed && typeof parsed === 'object' && parsed.modes && typeof parsed.modes === 'object') {
                const modesBlock = parsed.modes as Record<string, any>;
                for (const m of ['transfem', 'transmasc'] as const) {
                    const block = modesBlock[m];
                    if (!block || typeof block !== 'object') continue;
                    const evs = Array.isArray(block.events) ? sanitizeImportedEvents(block.events) : [];
                    const ls = Array.isArray(block.labResults) ? sanitizeImportedLabResults(block.labResults) : [];
                    const tmps = Array.isArray(block.doseTemplates) ? sanitizeImportedTemplates(block.doseTemplates) : [];
                    if (m === mode) {
                        if (Array.isArray(block.events)) { newEvents = evs; replaced.events = true; }
                        if (Array.isArray(block.labResults)) { newLabs = ls; replaced.labResults = true; }
                        if (Array.isArray(block.doseTemplates)) { newTemplates = tmps; replaced.doseTemplates = true; }
                    } else {
                        // Write other mode's data straight to localStorage.
                        if (Array.isArray(block.events)) {
                            reconcileReplacement(m, 'events', loadJSON<DoseEvent[]>(keyFor(m, 'events'), []), evs);
                            localStorage.setItem(keyFor(m, 'events'), JSON.stringify(evs));
                            importedOtherMode = true;
                        }
                        if (Array.isArray(block.labResults)) {
                            reconcileReplacement(m, 'labResults', loadJSON<LabResult[]>(keyFor(m, 'lab-results'), []), ls);
                            localStorage.setItem(keyFor(m, 'lab-results'), JSON.stringify(ls));
                            importedOtherMode = true;
                        }
                        if (Array.isArray(block.doseTemplates)) {
                            reconcileReplacement(m, 'doseTemplates', loadJSON<DoseTemplate[]>(keyFor(m, 'dose-templates'), []), tmps);
                            localStorage.setItem(keyFor(m, 'dose-templates'), JSON.stringify(tmps));
                            importedOtherMode = true;
                        }
                    }
                }
                if (typeof parsed.weight === 'number' && Number.isFinite(parsed.weight) && parsed.weight > 0) {
                    newWeight = Math.min(BODY_WEIGHT_KG_MAX, Math.max(BODY_WEIGHT_KG_MIN, parsed.weight));
                }
                if (parsed.pkParams && typeof parsed.pkParams === 'object') {
                    newPkParams = sanitizePKParams(parsed.pkParams) ?? undefined;
                }
            } else if (Array.isArray(parsed)) {
                newEvents = sanitizeImportedEvents(parsed);
                replaced.events = true;
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.events)) {
                    newEvents = sanitizeImportedEvents(parsed.events);
                    replaced.events = true;
                }
                if (typeof parsed.weight === 'number' && Number.isFinite(parsed.weight) && parsed.weight > 0) {
                    newWeight = Math.min(BODY_WEIGHT_KG_MAX, Math.max(BODY_WEIGHT_KG_MIN, parsed.weight));
                }
                if (Array.isArray(parsed.labResults)) {
                    newLabs = sanitizeImportedLabResults(parsed.labResults);
                    replaced.labResults = true;
                }
                if (Array.isArray(parsed.doseTemplates)) {
                    newTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
                    replaced.doseTemplates = true;
                }
                if (parsed.pkParams && typeof parsed.pkParams === 'object') {
                    newPkParams = sanitizePKParams(parsed.pkParams) ?? undefined;
                }
            }

            // v1 flat-format safety: if the payload contains items that belong to
            // the *other* HRT mode (T esters / T-unit labs), siphon them into that
            // mode's storage so they don't silently corrupt the active record.
            if (!('modes' in (parsed || {}))) {
                const otherMode: 'transfem' | 'transmasc' = mode === 'transmasc' ? 'transfem' : 'transmasc';
                const eventBelongs = (e: DoseEvent) =>
                    mode === 'transmasc' ? isTestosteroneEster(e.ester) : !isTestosteroneEster(e.ester);
                const keepEvs: DoseEvent[] = [];
                const otherEvs: DoseEvent[] = [];
                for (const e of newEvents) (eventBelongs(e) ? keepEvs : otherEvs).push(e);
                if (otherEvs.length) {
                    const existing = loadJSON<DoseEvent[]>(keyFor(otherMode, 'events'), []);
                    const existingIds = new Set(existing.map(x => x.id));
                    forgetDeletions('events', otherEvs.map(e => e.id), otherMode);
                    localStorage.setItem(
                        keyFor(otherMode, 'events'),
                        JSON.stringify([...existing, ...otherEvs.filter(e => !existingIds.has(e.id))])
                    );
                    importedOtherMode = true;
                    newEvents = keepEvs;
                }
                const labBelongs = (l: LabResult) =>
                    mode === 'transmasc' ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit);
                const keepLs: LabResult[] = [];
                const otherLs: LabResult[] = [];
                for (const l of newLabs) (labBelongs(l) ? keepLs : otherLs).push(l);
                if (otherLs.length) {
                    const existing = loadJSON<LabResult[]>(keyFor(otherMode, 'lab-results'), []);
                    const existingIds = new Set(existing.map(x => x.id));
                    forgetDeletions('labResults', otherLs.map(l => l.id), otherMode);
                    localStorage.setItem(
                        keyFor(otherMode, 'lab-results'),
                        JSON.stringify([...existing, ...otherLs.filter(l => !existingIds.has(l.id))])
                    );
                    importedOtherMode = true;
                    newLabs = keepLs;
                }
            }

            if (!importedOtherMode && !newEvents.length && !newWeight && !newLabs.length && !newTemplates.length && !newPkParams) throw new Error('No valid entries');

            // A replace-import states the whole set for each kind it mentions,
            // so anything it drops from one is a deletion. Recording it is what
            // stops the next sync from pulling the dropped records straight back
            // out of the cloud — which would make "restore this backup" a no-op.
            if (replaced.events) {
                reconcileReplacement(mode, 'events', events, newEvents);
                setEvents(newEvents);
            }
            if (replaced.labResults) {
                reconcileReplacement(mode, 'labResults', labResults, newLabs);
                setLabResults(newLabs);
            }
            if (replaced.doseTemplates) {
                reconcileReplacement(mode, 'doseTemplates', doseTemplates, newTemplates);
                setDoseTemplates(newTemplates);
            }
            if (newWeight !== undefined) setWeight(newWeight);
            if (newPkParams !== undefined) setPkParams(newPkParams);

            showDialog('alert', t('drawer.import_success'));
            return true;
        } catch (err) {
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const mergeImportedData = (parsed: any): boolean => {
        try {
            let incomingEvents: DoseEvent[] = [];
            let incomingWeight: number | undefined = undefined;
            let incomingLabs: LabResult[] = [];
            let incomingTemplates: DoseTemplate[] = [];
            let mergedOther = 0;

            if (parsed && typeof parsed === 'object' && parsed.modes && typeof parsed.modes === 'object') {
                const modesBlock = parsed.modes as Record<string, any>;
                for (const m of ['transfem', 'transmasc'] as const) {
                    const block = modesBlock[m];
                    if (!block || typeof block !== 'object') continue;
                    const evs = Array.isArray(block.events) ? sanitizeImportedEvents(block.events) : [];
                    const ls = Array.isArray(block.labResults) ? sanitizeImportedLabResults(block.labResults) : [];
                    const tmps = Array.isArray(block.doseTemplates) ? sanitizeImportedTemplates(block.doseTemplates) : [];
                    if (m === mode) {
                        incomingEvents = evs;
                        incomingLabs = ls;
                        incomingTemplates = tmps;
                    } else {
                        // Merge into the other mode's localStorage directly.
                        const existingEvs = loadJSON<DoseEvent[]>(keyFor(m, 'events'), []);
                        const existingLs = loadJSON<LabResult[]>(keyFor(m, 'lab-results'), []);
                        const existingTmps = loadJSON<DoseTemplate[]>(keyFor(m, 'dose-templates'), []);
                        const evIds = new Set(existingEvs.map(e => e.id));
                        const lsIds = new Set(existingLs.map(l => l.id));
                        const tmpIds = new Set(existingTmps.map(tm => tm.id));
                        const newEvs = evs.filter(e => !evIds.has(e.id));
                        const newLs = ls.filter(l => !lsIds.has(l.id));
                        const newTmps = tmps.filter(tm => !tmpIds.has(tm.id));
                        // An explicit merge is the user asking for these records
                        // back, so any tombstone standing in the way goes.
                        forgetDeletions('events', evs.map(e => e.id), m);
                        forgetDeletions('labResults', ls.map(l => l.id), m);
                        forgetDeletions('doseTemplates', tmps.map(tm => tm.id), m);
                        if (newEvs.length) localStorage.setItem(keyFor(m, 'events'), JSON.stringify([...existingEvs, ...newEvs]));
                        if (newLs.length) localStorage.setItem(keyFor(m, 'lab-results'), JSON.stringify([...existingLs, ...newLs]));
                        if (newTmps.length) localStorage.setItem(keyFor(m, 'dose-templates'), JSON.stringify([...existingTmps, ...newTmps]));
                        mergedOther += newEvs.length + newLs.length;
                    }
                }
                if (typeof parsed.weight === 'number' && parsed.weight > 0) incomingWeight = parsed.weight;
            } else if (Array.isArray(parsed)) {
                incomingEvents = sanitizeImportedEvents(parsed);
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.events)) incomingEvents = sanitizeImportedEvents(parsed.events);
                if (typeof parsed.weight === 'number' && parsed.weight > 0) incomingWeight = parsed.weight;
                if (Array.isArray(parsed.labResults)) incomingLabs = sanitizeImportedLabResults(parsed.labResults);
                if (Array.isArray(parsed.doseTemplates)) incomingTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
            }

            // v1 flat-format safety (merge): siphon wrong-mode events *and labs*
            // into the other mode's store so a transfem backup merged from
            // transmasc mode doesn't contaminate the transmasc record.
            if (!('modes' in (parsed || {}))) {
                const otherMode: 'transfem' | 'transmasc' = mode === 'transmasc' ? 'transfem' : 'transmasc';
                const eventBelongs = (e: DoseEvent) =>
                    mode === 'transmasc' ? isTestosteroneEster(e.ester) : !isTestosteroneEster(e.ester);
                const keepEvs: DoseEvent[] = [];
                const otherEvs: DoseEvent[] = [];
                for (const e of incomingEvents) (eventBelongs(e) ? keepEvs : otherEvs).push(e);
                if (otherEvs.length) {
                    const existing = loadJSON<DoseEvent[]>(keyFor(otherMode, 'events'), []);
                    const existingIds = new Set(existing.map(x => x.id));
                    const newOnes = otherEvs.filter(e => !existingIds.has(e.id));
                    forgetDeletions('events', otherEvs.map(e => e.id), otherMode);
                    if (newOnes.length) {
                        localStorage.setItem(keyFor(otherMode, 'events'), JSON.stringify([...existing, ...newOnes]));
                        mergedOther += newOnes.length;
                    }
                    incomingEvents = keepEvs;
                }
                const labBelongs = (l: LabResult) =>
                    mode === 'transmasc' ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit);
                const keepLs: LabResult[] = [];
                const otherLs: LabResult[] = [];
                for (const l of incomingLabs) (labBelongs(l) ? keepLs : otherLs).push(l);
                if (otherLs.length) {
                    const existing = loadJSON<LabResult[]>(keyFor(otherMode, 'lab-results'), []);
                    const existingIds = new Set(existing.map(x => x.id));
                    const newOnes = otherLs.filter(l => !existingIds.has(l.id));
                    forgetDeletions('labResults', otherLs.map(l => l.id), otherMode);
                    if (newOnes.length) {
                        localStorage.setItem(keyFor(otherMode, 'lab-results'), JSON.stringify([...existing, ...newOnes]));
                        mergedOther += newOnes.length;
                    }
                    incomingLabs = keepLs;
                }
            }

            if (!mergedOther && !incomingEvents.length && !incomingWeight && !incomingLabs.length && !incomingTemplates.length) throw new Error('No valid entries');

            let merged = mergedOther;

            // Compute diffs synchronously against current state so the count is
            // available immediately when showDialog is called (setter callbacks
            // are invoked asynchronously by React and would not update `merged`
            // in time).
            if (incomingEvents.length > 0) {
                const existingIds = new Set(events.map(e => e.id));
                const newOnes = incomingEvents.filter(e => !existingIds.has(e.id));
                merged += newOnes.length;
                forgetDeletions('events', incomingEvents.map(e => e.id));
                if (newOnes.length > 0) setEvents(prev => [...prev, ...newOnes]);
            }

            if (incomingWeight !== undefined && incomingWeight > weight) {
                setWeight(incomingWeight);
            }

            if (incomingLabs.length > 0) {
                const existingIds = new Set(labResults.map(r => r.id));
                const newOnes = incomingLabs.filter(r => !existingIds.has(r.id));
                merged += newOnes.length;
                forgetDeletions('labResults', incomingLabs.map(r => r.id));
                if (newOnes.length > 0) setLabResults(prev => [...prev, ...newOnes]);
            }

            if (incomingTemplates.length > 0) {
                const existingIds = new Set(doseTemplates.map(t => t.id));
                const newOnes = incomingTemplates.filter(t => !existingIds.has(t.id));
                merged += newOnes.length;
                forgetDeletions('doseTemplates', incomingTemplates.map(t => t.id));
                if (newOnes.length > 0) setDoseTemplates(prev => [...prev, ...newOnes]);
            }

            showDialog('alert', (t('account.merge_success') as string).replace('{n}', String(merged)));
            return true;
        } catch (err) {
            console.error(err);
            showDialog('alert', t('account.merge_failed'));
            return false;
        }
    };

    const buildExportPayload = () => {
        const readMode = (m: 'transfem' | 'transmasc') => ({
            events: loadJSON<DoseEvent[]>(keyFor(m, 'events'), []),
            labResults: loadJSON<LabResult[]>(keyFor(m, 'lab-results'), []),
            doseTemplates: loadJSON<DoseTemplate[]>(keyFor(m, 'dose-templates'), []),
            deletions: readTombstones(m),
        });
        const modes = {
            transfem: readMode('transfem'),
            transmasc: readMode('transmasc'),
        };
        // Overlay current in-memory state for the active mode.
        modes[mode] = { events, labResults, doseTemplates, deletions: readTombstones(mode) };

        return {
            meta: { version: 2, exportedAt: new Date().toISOString() },
            mode,
            weight,
            // Last-write stamps for the two values sync can't merge per record.
            // Missing on payloads written before sync existed, which is exactly
            // how they should lose to a stamped one.
            weightUpdatedAt: Number(localStorage.getItem(sharedKey('weight-at'))) || undefined,
            modes,
            // Flat v1-compatible fields mirror the currently active mode.
            events,
            labResults,
            doseTemplates,
            // PK parameter overrides. Explicitly `null` when the user cleared
            // them — omitting the key would read as "this payload says nothing
            // about PK params", and the cleared state would never propagate.
            pkParams: pkParams ?? null,
            pkParamsUpdatedAt: Number(localStorage.getItem(sharedKey('pk-params-at'))) || undefined,
        };
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
        // Sanitise both modes up front: the sanitisers throw on an oversized
        // payload, and doing that halfway through the writes would leave one
        // mode updated and the other not.
        const clean = MODE_KEYS.map(m => ({
            m,
            events: sanitizeImportedEvents(state.modes[m].events),
            labResults: sanitizeImportedLabResults(state.modes[m].labResults),
            doseTemplates: sanitizeImportedTemplates(state.modes[m].doseTemplates),
            deletions: state.modes[m].deletions,
        }));

        for (const block of clean) {
            writeTombstones(block.m, block.deletions);
            localStorage.setItem(keyFor(block.m, 'events'), JSON.stringify(block.events));
            localStorage.setItem(keyFor(block.m, 'lab-results'), JSON.stringify(block.labResults));
            localStorage.setItem(keyFor(block.m, 'dose-templates'), JSON.stringify(block.doseTemplates));
            if (block.m === mode) {
                setEvents(block.events);
                setLabResults(block.labResults);
                setDoseTemplates(block.doseTemplates);
            }
        }

        // Scalars keep the winning side's stamp rather than being restamped
        // "now" — restamping would make every sync look like a fresh local edit
        // and let a stale value beat a newer one on the next round.
        if (state.weight !== undefined && isPlausibleBodyWeightKG(state.weight)) {
            setWeightState(state.weight);
            localStorage.setItem(sharedKey('weight'), String(state.weight));
            if (state.weightUpdatedAt > 0) localStorage.setItem(sharedKey('weight-at'), String(state.weightUpdatedAt));
        }
        if (state.pkParams !== undefined) {
            const next = sanitizePKParams(state.pkParams);
            setPkParamsState(next);
            if (next) localStorage.setItem(sharedKey('pk-params'), JSON.stringify(next));
            else localStorage.removeItem(sharedKey('pk-params'));
            if (state.pkParamsUpdatedAt > 0) localStorage.setItem(sharedKey('pk-params-at'), String(state.pkParamsUpdatedAt));
        }
    };

    return {
        events, setEvents,
        weight, setWeight,
        labResults, setLabResults,
        doseTemplates, setDoseTemplates,
        quickDoses, setQuickDoses,
        pkParams,
        setPkParams,
        clearPkParams,
        resetPkParams,
        simulation,
        currentTime,
        calibrationFn,
        calibrationMethod, setCalibrationMethod,
        calibrationHistoryMode, setCalibrationHistoryMode,
        calibration,
        currentLevel,
        currentCPA,
        currentT,
        currentStatus,
        groupedEvents,
        addEvent, addEvents, updateEvent, deleteEvent, deleteEvents, clearAllEvents,
        addLabResult, updateLabResult, deleteLabResult, clearLabResults,
        addTemplate, deleteTemplate,
        addQuickDose, deleteQuickDose,
        processImportedData,
        mergeImportedData,
        buildExportPayload,
        applySyncedState,
        // (account, mode) currently selected vs. the one whose data is actually
        // in state. Cloud sync waits for the two to agree — see readyScope.
        scope,
        readyScope,
    };
};
