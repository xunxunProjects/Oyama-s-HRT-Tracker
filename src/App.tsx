import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, Download, Upload, Copy, Settings, ChevronRight, Activity, Calendar, FlaskConical, Languages, Info, Github, AlertTriangle, Monitor, Sun, Moon, Palette, Plus, X } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { APP_VERSION } from './constants';
import { DoseEvent, Route, Ester, ExtraKey, SimulationResult, runSimulation, interpolateConcentration, interpolateConcentration_E2, interpolateConcentration_CPA, encryptData, decryptData, getToE2Factor, LabResult, createCalibrationInterpolator } from '../logic';
import { formatDate, formatTime, getRouteIcon } from './utils/helpers';
import { Lang } from './i18n/translations';
import ResultChart from './components/ResultChart';
import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal, { DoseTemplate } from './components/DoseFormModal';
import DoseForm from './components/DoseForm';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import PasswordDisplayModal from './components/PasswordDisplayModal';

import Sidebar from './components/Sidebar';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import LabResultModal from './components/LabResultModal';
import LabResultForm from './components/LabResultForm';
import CustomSelect from './components/CustomSelect';
import flagCN from './flag_svg/🇨🇳.svg';
import flagTW from './flag_svg/🇹🇼.svg';
import flagHK from './flag_svg/🇭🇰.svg';
import flagUS from './flag_svg/🇺🇸.svg';
import flagJP from './flag_svg/🇯🇵.svg';
import flagRU from './flag_svg/🇷🇺.svg';
import flagUA from './flag_svg/🇺🇦.svg';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();

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

    const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<DoseEvent | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState("");
    const [isPasswordDisplayOpen, setIsPasswordDisplayOpen] = useState(false);
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [isQuickAddLabOpen, setIsQuickAddLabOpen] = useState(false);

    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as 'light' | 'dark' | 'system') || 'system';
    });

    // Apply theme classes
    useEffect(() => {
        localStorage.setItem('app-theme', theme);
        const root = window.document.documentElement;

        const applyTheme = (isDark: boolean) => {
            root.classList.remove('light', 'dark');
            root.classList.add(isDark ? 'dark' : 'light');
        };

        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            applyTheme(mediaQuery.matches);

            // Listen for system theme changes
            const handleChange = (e: MediaQueryListEvent) => {
                applyTheme(e.matches);
            };
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            applyTheme(theme === 'dark');
        }
    }, [theme]);
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<LabResult | null>(null);

    type ViewKey = 'home' | 'history' | 'lab' | 'settings';
    const viewOrder: ViewKey[] = ['home', 'history', 'lab', 'settings'];

    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const languageOptions = useMemo(() => ([
        { value: 'zh', label: '简体中文' },
        { value: 'zh-TW', label: '正體中文' },
        { value: 'yue', label: '廣東話' },
        { value: 'en', label: 'English' },
        { value: 'ja', label: '日本語' },
        { value: 'ru', label: 'Русский' },
        { value: 'uk', label: 'Українська' },
    ]), []);

    const themeOptions = useMemo(() => ([
        { value: 'light', label: t('theme.light'), icon: <Activity size={16} /> }, // Using general icons for now, can replace
        { value: 'dark', label: t('theme.dark'), icon: <Activity size={16} /> },
        { value: 'system', label: t('theme.system'), icon: <Activity size={16} /> },
    ]), [t]);

    const handleViewChange = (view: ViewKey) => {
        if (view === currentView) return;
        const currentIndex = viewOrder.indexOf(currentView);
        const nextIndex = viewOrder.indexOf(view);
        setTransitionDirection(nextIndex >= currentIndex ? 'forward' : 'backward');
        setCurrentView(view);
    };

    useEffect(() => {
        const shouldLock = isExportModalOpen || isPasswordDisplayOpen || isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isDisclaimerOpen || isLabModalOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isExportModalOpen, isPasswordDisplayOpen, isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isDisclaimerOpen, isLabModalOpen]);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);

    useEffect(() => { localStorage.setItem('hrt-events', JSON.stringify(events)); }, [events]);
    useEffect(() => { localStorage.setItem('hrt-weight', weight.toString()); }, [weight]);
    useEffect(() => { localStorage.setItem('hrt-lab-results', JSON.stringify(labResults)); }, [labResults]);
    useEffect(() => { localStorage.setItem('hrt-dose-templates', JSON.stringify(doseTemplates)); }, [doseTemplates]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Reset scroll when switching tabs to avoid carrying over deep scroll positions
    useEffect(() => {
        const el = mainScrollRef.current;
        if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    }, [currentView]);

    useEffect(() => {
        if (events.length > 0) {
            const res = runSimulation(events, weight);
            setSimulation(res);
        } else {
            setSimulation(null);
        }
    }, [events, weight]);

    const calibrationFn = useMemo(() => {
        return createCalibrationInterpolator(simulation, labResults);
    }, [simulation, labResults]);

    const currentLevel = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        // Only use E2 for level status (calibrated), not CPA
        const baseE2 = interpolateConcentration_E2(simulation, h) || 0;
        return baseE2 * calibrationFn(h);
    }, [simulation, currentTime, calibrationFn]);

    const currentCPA = useMemo(() => {
        if (!simulation) return 0;
        const h = currentTime.getTime() / 3600000;
        const concCPA = interpolateConcentration_CPA(simulation, h) || 0;
        return concCPA; // ng/mL, no calibration for CPA
    }, [simulation, currentTime]);

    const getLevelStatus = (conc: number) => {
        if (conc > 300) return { label: 'status.level.high', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
        if (conc >= 100 && conc <= 200) return { label: 'status.level.mtf', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' };
        if (conc >= 70 && conc <= 300) return { label: 'status.level.luteal', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' };
        if (conc >= 30 && conc < 70) return { label: 'status.level.follicular', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' };
        if (conc >= 8 && conc < 30) return { label: 'status.level.male', color: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
        return { label: 'status.level.low', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' };
    };

    const currentStatus = useMemo(() => {
        // 只有当 E2 浓度大于 0 时才显示状态
        if (currentLevel > 0) {
            return getLevelStatus(currentLevel);
        }
        return null; // 没有 E2 数据时不显示状态
    }, [currentLevel]);

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

    type NavItem = { id: ViewKey; label: string; icon: React.ReactElement; };

    const navItems = useMemo<NavItem[]>(() => ([
        { id: 'home', label: t('nav.home'), icon: <Activity size={16} /> },
        { id: 'history', label: t('nav.history'), icon: <Calendar size={16} /> },
        { id: 'lab', label: t('nav.lab'), icon: <FlaskConical size={16} /> },
        { id: 'settings', label: t('nav.settings'), icon: <Settings size={16} /> },
    ]), [t]);

    const sanitizeImportedEvents = (raw: any): DoseEvent[] => {
        if (!Array.isArray(raw)) throw new Error('Invalid format');
        return raw
            .map((item: any) => {
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
            })
            .filter((item): item is DoseEvent => item !== null);
    };

    const sanitizeImportedLabResults = (raw: any): LabResult[] => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((item: any) => {
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
            })
            .filter((item): item is LabResult => item !== null);
    };

    const sanitizeImportedTemplates = (raw: any): DoseTemplate[] => {
        if (!Array.isArray(raw)) return [];
        return raw
            .map((item: any) => {
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
            })
            .filter((item): item is DoseTemplate => item !== null);
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

    const importEventsFromJson = (text: string): boolean => {
        try {
            const parsed = JSON.parse(text);

            if (parsed.encrypted && parsed.iv && parsed.salt && parsed.data) {
                setPendingImportText(text);
                setIsPasswordInputOpen(true);
                return true;
            }

            return processImportedData(parsed);
        } catch (err) {
            console.error(err);
            showDialog('alert', t('drawer.import_error'));
            return false;
        }
    };

    const handleAddEvent = () => {
        setEditingEvent(null);
        setIsFormOpen(true);
    };

    const handleEditEvent = (e: DoseEvent) => {
        setEditingEvent(e);
        setIsFormOpen(true);
    };

    const handleAddLabResult = () => {
        setEditingLab(null);
        setIsLabModalOpen(true);
    };

    const handleEditLabResult = (res: LabResult) => {
        setEditingLab(res);
        setIsLabModalOpen(true);
    };

    const handleDeleteLabResult = (id: string) => {
        showDialog('confirm', t('lab.delete_confirm'), () => {
            setLabResults(prev => prev.filter(r => r.id !== id));
        });
    };

    const handleClearLabResults = () => {
        if (!labResults.length) return;
        showDialog('confirm', t('lab.clear_confirm'), () => {
            setLabResults([]);
        });
    };

    const handleSaveTemplate = (template: DoseTemplate) => {
        setDoseTemplates(prev => [...prev, template]);
    };

    const handleDeleteTemplate = (id: string) => {
        setDoseTemplates(prev => prev.filter(t => t.id !== id));
    };

    const handleSaveEvent = (e: DoseEvent) => {
        setEvents(prev => {
            const exists = prev.find(p => p.id === e.id);
            if (exists) {
                return prev.map(p => p.id === e.id ? e : p);
            }
            return [...prev, e];
        });
    };

    const handleDeleteEvent = (id: string) => {
        showDialog('confirm', t('timeline.delete_confirm'), () => {
            setEvents(prev => prev.filter(e => e.id !== id));
        });
    };

    const handleSaveLabResult = (res: LabResult) => {
        setLabResults(prev => {
            const exists = prev.find(r => r.id === res.id);
            if (exists) {
                return prev.map(r => r.id === res.id ? res : r);
            }
            return [...prev, res];
        });
    };



    const handleClearAllEvents = () => {
        if (!events.length) return;
        showDialog('confirm', t('drawer.clear_confirm'), () => {
            setEvents([]);
        });
    };

    const handleSaveDosages = () => {
        if (events.length === 0 && labResults.length === 0) {
            showDialog('alert', t('drawer.empty_export'));
            return;
        }
        setIsExportModalOpen(true);
    };

    const handleQuickExport = () => {
        if (events.length === 0 && labResults.length === 0) {
            showDialog('alert', t('drawer.empty_export'));
            return;
        }
        const exportData = {
            meta: { version: 1, exportedAt: new Date().toISOString() },
            weight: weight,
            events: events,
            labResults: labResults,
            doseTemplates: doseTemplates
        };
        const json = JSON.stringify(exportData, null, 2);
        navigator.clipboard.writeText(json).then(() => {
            showDialog('alert', t('drawer.export_copied'));
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    };

    const downloadFile = (data: string, filename: string) => {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportConfirm = async (encrypt: boolean) => {
        setIsExportModalOpen(false);
        const exportData = {
            meta: { version: 1, exportedAt: new Date().toISOString() },
            weight: weight,
            events: events,
            labResults: labResults,
            doseTemplates: doseTemplates
        };
        const json = JSON.stringify(exportData, null, 2);

        if (encrypt) {
            const { data, password } = await encryptData(json);
            setGeneratedPassword(password);
            setIsPasswordDisplayOpen(true);
            downloadFile(data, `hrt-dosages-encrypted-${new Date().toISOString().split('T')[0]}.json`);
        } else {
            downloadFile(json, `hrt-dosages-${new Date().toISOString().split('T')[0]}.json`);
        }
    };

    const handlePasswordSubmit = async (password: string) => {
        if (!pendingImportText) return;
        const decrypted = await decryptData(pendingImportText, password);
        if (decrypted) {
            setIsPasswordInputOpen(false);
            setPendingImportText(null);
            try {
                const parsed = JSON.parse(decrypted);
                processImportedData(parsed);
            } catch (e) {
                showDialog('alert', t('import.decrypt_error'));
            }
        } else {
            showDialog('alert', t('import.decrypt_error'));
        }
    };

    return (
        <div className="h-screen w-full bg-white dark:bg-gray-950 flex flex-col md:flex-row font-sans text-gray-900 dark:text-white select-none overflow-hidden transition-colors duration-300">
            <Sidebar
                navItems={navItems}
                currentView={currentView}
                onViewChange={handleViewChange}
                currentTime={currentTime}
                lang={lang}
                t={t}
            />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-gray-50/50 dark:bg-gray-950 md:shadow-none shadow-xl shadow-gray-900/10 relative transition-colors duration-300">
                {/* Top navigation removed */}

                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`flex-1 flex flex-col overflow-y-auto scrollbar-hide page-transition ${transitionDirection === 'forward' ? 'page-forward' : 'page-backward'}`}
                >
                    {/* Header */}
                    {currentView === 'home' && (
                        <header className="relative px-4 md:px-8 pt-6 pb-4">
                            <div className="grid md:grid-cols-3 gap-3 md:gap-4">
                                <div className="md:col-span-2 bg-white dark:bg-gray-900 rounded-[2rem] shadow-sm shadow-gray-100 dark:shadow-none border border-gray-100 dark:border-gray-800 px-6 py-6 relative overflow-hidden transition-colors duration-300">
                                    <div className="flex items-center mb-6 relative">
                                        <h1 className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 text-[11px] md:text-xs font-bold text-gray-900 dark:text-white tracking-wide uppercase shadow-sm dark:shadow-none border border-transparent dark:border-gray-700">
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                            {t('status.estimate')}
                                        </h1>
                                    </div>
                                    <div className="grid grid-cols-2 gap-8 relative">
                                        {/* E2 Display */}
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-0.5">
                                                {t('label.e2')}
                                            </div>
                                            <div className="flex items-baseline gap-2">
                                                {currentLevel > 0 ? (
                                                    <>
                                                        <span className="text-5xl md:text-6xl font-black text-gray-900 dark:text-white tracking-tighter">
                                                            {currentLevel.toFixed(0)}
                                                        </span>
                                                        <span className="text-base font-bold text-gray-400 mb-1.5">pg/mL</span>
                                                    </>
                                                ) : (
                                                    <span className="text-5xl md:text-6xl font-black text-gray-200 dark:text-gray-800 tracking-tighter">
                                                        --
                                                    </span>
                                                )}
                                            </div>
                                            {currentStatus && (
                                                <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 mt-3 w-fit ${currentStatus.bg} dark:bg-opacity-20 border ${currentStatus.border} dark:border-opacity-30`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${currentStatus.color.replace('text-', 'bg-')}`}></div>
                                                    <span className={`text-[10px] md:text-[11px] font-bold ${currentStatus.color} dark:text-gray-300`}>
                                                        {t(currentStatus.label)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {/* CPA Display */}
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest pl-0.5">
                                                <span>{t('label.cpa')}</span>
                                            </div>
                                            <div className="flex items-baseline gap-2">
                                                {currentCPA > 0 ? (
                                                    <>
                                                        <span className="text-5xl md:text-6xl font-black text-gray-900 dark:text-white tracking-tighter">
                                                            {currentCPA.toFixed(0)}
                                                        </span>
                                                        <span className="text-base font-bold text-gray-400 dark:text-gray-500 mb-1.5">ng/mL</span>
                                                    </>
                                                ) : (
                                                    <span className="text-5xl md:text-6xl font-black text-gray-200 dark:text-gray-800 tracking-tighter">
                                                        --
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
                                    <div className="flex items-center gap-3 p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100/50 dark:shadow-none transition-colors duration-300">
                                        <div className="w-10 h-10 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-900 dark:text-white shrink-0">
                                            <Activity size={18} />
                                        </div>
                                        <div className="leading-tight min-w-0">
                                            <p className="text-[10px] md:text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">{t('timeline.title')}</p>
                                            <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white tracking-tight">{events.length || 0}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsWeightModalOpen(true)}
                                        className="flex items-center gap-3 p-4 rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100/50 dark:shadow-none hover:border-gray-200 dark:hover:border-gray-700 transition-all text-left group"
                                    >
                                        <div className="w-10 h-10 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center text-gray-900 dark:text-white group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors shrink-0">
                                            <Settings size={18} />
                                        </div>
                                        <div className="leading-tight min-w-0">
                                            <p className="text-[10px] md:text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">{t('status.weight')}</p>
                                            <p className="text-lg md:text-xl font-black text-gray-900 dark:text-white tracking-tight">{weight} kg</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </header>
                    )}

                    <main className="w-full px-4 py-6 md:px-8 md:py-8 pb-32 md:pb-8">
                        {/* Chart */}
                        {currentView === 'home' && (
                            <ResultChart
                                sim={simulation}
                                events={events}
                                onPointClick={handleEditEvent}
                                labResults={labResults}
                                calibrationFn={calibrationFn}
                                isDarkMode={theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)}
                            />
                        )}

                        {/* Timeline */}
                        {currentView === 'history' && (
                            <div className="relative space-y-6 pt-6 pb-20">
                                <div className="px-4">
                                    <div className="w-full p-4 rounded-[2rem] bg-white dark:bg-gray-900 flex items-center justify-between shadow-sm shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-gray-800 transition-colors duration-300">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3 pl-2">
                                            <Activity size={24} className="text-[#f6c4d7]" /> {t('timeline.title')}
                                        </h2>
                                        <button
                                            onClick={() => setIsQuickAddOpen(!isQuickAddOpen)}
                                            className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-white dark:text-gray-900 shadow-lg shadow-gray-900/20 dark:shadow-none hover:scale-105 active:scale-95 transition-all ${isQuickAddOpen ? 'bg-gray-500 dark:bg-gray-400' : 'bg-gray-900 dark:bg-gray-100'}`}
                                        >
                                            {isQuickAddOpen ? <X size={20} /> : <Plus size={24} />}
                                        </button>
                                    </div>
                                </div>

                                {isQuickAddOpen && (
                                    <div className="mx-4 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
                                        <DoseForm
                                            eventToEdit={null}
                                            onSave={(e) => {
                                                handleSaveEvent(e);
                                                setIsQuickAddOpen(false);
                                            }}
                                            onCancel={() => setIsQuickAddOpen(false)}
                                            onDelete={() => { }}
                                            templates={doseTemplates}
                                            onSaveTemplate={handleSaveTemplate}
                                            onDeleteTemplate={handleDeleteTemplate}
                                            isInline={true}
                                        />
                                    </div>
                                )}

                                {Object.keys(groupedEvents).length === 0 && (
                                    <div className="mx-4 text-center py-16 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-[2rem] border border-dashed border-gray-200 dark:border-gray-800 transition-colors duration-300">
                                        <p className="font-medium">{t('timeline.empty')}</p>
                                    </div>
                                )}

                                {Object.entries(groupedEvents).map(([date, items]) => (
                                    <div key={date} className="relative mx-4 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100/50 dark:shadow-none overflow-hidden transition-colors duration-300">
                                        <div className="sticky top-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm py-4 px-6 z-10 flex items-center gap-3 border-b border-gray-50 dark:border-gray-800 transition-colors duration-300">
                                            <div className="w-2.5 h-2.5 rounded-full bg-pink-200"></div>
                                            <span className="text-xs font-bold text-gray-400 dark:text-gray-500">{date}</span>
                                        </div>
                                        <div className="divide-y divide-gray-50 dark:divide-gray-800">
                                            {(items as DoseEvent[]).map(ev => (
                                                <div
                                                    key={ev.id}
                                                    onClick={() => handleEditEvent(ev)}
                                                    className="p-5 flex items-center gap-5 hover:bg-gray-50/80 dark:hover:bg-gray-800/60 transition-all cursor-pointer group relative"
                                                >
                                                    <div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center shrink-0 ${ev.route === Route.injection ? 'bg-pink-50 dark:bg-pink-900/20 text-pink-500 dark:text-pink-400' : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400'} border border-gray-100 dark:border-gray-800 group-hover:scale-105 transition-transform duration-300`}>
                                                        {getRouteIcon(ev.route)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-bold text-gray-900 dark:text-white text-sm truncate">
                                                                {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                            </span>
                                                            <span className="font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                                                                {formatTime(new Date(ev.timeH * 3600000))}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                                {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                                    <>
                                                                        <span className="text-gray-300 dark:text-gray-600">•</span>
                                                                        <span className="text-gray-700 dark:text-gray-300">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-700 dark:text-gray-300">
                                                                    <span>{`${t('timeline.dose_label')}: ${ev.doseMG.toFixed(2)} mg`}</span>
                                                                    {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && (
                                                                        <span className="text-gray-500 dark:text-gray-500 text-[11px]">
                                                                            {`(${(ev.doseMG * getToE2Factor(ev.ester)).toFixed(2)} mg E2)`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}

                            </div>
                        )}

                        {/* Lab Calibration */}
                        {currentView === 'lab' && (
                            <div className="relative space-y-6 pt-6 pb-20">
                                <div className="px-4">
                                    <div className="w-full p-4 rounded-[2rem] bg-white dark:bg-gray-900 flex items-center justify-between shadow-sm shadow-gray-100/50 dark:shadow-none border border-gray-100 dark:border-gray-800 transition-colors duration-300">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-3 pl-2">
                                            <FlaskConical size={24} className="text-teal-500" /> {t('lab.title')}
                                        </h2>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setIsQuickAddLabOpen(!isQuickAddLabOpen)}
                                                className={`inline-flex items-center justify-center w-11 h-11 rounded-full text-white dark:text-gray-900 shadow-lg shadow-gray-900/20 dark:shadow-none hover:scale-105 active:scale-95 transition-all ${isQuickAddLabOpen ? 'bg-gray-500 dark:bg-gray-400' : 'bg-gray-900 dark:bg-gray-100'}`}
                                            >
                                                {isQuickAddLabOpen ? <X size={20} /> : <Plus size={24} />}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {isQuickAddLabOpen && (
                                    <div className="mx-4 mb-6 animate-in slide-in-from-top-4 fade-in duration-300">
                                        <LabResultForm
                                            resultToEdit={null}
                                            onSave={(res) => {
                                                handleSaveLabResult(res);
                                                setIsQuickAddLabOpen(false);
                                            }}
                                            onCancel={() => setIsQuickAddLabOpen(false)}
                                            onDelete={() => { }}
                                            isInline={true}
                                        />
                                    </div>
                                )}

                                {labResults.length === 0 ? (
                                    <div className="mx-4 text-center py-16 text-gray-400 dark:text-gray-600 bg-white dark:bg-gray-900 rounded-[2rem] border border-dashed border-gray-200 dark:border-gray-800 transition-colors duration-300">
                                        <p className="font-medium">{t('lab.empty')}</p>
                                    </div>
                                ) : (
                                    <div className="mx-4 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100/50 dark:shadow-none divide-y divide-gray-50 dark:divide-gray-800 overflow-hidden transition-colors duration-300">
                                        {labResults
                                            .slice()
                                            .sort((a, b) => b.timeH - a.timeH)
                                            .map(res => {
                                                const d = new Date(res.timeH * 3600000);
                                                return (
                                                    <div
                                                        key={res.id}
                                                        className="p-5 flex items-center gap-5 hover:bg-gray-50/80 dark:hover:bg-gray-800/60 transition-all cursor-pointer group relative"
                                                        onClick={() => handleEditLabResult(res)}
                                                    >
                                                        <div className="w-14 h-14 rounded-[1.2rem] flex items-center justify-center shrink-0 bg-teal-50 dark:bg-teal-900/20 border border-teal-100 dark:border-teal-900/30 group-hover:scale-105 transition-transform duration-300">
                                                            <FlaskConical className="text-teal-500 dark:text-teal-400" size={20} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-bold text-gray-900 dark:text-white text-sm truncate">
                                                                    {res.concValue} {res.unit}
                                                                </span>
                                                                <span className="font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-md border border-gray-100 dark:border-gray-700">
                                                                    {formatTime(d)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                                                {formatDate(d, lang)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                <div className="mx-4 bg-white dark:bg-gray-900 rounded-[2rem] border border-gray-100 dark:border-gray-800 shadow-sm shadow-gray-100/50 dark:shadow-none flex items-center justify-between px-6 py-4 transition-colors duration-300">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                        {t('lab.tip_scale')} <span className="text-gray-900 dark:text-white font-bold">×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}</span>
                                    </div>
                                    <button
                                        onClick={handleClearLabResults}
                                        disabled={!labResults.length}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition ${labResults.length ? 'text-red-500 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40' : 'text-gray-300 dark:text-gray-600 bg-gray-50 dark:bg-gray-800 cursor-not-allowed'
                                            }`}
                                    >
                                        {t('lab.clear_all')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Settings */}
                        {currentView === 'settings' && (
                            <div className="relative space-y-5 pt-6 pb-8">
                                <div className="px-4">
                                    <div className="w-full p-4 rounded-2xl bg-white dark:bg-gray-900 flex items-center justify-between shadow-sm dark:shadow-none border border-transparent dark:border-gray-800 transition-colors duration-300">
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-3">
                                            <Settings size={22} className="text-[#f6c4d7]" /> {t('nav.settings')}
                                        </h2>
                                        <div className="min-w-[136px] h-11" />
                                    </div>
                                </div>

                                {/* General Settings */}
                                <div className="space-y-2">
                                    <h3 className="px-5 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('settings.group.general')}</h3>
                                    <div className="mx-4 w-auto p-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-3 shadow-sm dark:shadow-none transition-colors duration-300">
                                        <CustomSelect
                                            icon={<Languages className="text-blue-500" size={20} />}
                                            label={t('drawer.lang')}
                                            value={lang}
                                            onChange={(val) => setLang(val as Lang)}
                                            options={languageOptions}
                                        />

                                        <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                                            <CustomSelect
                                                icon={<Palette className="text-indigo-500" size={20} />}
                                                label={t('settings.theme')}
                                                value={theme}
                                                onChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
                                                options={[
                                                    { value: 'light', label: t('theme.light'), icon: <Sun size={20} className="text-amber-500" /> },
                                                    { value: 'dark', label: t('theme.dark'), icon: <Moon size={20} className="text-indigo-500" /> },
                                                    { value: 'system', label: t('theme.system'), icon: <Monitor size={20} className="text-gray-500" /> },
                                                ]}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Data Management */}
                                <div className="space-y-2">
                                    <h3 className="px-5 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{t('settings.group.data')}</h3>
                                    <div className="mx-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden transition-colors duration-300">
                                        <button
                                            onClick={() => setIsImportModalOpen(true)}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition text-left"
                                        >
                                            <Upload className="text-teal-500" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('import.title')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={handleSaveDosages}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition text-left"
                                        >
                                            <Download className="text-pink-400" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('export.title')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={handleQuickExport}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition text-left"
                                        >
                                            <Copy className="text-blue-400" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('drawer.export_quick')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={handleClearAllEvents}
                                            disabled={!events.length}
                                            className={`w-full flex items-center gap-3 px-4 py-4 text-left transition ${events.length ? 'hover:bg-red-50 dark:hover:bg-red-900/20' : 'bg-gray-50 dark:bg-gray-800 cursor-not-allowed opacity-60'}`}
                                        >
                                            <Trash2 className="text-red-400" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('drawer.clear')}</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* About */}
                                <div className="space-y-2">
                                    <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.about')}</h3>
                                    <div className="mx-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm dark:shadow-none divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden transition-colors duration-300">
                                        <button
                                            onClick={() => {
                                                showDialog('confirm', t('drawer.model_confirm'), () => {
                                                    window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank');
                                                });
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition text-left"
                                        >
                                            <Info className="text-purple-500" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('drawer.model_title')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => {
                                                showDialog('confirm', t('drawer.github_confirm'), () => {
                                                    window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                                                });
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-left"
                                        >
                                            <Github className="text-gray-700 dark:text-gray-300" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('drawer.github')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={() => setIsDisclaimerOpen(true)}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition text-left"
                                        >
                                            <AlertTriangle className="text-amber-500" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 dark:text-white text-sm">{t('drawer.disclaimer')}</p>
                                            </div>
                                        </button>
                                    </div>
                                </div>


                                {/* Version Footer */}
                                <div className="pt-2 pb-4 flex justify-center">
                                    <p className="text-xs font-medium text-gray-300">
                                        {APP_VERSION}
                                    </p>
                                </div>
                            </div>
                        )}
                    </main>

                </div>

                {/* Bottom Navigation - mobile only */}
                <nav className="fixed bottom-0 left-0 right-0 px-6 pb-6 pt-2 bg-transparent z-40 safe-area-pb md:hidden pointer-events-none">
                    <div className="w-full pointer-events-auto bg-white/60 dark:bg-gray-900/60 backdrop-blur-xl backdrop-saturate-150 border border-white/40 dark:border-gray-700/40 shadow-2xl shadow-gray-900/10 dark:shadow-black/20 rounded-[2rem] px-2 py-2 flex items-center justify-between gap-1 transition-colors duration-300">
                        <button
                            onClick={() => handleViewChange('home')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-[1.5rem] py-2.5 transition-all duration-300 ${currentView === 'home'
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg shadow-gray-900/10 scale-100'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <Activity size={20} strokeWidth={currentView === 'home' ? 3 : 2} />
                        </button>
                        <button
                            onClick={() => handleViewChange('history')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-[1.5rem] py-2.5 transition-all duration-300 ${currentView === 'history'
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg shadow-gray-900/10 scale-100'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <Calendar size={20} strokeWidth={currentView === 'history' ? 3 : 2} />
                        </button>
                        <button
                            onClick={() => handleViewChange('lab')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-[1.5rem] py-2.5 transition-all duration-300 ${currentView === 'lab'
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg shadow-gray-900/10 scale-100'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <FlaskConical size={20} strokeWidth={currentView === 'lab' ? 3 : 2} />
                        </button>
                        <button
                            onClick={() => handleViewChange('settings')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-[1.5rem] py-2.5 transition-all duration-300 ${currentView === 'settings'
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg shadow-gray-900/10 scale-100'
                                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                        >
                            <Settings size={20} strokeWidth={currentView === 'settings' ? 3 : 2} />
                        </button>
                    </div>
                </nav>
            </div>

            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                onExport={handleExportConfirm}
                events={events}
                labResults={labResults}
                weight={weight}
            />

            <PasswordDisplayModal
                isOpen={isPasswordDisplayOpen}
                onClose={() => setIsPasswordDisplayOpen(false)}
                password={generatedPassword}
            />

            <PasswordInputModal
                isOpen={isPasswordInputOpen}
                onClose={() => setIsPasswordInputOpen(false)}
                onConfirm={handlePasswordSubmit}
            />

            <WeightEditorModal
                isOpen={isWeightModalOpen}
                onClose={() => setIsWeightModalOpen(false)}
                currentWeight={weight}
                onSave={setWeight}
            />

            <DoseFormModal
                isOpen={isFormOpen}
                onClose={() => setIsFormOpen(false)}
                eventToEdit={editingEvent}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                templates={doseTemplates}
                onSaveTemplate={handleSaveTemplate}
                onDeleteTemplate={handleDeleteTemplate}
            />

            <DisclaimerModal
                isOpen={isDisclaimerOpen}
                onClose={() => setIsDisclaimerOpen(false)}
            />

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportJson={importEventsFromJson}
            />

            <LabResultModal
                isOpen={isLabModalOpen}
                onClose={() => setIsLabModalOpen(false)}
                onSave={handleSaveLabResult}
                onDelete={handleDeleteLabResult}
                resultToEdit={editingLab}
            />
        </div>
    );
};

const App = () => (
    <LanguageProvider>
        <DialogProvider>
            <AppContent />
        </DialogProvider>
    </LanguageProvider>
);

export default App;
