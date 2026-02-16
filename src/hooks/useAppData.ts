import { useState, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, Route, Ester, SimulationResult, runSimulation, interpolateConcentration_E2, interpolateConcentration_CPA, LabResult, createCalibrationInterpolator, decompressData, decryptData, encryptData } from '../../logic';
import { formatDate } from '../utils/helpers';
import { useTranslation } from '../contexts/LanguageContext';

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: any;
    createdAt: number;
}

export const useAppData = (showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void) => {
    const { t, lang } = useTranslation();

    // --- State ---
    const [events, setEvents] = useState<DoseEvent[]>(() => {
        const saved = localStorage.getItem('hrt-events');
        return saved ? JSON.parse(saved) : [];
    });
    const [weight, setWeight] = useState<number>(() => {
        const saved = localStorage.getItem('hrt-weight');
        return saved ? parseFloat(saved) : 70.0;
    });
    const [labResults, setLabResults] = useState<LabResult[]>(() => {
        const saved = localStorage.getItem('hrt-lab-results');
        return saved ? JSON.parse(saved) : [];
    });
    const [doseTemplates, setDoseTemplates] = useState<DoseTemplate[]>(() => {
        const saved = localStorage.getItem('hrt-dose-templates');
        return saved ? JSON.parse(saved) : [];
    });

    const [simulation, setSimulation] = useState<SimulationResult | null>(null);
    const [currentTime, setCurrentTime] = useState(new Date());

    // --- Effects ---
    useEffect(() => { localStorage.setItem('hrt-events', JSON.stringify(events)); }, [events]);
    useEffect(() => { localStorage.setItem('hrt-weight', weight.toString()); }, [weight]);
    useEffect(() => { localStorage.setItem('hrt-lab-results', JSON.stringify(labResults)); }, [labResults]);
    useEffect(() => { localStorage.setItem('hrt-dose-templates', JSON.stringify(doseTemplates)); }, [doseTemplates]);

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
    }, [currentLevel]);


    // --- Actions ---
    const addEvent = (e: DoseEvent) => {
        setEvents(prev => [...prev, e]);
    };
    const updateEvent = (e: DoseEvent) => {
        setEvents(prev => prev.map(p => p.id === e.id ? e : p));
    };
    const deleteEvent = (id: string) => {
        showDialog('confirm', t('timeline.delete_confirm'), () => {
            setEvents(prev => prev.filter(e => e.id !== id));
        });
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
        showDialog('confirm', t('lab.delete_confirm'), () => {
            setLabResults(prev => prev.filter(r => r.id !== id));
        });
    };
    const clearLabResults = () => {
        if (!labResults.length) return;
        showDialog('confirm', t('lab.clear_confirm'), () => {
            setLabResults([]);
        });
    }

    const addTemplate = (template: DoseTemplate) => setDoseTemplates(prev => [...prev, template]);
    const deleteTemplate = (id: string) => setDoseTemplates(prev => prev.filter(t => t.id !== id));

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
            const unitVal = unit === 'pg/ml' || unit === 'pmol/l' ? unit : 'pmol/l';
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

            if (Array.isArray(parsed)) {
                newEvents = sanitizeImportedEvents(parsed);
            } else if (typeof parsed === 'object' && parsed !== null) {
                if (Array.isArray(parsed.events)) {
                    newEvents = sanitizeImportedEvents(parsed.events);
                }
                if (typeof parsed.weight === 'number' && parsed.weight > 0) {
                    newWeight = parsed.weight;
                }
                if (Array.isArray(parsed.labResults)) {
                    newLabs = sanitizeImportedLabResults(parsed.labResults);
                }
                if (Array.isArray(parsed.doseTemplates)) {
                    newTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
                }
            }

            if (!newEvents.length && !newWeight && !newLabs.length && !newTemplates.length) throw new Error('No valid entries');

            if (newEvents.length > 0) setEvents(newEvents);
            if (newWeight !== undefined) setWeight(newWeight);
            if (newLabs.length > 0) setLabResults(newLabs);
            if (newTemplates.length > 0) setDoseTemplates(newTemplates);

            showDialog('alert', t('drawer.import_success'));
            return true;
        } catch (err) {
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    return {
        events, setEvents,
        weight, setWeight,
        labResults, setLabResults,
        doseTemplates, setDoseTemplates,
        simulation,
        currentTime,
        calibrationFn,
        currentLevel,
        currentCPA,
        currentStatus,
        groupedEvents,
        addEvent, updateEvent, deleteEvent, clearAllEvents,
        addLabResult, updateLabResult, deleteLabResult, clearLabResults,
        addTemplate, deleteTemplate,
        processImportedData
    };
};
