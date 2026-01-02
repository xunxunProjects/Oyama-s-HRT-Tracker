import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Settings, Plus, Activity, Calendar, Languages, Upload, Download, Trash2, Info, Github, Copy, AlertTriangle, FlaskConical } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { APP_VERSION } from './constants';
import { DoseEvent, Route, Ester, ExtraKey, SimulationResult, runSimulation, interpolateConcentration, interpolateConcentration_E2, interpolateConcentration_CPA, encryptData, decryptData, getToE2Factor, LabResult, createCalibrationInterpolator } from '../logic';
import { formatDate, formatTime, getRouteIcon } from './utils/helpers';
import { Lang } from './i18n/translations';
import ResultChart from './components/ResultChart';
import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal from './components/DoseFormModal';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import PasswordDisplayModal from './components/PasswordDisplayModal';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import LabResultModal from './components/LabResultModal';
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
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<LabResult | null>(null);

    type ViewKey = 'home' | 'history' | 'lab' | 'settings';
    const viewOrder: ViewKey[] = ['home', 'history', 'lab', 'settings'];

    const [currentView, setCurrentView] = useState<ViewKey>('home');
    const [transitionDirection, setTransitionDirection] = useState<'forward' | 'backward'>('forward');
    const mainScrollRef = useRef<HTMLDivElement>(null);

    const languageOptions = useMemo(() => ([
        { value: 'zh', label: '简体中文', icon: <img src={flagCN} alt="CN" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'zh-TW', label: '正體中文（中国台湾）', icon: <img src={flagTW} alt="TW" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'yue', label: '廣東話', icon: <img src={flagHK} alt="HK" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'en', label: 'English', icon: <img src={flagUS} alt="US" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'ja', label: '日本語', icon: <img src={flagJP} alt="JP" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'ru', label: 'Русский', icon: <img src={flagRU} alt="RU" className="w-5 h-5 rounded-sm object-contain" /> },
        { value: 'uk', label: 'Українська', icon: <img src={flagUA} alt="UA" className="w-5 h-5 rounded-sm object-contain" /> },
    ]), []);

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

    const processImportedData = (parsed: any): boolean => {
        try {
            let newEvents: DoseEvent[] = [];
            let newWeight: number | undefined = undefined;
            let newLabs: LabResult[] = [];

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
            }

            if (!newEvents.length && !newWeight && !newLabs.length) throw new Error('No valid entries');
            
            if (newEvents.length > 0) setEvents(newEvents);
            if (newWeight !== undefined) setWeight(newWeight);
            if (newLabs.length > 0) setLabResults(newLabs);

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
            labResults: labResults
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
            labResults: labResults
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
        <div className="h-screen w-full bg-white flex flex-col font-sans text-gray-900 select-none overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-white shadow-xl shadow-gray-900/10">
                {/* Top navigation for tablet/desktop */}
                <div className="hidden md:flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-gray-200 bg-white">
                            <img src="/favicon.ico" alt="HRT Tracker logo" className="w-full h-full object-cover" />
                        </div>
                        <div className="leading-tight">
                            <p className="text-base font-black tracking-tight text-gray-900">HRT Tracker</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {navItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => handleViewChange(item.id)}
                                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-semibold transition ${
                                    currentView === item.id
                                        ? 'bg-gray-900 text-white border-gray-900'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                                }`}
                            >
                                {item.icon}
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="px-4 py-2.5 rounded-full border border-gray-200 bg-gray-50 text-sm font-bold text-gray-800 flex items-center gap-3">
                            <span>{formatDate(currentTime, lang)}</span>
                            <span className="text-gray-300">·</span>
                            <span className="font-mono text-gray-900">{formatTime(currentTime)}</span>
                        </div>
                        <button
                            onClick={handleAddEvent}
                            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800 transition"
                        >
                            <Plus size={16} />
                            <span>{t('btn.add')}</span>
                        </button>
                    </div>
                </div>

                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`flex-1 flex flex-col overflow-y-auto scrollbar-hide page-transition ${transitionDirection === 'forward' ? 'page-forward' : 'page-backward'}`}
                >
                    {/* Header */}
                    {currentView === 'home' && (
                        <header className="relative px-4 md:px-8 pt-6 pb-4">
                            <div className="grid md:grid-cols-3 gap-3 md:gap-4">
                                <div className="md:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm px-5 py-5">
                                    <div className="flex items-center mb-3">
                                        <h1 className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 text-[11px] md:text-xs font-semibold text-gray-700 border border-gray-200">
                                            <Activity size={14} className="text-gray-500" />
                                            {t('status.estimate')}
                                        </h1>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* E2 Display */}
                                        <div className="space-y-1">
                                            <div className="text-[10px] md:text-xs font-bold text-pink-400 uppercase tracking-wider">
                                                E2
                                            </div>
                                            <div className="flex items-end gap-2">
                                                {currentLevel > 0 ? (
                                                    <>
                                                        <span className="text-4xl md:text-5xl font-black text-pink-500 tracking-tight">
                                                            {currentLevel.toFixed(0)}
                                                        </span>
                                                        <span className="text-sm md:text-base font-bold text-pink-300 mb-1">pg/mL</span>
                                                    </>
                                                ) : (
                                                    <span className="text-4xl md:text-5xl font-black text-gray-300 tracking-tight">
                                                        --
                                                    </span>
                                                )}
                                            </div>
                                            {currentStatus && (
                                                <div className={`px-2.5 py-1 rounded-lg border ${currentStatus.bg} ${currentStatus.border} flex items-center gap-1.5 mt-2 w-fit`}>
                                                    <Info size={10} className={currentStatus.color} />
                                                    <span className={`text-[9px] md:text-[10px] font-bold ${currentStatus.color}`}>
                                                        {t(currentStatus.label)}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        {/* CPA Display */}
                                        <div className="space-y-1">
                                            <div className="text-[10px] md:text-xs font-bold text-purple-400 uppercase tracking-wider">
                                                CPA
                                            </div>
                                            <div className="flex items-end gap-2">
                                                {currentCPA > 0 ? (
                                                    <>
                                                        <span className="text-4xl md:text-5xl font-black text-purple-600 tracking-tight">
                                                            {currentCPA.toFixed(0)}
                                                        </span>
                                                        <span className="text-sm md:text-base font-bold text-purple-300 mb-1">ng/mL</span>
                                                    </>
                                                ) : (
                                                    <span className="text-4xl md:text-5xl font-black text-gray-300 tracking-tight">
                                                        --
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-1 gap-3">
                                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
                                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-200">
                                            <Activity size={18} className="text-gray-600" />
                                        </div>
                                        <div className="leading-tight">
                                            <p className="text-[11px] md:text-xs font-semibold text-gray-500">{t('timeline.title')}</p>
                                            <p className="text-lg md:text-xl font-bold text-gray-900">{events.length || 0}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setIsWeightModalOpen(true)}
                                        className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-200 shadow-sm hover:border-gray-300 transition text-left"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center border border-gray-200">
                                            <Settings size={18} className="text-gray-700" />
                                        </div>
                                        <div className="leading-tight">
                                            <p className="text-[11px] md:text-xs font-semibold text-gray-500">{t('status.weight')}</p>
                                            <p className="text-lg md:text-xl font-bold text-gray-900">{weight} kg</p>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </header>
                    )}

                    <main className="bg-white w-full px-4 py-6">
                        {/* Chart */}
                        {currentView === 'home' && (
                            <ResultChart 
                                sim={simulation} 
                                events={events}
                                onPointClick={handleEditEvent}
                                labResults={labResults}
                                calibrationFn={calibrationFn}
                            />
                        )}

                        {/* Timeline */}
                        {currentView === 'history' && (
                            <div className="relative space-y-5 pt-6 pb-16">
                                <div className="px-4">
                                    <div className="w-full p-4 rounded-2xl bg-white flex items-center justify-between shadow-sm">
                                        <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                                        <Activity size={22} className="text-[#f6c4d7]" /> {t('timeline.title')}
                                        </h2>
                                        <button
                                            onClick={handleAddEvent}
                                            className="inline-flex md:hidden items-center justify-center gap-2 px-3.5 py-2 h-11 rounded-xl bg-gray-900 text-white text-sm font-bold shadow-sm hover:shadow-md transition"
                                        >
                                            <Plus size={16} />
                                            <span>{t('btn.add')}</span>
                                        </button>
                                    </div>
                                </div>

                                {Object.keys(groupedEvents).length === 0 && (
                                    <div className="mx-4 text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                                    <p>{t('timeline.empty')}</p>
                                    </div>
                                )}

                                {Object.entries(groupedEvents).map(([date, items]) => (
                                    <div key={date} className="relative mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                        <div className="sticky top-0 bg-white/95 backdrop-blur py-3 px-4 z-0 flex items-center gap-2 border-b border-gray-100">
                                            <div className="w-2 h-2 rounded-full bg-pink-200"></div>
                                            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{date}</span>
                                        </div>
                                        <div className="divide-y divide-gray-100">
                                            {(items as DoseEvent[]).map(ev => (
                                                <div 
                                                    key={ev.id} 
                                                    onClick={() => handleEditEvent(ev)}
                                                    className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-all cursor-pointer group relative"
                                                >
                                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${ev.route === Route.injection ? 'bg-pink-50' : 'bg-gray-50'} border border-gray-100`}>
                                                        {getRouteIcon(ev.route)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-1">
                                                            <span className="font-bold text-gray-900 text-sm truncate">
                                                                {ev.route === Route.patchRemove ? t('route.patchRemove') : t(`ester.${ev.ester}`)}
                                                            </span>
                                                            <span className="font-mono text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                                                {formatTime(new Date(ev.timeH * 3600000))}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-gray-500 font-medium space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate">{t(`route.${ev.route}`)}</span>
                                                                {ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                                    <>
                                                                        <span className="text-gray-300">•</span>
                                                                        <span className="text-gray-700">{`${ev.extras[ExtraKey.releaseRateUGPerDay]} µg/d`}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {ev.route !== Route.patchRemove && !ev.extras[ExtraKey.releaseRateUGPerDay] && (
                                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-gray-700">
                                                                    <span>{`${t('timeline.dose_label')}: ${ev.doseMG.toFixed(2)} mg`}</span>
                                                                    {ev.ester !== Ester.E2 && ev.ester !== Ester.CPA && (
                                                                        <span className="text-gray-500 text-[11px]">
                                                                            {`(${ (ev.doseMG * getToE2Factor(ev.ester)).toFixed(2) } mg E2)`}
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
                            <div className="relative space-y-5 pt-6 pb-8">
                                <div className="px-4">
                                    <div className="w-full p-4 rounded-2xl bg-white flex items-center justify-between shadow-sm">
                                        <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                                            <FlaskConical size={22} className="text-teal-500" /> {t('lab.title')}
                                        </h2>
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={handleAddLabResult}
                                                className="inline-flex items-center justify-center gap-2 px-3.5 py-2 h-11 rounded-xl bg-gray-900 text-white text-sm font-bold shadow-sm hover:shadow-md transition"
                                            >
                                                <Plus size={16} />
                                                <span>{t('lab.add_title')}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {labResults.length === 0 ? (
                                    <div className="mx-4 text-center py-12 text-gray-400 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
                                        <p>{t('lab.empty')}</p>
                                    </div>
                                ) : (
                                    <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                                        {labResults
                                            .slice()
                                            .sort((a, b) => b.timeH - a.timeH)
                                            .map(res => {
                                                const d = new Date(res.timeH * 3600000);
                                                return (
                                                    <div 
                                                        key={res.id} 
                                                        className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-all cursor-pointer group relative"
                                                        onClick={() => handleEditLabResult(res)}
                                                    >
                                                        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-teal-50 border border-teal-100">
                                                            <FlaskConical className="text-teal-500" size={18} />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between mb-1">
                                                                <span className="font-bold text-gray-900 text-sm truncate">
                                                                    {res.concValue} {res.unit}
                                                                </span>
                                                                <span className="font-mono text-[11px] font-medium text-gray-500 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                                                    {formatTime(d)}
                                                                </span>
                                                            </div>
                                                            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                                                                {formatDate(d, lang)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}

                                <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between px-4 py-3">
                                    <div className="text-xs text-gray-500">
                                            {t('lab.tip_scale')} ×{calibrationFn(currentTime.getTime() / 3600000).toFixed(2)}
                                    </div>
                                    <button
                                        onClick={handleClearLabResults}
                                        disabled={!labResults.length}
                                        className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                                            labResults.length ? 'text-red-500 hover:bg-red-50' : 'text-gray-300 cursor-not-allowed'
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
                                    <div className="w-full p-4 rounded-2xl bg-white flex items-center justify-between shadow-sm">
                                        <h2 className="text-xl font-semibold text-gray-900 tracking-tight flex items-center gap-3">
                                            <Settings size={22} className="text-[#f6c4d7]" /> {t('nav.settings')}
                                        </h2>
                                        <div className="min-w-[136px] h-11" />
                                    </div>
                                </div>

                                {/* General Settings */}
                                <div className="space-y-2">
                                    <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.general')}</h3>
                                    <div className="mx-4 w-auto p-4 rounded-2xl border border-gray-200 bg-white space-y-3 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <Languages className="text-blue-500" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 text-sm">{t('drawer.lang')}</p>
                                                <p className="text-xs text-gray-500">{t('drawer.lang_hint')}</p>
                                            </div>
                                            <div className="ml-auto text-xs font-bold text-gray-500">{lang.toUpperCase()}</div>
                                        </div>
                                        <CustomSelect
                                            value={lang}
                                            onChange={(val) => setLang(val as Lang)}
                                            options={languageOptions}
                                        />
                                    </div>
                                </div>

                                {/* Data Management */}
                                <div className="space-y-2">
                                    <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.data')}</h3>
                                    <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                                        <button
                                            onClick={() => setIsImportModalOpen(true)}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-teal-50 transition text-left"
                                        >
                                            <Upload className="text-teal-500" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 text-sm">{t('import.title')}</p>
                                                <p className="text-xs text-gray-500">{t('drawer.import_hint')}</p>
                                            </div>
                                        </button>

                                        <button
                                            onClick={handleSaveDosages}
                                            className="w-full flex items-center gap-3 px-4 py-4 hover:bg-pink-50 transition text-left"
                                        >
                                            <Download className="text-pink-400" size={20} />
                                            <div className="text-left">
                                                <p className="font-bold text-gray-900 text-sm">{t('export.title')}</p>
                                                <p className="text-xs text-gray-500">{t('drawer.save_hint')}</p>
                                            </div>
                                        </button>

                                    <button
                                        onClick={handleQuickExport}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-blue-50 transition text-left"
                                    >
                                        <Copy className="text-blue-400" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.export_quick')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.export_quick_hint')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={handleClearAllEvents}
                                        disabled={!events.length}
                                        className={`w-full flex items-center gap-3 px-4 py-4 text-left transition ${events.length ? 'hover:bg-red-50' : 'bg-gray-50 cursor-not-allowed opacity-60'}`}
                                    >
                                        <Trash2 className="text-red-400" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.clear')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.clear_confirm')}</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* About */}
                            <div className="space-y-2">
                                <h3 className="px-5 text-xs font-bold text-gray-400 uppercase tracking-wider">{t('settings.group.about')}</h3>
                                <div className="mx-4 bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100 overflow-hidden">
                                    <button
                                        onClick={() => {
                                            showDialog('confirm', t('drawer.model_confirm'), () => {
                                                window.open('https://misaka23323.com/articles/estrogen-model-summary', '_blank');
                                            });
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-purple-50 transition text-left"
                                    >
                                        <Info className="text-purple-500" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.model_title')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.model_desc')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            showDialog('confirm', t('drawer.github_confirm'), () => {
                                                window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank');
                                            });
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition text-left"
                                    >
                                        <Github className="text-gray-700" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.github')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.github_desc')}</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setIsDisclaimerOpen(true)}
                                        className="w-full flex items-center gap-3 px-4 py-4 hover:bg-amber-50 transition text-left"
                                    >
                                        <AlertTriangle className="text-amber-500" size={20} />
                                        <div className="text-left">
                                            <p className="font-bold text-gray-900 text-sm">{t('drawer.disclaimer')}</p>
                                            <p className="text-xs text-gray-500">{t('drawer.disclaimer_desc')}</p>
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
                <nav className="px-4 pb-4 pt-2 bg-transparent z-20 safe-area-pb shrink-0 md:hidden">
                    <div className="w-full bg-white/70 backdrop-blur-lg border border-white/40 rounded-3xl px-3 py-3 flex items-center justify-between gap-2">
                        <button
                            onClick={() => handleViewChange('home')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'home'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Activity size={22} className={currentView === 'home' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.home')}</span>
                        </button>
                        <button
                            onClick={() => handleViewChange('history')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'history'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Calendar size={22} className={currentView === 'history' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.history')}</span>
                        </button>
                        <button
                            onClick={() => handleViewChange('lab')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'lab'
                                    ? 'bg-white text-[#0f766e] border-teal-200'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <FlaskConical size={22} className={currentView === 'lab' ? 'text-[#0f766e]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.lab')}</span>
                        </button>
                        <button
                            onClick={() => handleViewChange('settings')}
                            className={`flex-1 flex flex-col items-center gap-1 rounded-2xl py-2 transition-all border-2 ${
                                currentView === 'settings'
                                    ? 'bg-white text-[#8a3459] border-[#f6c4d7]'
                                    : 'text-gray-500 hover:text-gray-700 border-transparent'
                            }`}
                        >
                            <Settings size={22} className={currentView === 'settings' ? 'text-[#f6c4d7]' : ''} />
                            <span className="text-[11px] font-semibold">{t('nav.settings')}</span>
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
            />

            <ImportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onImportJson={(payload) => {
                    const ok = importEventsFromJson(payload);
                    return ok;
                }}
            />

            <DisclaimerModal
                isOpen={isDisclaimerOpen}
                onClose={() => setIsDisclaimerOpen(false)}
            />

            <LabResultModal
                isOpen={isLabModalOpen}
                onClose={() => setIsLabModalOpen(false)}
                onSave={(res) => {
                    setLabResults(prev => {
                        const exists = prev.find(r => r.id === res.id);
                        if (exists) {
                            return prev.map(r => r.id === res.id ? res : r);
                        }
                        return [...prev, res];
                    });
                }}
                onDelete={(id) => {
                    showDialog('confirm', t('lab.delete_confirm'), () => {
                        setLabResults(prev => prev.filter(r => r.id !== id));
                    });
                }}
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
