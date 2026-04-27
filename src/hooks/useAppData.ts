import { useState, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, SimulationResult, runSimulation, interpolateConcentration_E2, interpolateConcentration_CPA, interpolateConcentration_T, LabResult, createCalibrationInterpolator, decompressData, decryptData, encryptData, isTestosteroneEster, isT_LabUnit, PKCustomParams, DEFAULT_PK_PARAMS, applyPKOverrides } from '../../logic';
import { formatDate } from '../utils/helpers';
import { useTranslation } from '../contexts/LanguageContext';
import { useHRTMode } from '../contexts/HRTModeContext';

// Storage key prefix per HRT mode — keeps transfem and transmasc data independent.
const keyFor = (mode: 'transfem' | 'transmasc', suffix: string) =>
    mode === 'transmasc' ? `hrt-masc-${suffix}` : `hrt-${suffix}`;

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: any;
    createdAt: number;
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

    const loadJSON = <T,>(key: string, fallback: T): T => {
        try {
            const s = localStorage.getItem(key);
            return s ? (JSON.parse(s) as T) : fallback;
        } catch { return fallback; }
    };

    // --- State ---
    const [events, setEvents] = useState<DoseEvent[]>(() => loadJSON(keyFor(mode, 'events'), [] as DoseEvent[]));
    const [weight, setWeight] = useState<number>(() => {
        // Weight is shared across modes (a physical attribute of the person).
        const saved = localStorage.getItem('hrt-weight');
        return saved ? parseFloat(saved) : 70.0;
    });
    const [labResults, setLabResults] = useState<LabResult[]>(() => loadJSON(keyFor(mode, 'lab-results'), [] as LabResult[]));
    const [doseTemplates, setDoseTemplates] = useState<DoseTemplate[]>(() => loadJSON(keyFor(mode, 'dose-templates'), [] as DoseTemplate[]));
    const [quickDoses, setQuickDoses] = useState<QuickDose[]>(() => loadJSON(keyFor(mode, 'quick-doses'), [] as QuickDose[]));
    const [pkParams, setPkParamsState] = useState<PKCustomParams | null>(() => {
        const saved = localStorage.getItem('hrt-pk-params');
        if (!saved) return null;
        try {
            const parsed = JSON.parse(saved) as PKCustomParams;
            applyPKOverrides(parsed); // Apply immediately so first simulation uses custom params
            return parsed;
        } catch { return null; }
    });

    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    // --- Effects ---
    // Tracks the mode whose data is currently held in state. Persist effects must
    // wait until the reload-on-mode-change effect has swapped state to the new
    // mode's data, otherwise stale (previous-mode) state would overwrite the
    // newly-selected mode's localStorage entries.
    //
    // IMPORTANT: setState calls inside the reload effect do NOT apply to the
    // current commit — they schedule a re-render. Any persist effect that also
    // runs in the *same* commit (because `mode` is in its dep array) would
    // therefore observe stale, previous-mode state. We mark the ref as `null`
    // during reload so persist effects skip, and re-establish it only after
    // the new data has actually flushed into state (detected in a follow-up
    // effect that also watches the data itself).
    const loadedModeRef = useRef<'transfem' | 'transmasc' | null>(mode);

    // Reload all mode-scoped state whenever the HRT mode changes.
    useEffect(() => {
        loadedModeRef.current = null;
        setEvents(loadJSON(keyFor(mode, 'events'), [] as DoseEvent[]));
        setLabResults(loadJSON(keyFor(mode, 'lab-results'), [] as LabResult[]));
        setDoseTemplates(loadJSON(keyFor(mode, 'dose-templates'), [] as DoseTemplate[]));
        setQuickDoses(loadJSON(keyFor(mode, 'quick-doses'), [] as QuickDose[]));
    }, [mode]);

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
    useEffect(() => {
        loadedModeRef.current = mode;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, labResults, doseTemplates, quickDoses]);


    useEffect(() => {
        if (loadedModeRef.current !== mode) return;
        localStorage.setItem(keyFor(mode, 'events'), JSON.stringify(events));
    }, [events, mode]);
    useEffect(() => { localStorage.setItem('hrt-weight', weight.toString()); }, [weight]);
    useEffect(() => {
        if (pkParams) {
            localStorage.setItem('hrt-pk-params', JSON.stringify(pkParams));
        } else {
            localStorage.removeItem('hrt-pk-params');
        }
        applyPKOverrides(pkParams);
    }, [pkParams]);
    useEffect(() => {
        if (loadedModeRef.current !== mode) return;
        localStorage.setItem(keyFor(mode, 'lab-results'), JSON.stringify(labResults));
    }, [labResults, mode]);
    useEffect(() => {
        if (loadedModeRef.current !== mode) return;
        localStorage.setItem(keyFor(mode, 'dose-templates'), JSON.stringify(doseTemplates));
    }, [doseTemplates, mode]);
    useEffect(() => {
        if (loadedModeRef.current !== mode) return;
        localStorage.setItem(keyFor(mode, 'quick-doses'), JSON.stringify(quickDoses));
    }, [quickDoses, mode]);

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
    const calibrationFn = useMemo(() => {
        return createCalibrationInterpolator(simulation, labResults);
    }, [simulation, labResults]);

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
    const addEvent = (e: DoseEvent) => {
        setEvents(prev => [...prev, e]);
    };
    const updateEvent = (e: DoseEvent) => {
        setEvents(prev => prev.map(p => p.id === e.id ? e : p));
    };
    const deleteEvent = (id: string) => {
        setEvents(prev => prev.filter(e => e.id !== id));
    };
    const clearAllEvents = () => {
        if (!events.length) return;
        showDialog('confirm', t('drawer.clear_confirm'), () => {
            setEvents([]);
        });
    }

    const addLabResult = (res: LabResult) => setLabResults(prev => [...prev, res]);
    const updateLabResult = (res: LabResult) => setLabResults(prev => prev.map(r => r.id === res.id ? res : r));
    const deleteLabResult = (id: string) => {
        setLabResults(prev => prev.filter(r => r.id !== id));
    };
    const clearLabResults = () => {
        if (!labResults.length) return;
        showDialog('confirm', t('lab.clear_confirm'), () => {
            setLabResults([]);
        });
    }

    const addTemplate = (template: DoseTemplate) => setDoseTemplates(prev => [...prev, template]);
    const deleteTemplate = (id: string) => setDoseTemplates(prev => prev.filter(t => t.id !== id));

    const addQuickDose = (dose: QuickDose) => setQuickDoses(prev => [...prev, dose]);
    const deleteQuickDose = (id: string) => setQuickDoses(prev => prev.filter(d => d.id !== id));

    const setPkParams = (params: PKCustomParams) => setPkParamsState(params);
    const clearPkParams = () => setPkParamsState(null);
    const resetPkParams = () => {
        showDialog('confirm', t('pk.reset_confirm'), () => {
            setPkParamsState(null);
        });
    };

    const sanitizeImportedEvents = (raw: any): DoseEvent[] => {
        if (!Array.isArray(raw)) throw new Error('Invalid format');
        return raw.map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { route, timeH, doseMG, ester, extras } = item;
            if (!Object.values(Route).includes(route)) return null;
            const timeNum = Number(timeH);
            if (!Number.isFinite(timeNum)) return null;
            const doseNum = Number(doseMG);
            const validEster = Object.values(Ester).includes(ester) ? ester : Ester.E2;
            const sanitizedExtras = (extras && typeof extras === 'object') ? extras : {};
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                route,
                timeH: timeNum,
                doseMG: Number.isFinite(doseNum) ? doseNum : 0,
                ester: validEster,
                extras: sanitizedExtras
            } as DoseEvent;
        }).filter((item): item is DoseEvent => item !== null);
    };

    const sanitizeImportedLabResults = (raw: any): LabResult[] => {
        if (!Array.isArray(raw)) return [];
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
                unit: unitVal
            } as LabResult;
        }).filter((item): item is LabResult => item !== null);
    };

    const sanitizeImportedTemplates = (raw: any): DoseTemplate[] => {
        if (!Array.isArray(raw)) return [];
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
                createdAt: Number.isFinite(createdAt) ? createdAt : Date.now()
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
            // Did the payload explicitly carry a block for the *current* mode?
            // Only then should we overwrite active-mode state (otherwise a v2
            // payload that only contains the other mode's data would wipe the
            // user's current-mode records on replace-import).
            let replacedCurrentMode = false;

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
                        newEvents = evs;
                        newLabs = ls;
                        newTemplates = tmps;
                        replacedCurrentMode = true;
                    } else {
                        // Write other mode's data straight to localStorage.
                        localStorage.setItem(keyFor(m, 'events'), JSON.stringify(evs));
                        localStorage.setItem(keyFor(m, 'lab-results'), JSON.stringify(ls));
                        localStorage.setItem(keyFor(m, 'dose-templates'), JSON.stringify(tmps));
                        importedOtherMode = true;
                    }
                }
                if (typeof parsed.weight === 'number' && parsed.weight > 0) {
                    newWeight = parsed.weight;
                }
                if (parsed.pkParams && typeof parsed.pkParams === 'object') {
                    newPkParams = parsed.pkParams as PKCustomParams;
                }
            } else if (Array.isArray(parsed)) {
                newEvents = sanitizeImportedEvents(parsed);
                replacedCurrentMode = true;
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.events)) {
                    newEvents = sanitizeImportedEvents(parsed.events);
                    replacedCurrentMode = true;
                }
                if (typeof parsed.weight === 'number' && parsed.weight > 0) {
                    newWeight = parsed.weight;
                }
                if (Array.isArray(parsed.labResults)) {
                    newLabs = sanitizeImportedLabResults(parsed.labResults);
                    replacedCurrentMode = true;
                }
                if (Array.isArray(parsed.doseTemplates)) {
                    newTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
                    replacedCurrentMode = true;
                }
                if (parsed.pkParams && typeof parsed.pkParams === 'object') {
                    newPkParams = parsed.pkParams as PKCustomParams;
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
                    localStorage.setItem(
                        keyFor(otherMode, 'lab-results'),
                        JSON.stringify([...existing, ...otherLs.filter(l => !existingIds.has(l.id))])
                    );
                    importedOtherMode = true;
                    newLabs = keepLs;
                }
            }

            if (!importedOtherMode && !newEvents.length && !newWeight && !newLabs.length && !newTemplates.length && !newPkParams) throw new Error('No valid entries');

            if (replacedCurrentMode) {
                setEvents(newEvents);
                setLabResults(newLabs);
                setDoseTemplates(newTemplates);
            }
            if (newWeight !== undefined) setWeight(newWeight);
            if (newPkParams !== undefined) setPkParamsState(newPkParams);

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
                    if (newOnes.length) {
                        localStorage.setItem(keyFor(otherMode, 'lab-results'), JSON.stringify([...existing, ...newOnes]));
                        mergedOther += newOnes.length;
                    }
                    incomingLabs = keepLs;
                }
            }

            if (!mergedOther && !incomingEvents.length && !incomingWeight && !incomingLabs.length && !incomingTemplates.length) throw new Error('No valid entries');

            let merged = mergedOther;

            if (incomingEvents.length > 0) {
                setEvents(prev => {
                    const existingIds = new Set(prev.map(e => e.id));
                    const newOnes = incomingEvents.filter(e => !existingIds.has(e.id));
                    merged += newOnes.length;
                    return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
                });
            }

            if (incomingWeight !== undefined && incomingWeight > weight) {
                setWeight(incomingWeight);
            }

            if (incomingLabs.length > 0) {
                setLabResults(prev => {
                    const existingIds = new Set(prev.map(r => r.id));
                    const newOnes = incomingLabs.filter(r => !existingIds.has(r.id));
                    merged += newOnes.length;
                    return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
                });
            }

            if (incomingTemplates.length > 0) {
                setDoseTemplates(prev => {
                    const existingIds = new Set(prev.map(t => t.id));
                    const newOnes = incomingTemplates.filter(t => !existingIds.has(t.id));
                    merged += newOnes.length;
                    return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
                });
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
        });
        const modes = {
            transfem: readMode('transfem'),
            transmasc: readMode('transmasc'),
        };
        // Overlay current in-memory state for the active mode.
        modes[mode] = { events, labResults, doseTemplates };

        return {
            meta: { version: 2, exportedAt: new Date().toISOString() },
            mode,
            weight,
            modes,
            // Flat v1-compatible fields mirror the currently active mode.
            events,
            labResults,
            doseTemplates,
            // PK parameter overrides (null means defaults are in use)
            pkParams: pkParams ?? undefined,
        };
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
        currentLevel,
        currentCPA,
        currentT,
        currentStatus,
        groupedEvents,
        addEvent, updateEvent, deleteEvent, clearAllEvents,
        addLabResult, updateLabResult, deleteLabResult, clearLabResults,
        addTemplate, deleteTemplate,
        addQuickDose, deleteQuickDose,
        processImportedData,
        mergeImportedData,
        buildExportPayload
    };
};
