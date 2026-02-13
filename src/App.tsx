import React, { useState, useEffect, useRef, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Activity, Calendar, FlaskConical, Settings as SettingsIcon, UserCircle } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import ErrorBoundary from './components/ErrorBoundary';
import { APP_VERSION } from './constants';
import { DoseEvent, Route, Ester, SimulationResult, runSimulation, interpolateConcentration_E2, interpolateConcentration_CPA, encryptData, decryptData, LabResult, createCalibrationInterpolator, decompressData } from '../logic';
import { formatDate } from './utils/helpers';
import { Lang } from './i18n/translations';
import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal, { DoseTemplate } from './components/DoseFormModal';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import PasswordDisplayModal from './components/PasswordDisplayModal';
import Sidebar from './components/Sidebar';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import LabResultModal from './components/LabResultModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthModal from './components/AuthModal';
import { cloudService } from './services/cloud';

// Pages
import Home from './pages/Home';
import History from './pages/History';
import Lab from './pages/Lab';
import Settings from './pages/Settings';
import Account from './pages/Account';
import Admin from './pages/Admin';
import { ShieldCheck } from 'lucide-react';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { user, token, logout } = useAuth();

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
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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

    type ViewKey = 'home' | 'history' | 'lab' | 'settings' | 'account' | 'admin';
    const viewOrder: ViewKey[] = ['home', 'history', 'lab', 'settings', 'account', 'admin'];

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
        { value: 'ko', label: '한국어' },
        { value: 'ar', label: 'العربية' },
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

    const navItems = useMemo<NavItem[]>(() => {
        const items = [
            { id: 'home', label: t('nav.home'), icon: <Activity size={16} /> },
            { id: 'history', label: t('nav.history'), icon: <Calendar size={16} /> },
            { id: 'lab', label: t('nav.lab'), icon: <FlaskConical size={16} /> },
            { id: 'settings', label: t('nav.settings'), icon: <SettingsIcon size={16} /> },
            { id: 'account', label: t('nav.account'), icon: <UserCircle size={16} /> },
        ];

        if (user?.isAdmin) {
            items.push({ id: 'admin', label: 'Admin', icon: <ShieldCheck size={16} /> });
        }

        return items as NavItem[];
    }, [t, user]);

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

    const importEventsFromJson = async (text: string): Promise<boolean> => {
        try {
            let parsed = JSON.parse(text);

            // Handle Encryption
            if (parsed.encrypted && parsed.iv && parsed.salt && parsed.data) {
                setPendingImportText(text);
                setIsPasswordInputOpen(true);
                return true;
            }

            // Handle Compression
            if (parsed.c && typeof parsed.c === 'string') {
                const decompressed = await decompressData(parsed.c);
                parsed = JSON.parse(decompressed);
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

    const handleExportConfirm = async (encrypt: boolean, customPassword?: string) => {
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
            const { data, password } = await encryptData(json, customPassword);
            if (!customPassword) {
                setGeneratedPassword(password);
                setIsPasswordDisplayOpen(true);
            }
            downloadFile(data, `hrt-dosages-encrypted-${new Date().toISOString().split('T')[0]}.json`);
        } else {
            downloadFile(json, `hrt-dosages-${new Date().toISOString().split('T')[0]}.json`);
        }
    };

    const handlePasswordSubmit = async (password: string) => {
        if (!pendingImportText) return;
        const decrypted = await decryptData(pendingImportText, password);
        if (decrypted) {
            try {
                let parsed = JSON.parse(decrypted);

                // Handle Compression after decryption
                if (parsed.c && typeof parsed.c === 'string') {
                    const decompressed = await decompressData(parsed.c);
                    parsed = JSON.parse(decompressed);
                }

                processImportedData(parsed);
                setIsPasswordInputOpen(false);
                setPendingImportText(null);
            } catch (e) {
                console.error(e);
                showDialog('alert', t('import.decrypt_error'));
            }
        } else {
            showDialog('alert', t('import.decrypt_error'));
        }
    };

    const handleCloudSave = async () => {
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }

        const exportData = {
            meta: { version: 1, exportedAt: new Date().toISOString() },
            weight: weight,
            events: events,
            labResults: labResults,
            doseTemplates: doseTemplates
        };

        try {
            await cloudService.save(token, exportData);
            showDialog('alert', 'Data saved to cloud successfully!');
        } catch (e) {
            showDialog('alert', 'Failed to save to cloud.');
        }
    };

    const handleCloudLoad = async () => {
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }

        try {
            const list = await cloudService.load(token);
            if (!list || list.length === 0) {
                showDialog('alert', 'No cloud backups found.');
                return;
            }

            const latest = list[0];
            const parsed = JSON.parse(latest.data);

            showDialog('confirm', `Load backup from ${new Date(latest.created_at * 1000).toLocaleString()}? This will overwrite local data.`, () => {
                processImportedData(parsed);
            });

        } catch (e) {
            showDialog('alert', 'Failed to load from cloud.');
        }
    };

    return (
        <div className="h-screen w-full bg-[var(--color-m3-surface)] dark:bg-[var(--color-m3-dark-surface)] flex flex-col md:flex-row font-sans text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] select-none overflow-hidden transition-colors duration-300">
            <Sidebar
                navItems={navItems}
                currentView={currentView}
                onViewChange={handleViewChange}
                currentTime={currentTime}
                lang={lang}
                t={t}
            />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] relative transition-colors duration-300">

                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`flex-1 flex flex-col overflow-y-auto scrollbar-hide page-transition ${transitionDirection === 'forward' ? 'page-forward' : 'page-backward'}`}
                >
                    {currentView === 'home' && (
                        <Home
                            t={t}
                            currentLevel={currentLevel}
                            currentCPA={currentCPA}
                            currentStatus={currentStatus}
                            events={events}
                            weight={weight}
                            setIsWeightModalOpen={setIsWeightModalOpen}
                            simulation={simulation}
                            labResults={labResults}
                            onEditEvent={handleEditEvent}
                            calibrationFn={calibrationFn}
                            theme={theme}
                        />
                    )}

                    {currentView === 'history' && (
                        <History
                            t={t}
                            isQuickAddOpen={isQuickAddOpen}
                            setIsQuickAddOpen={setIsQuickAddOpen}
                            doseTemplates={doseTemplates}
                            onSaveEvent={handleSaveEvent}
                            onDeleteEvent={handleDeleteEvent}
                            onSaveTemplate={handleSaveTemplate}
                            onDeleteTemplate={handleDeleteTemplate}
                            groupedEvents={groupedEvents}
                            onEditEvent={handleEditEvent}
                        />
                    )}

                    {currentView === 'lab' && (
                        <Lab
                            t={t}
                            isQuickAddLabOpen={isQuickAddLabOpen}
                            setIsQuickAddLabOpen={setIsQuickAddLabOpen}
                            labResults={labResults}
                            onSaveLabResult={handleSaveLabResult}
                            onDeleteLabResult={handleDeleteLabResult}
                            onEditLabResult={handleEditLabResult}
                            onClearLabResults={handleClearLabResults}
                            calibrationFn={calibrationFn}
                            currentTime={currentTime}
                            lang={lang}
                        />
                    )}

                    {currentView === 'settings' && (
                        <Settings
                            t={t}
                            lang={lang}
                            setLang={setLang}
                            theme={theme}
                            setTheme={setTheme}
                            languageOptions={languageOptions}
                            setIsImportModalOpen={setIsImportModalOpen}
                            onSaveDosages={handleSaveDosages}
                            onQuickExport={handleQuickExport}
                            onClearAllEvents={handleClearAllEvents}
                            events={events}
                            showDialog={showDialog}
                            setIsDisclaimerOpen={setIsDisclaimerOpen}
                            appVersion={APP_VERSION}
                            weight={weight}
                            setIsWeightModalOpen={setIsWeightModalOpen}
                        />
                    )}

                    {currentView === 'account' && (
                        <Account
                            t={t}
                            user={user}
                            token={token}
                            onOpenAuth={() => setIsAuthModalOpen(true)}
                            onLogout={logout}
                            onCloudSave={handleCloudSave}
                            onCloudLoad={handleCloudLoad}
                        />
                    )}

                    {currentView === 'admin' && user?.isAdmin && (
                        <Admin t={t} />
                    )}
                </div>

                {/* Bottom Navigation - M3 Navigation Bar */}
                <nav className="fixed bottom-0 left-0 right-0 px-4 pb-4 pt-2 bg-transparent z-40 safe-area-pb md:hidden pointer-events-none">
                    <div className="w-full pointer-events-auto bg-[var(--color-m3-surface-container-lowest)]/85 dark:bg-[var(--color-m3-dark-surface-container)]/85 backdrop-blur-2xl backdrop-saturate-150 border border-[var(--color-m3-outline-variant)]/30 dark:border-[var(--color-m3-dark-outline-variant)]/30 shadow-[var(--shadow-m3-3)] rounded-[var(--radius-xl)] px-1 py-1.5 flex items-center justify-around gap-0.5 transition-all duration-300">
                        {[
                            { id: 'home', icon: Activity, label: t('nav.home') },
                            { id: 'history', icon: Calendar, label: t('nav.history') },
                            { id: 'account', icon: UserCircle, label: t('nav.account') },
                            { id: 'lab', icon: FlaskConical, label: t('nav.lab') },
                            { id: 'settings', icon: SettingsIcon, label: t('nav.settings') },
                        ].map(({ id, icon: Icon, label }) => {
                            const isActive = currentView === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => handleViewChange(id as any)}
                                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-all duration-500 rounded-[var(--radius-xl)] relative`}
                                >
                                    <div className={`px-5 py-1.5 rounded-[var(--radius-full)] transition-all duration-500 ${isActive
                                        ? 'bg-[var(--color-m3-primary-container)] dark:bg-teal-900/40'
                                        : 'bg-transparent'
                                        }`}>
                                        <Icon
                                            size={20}
                                            strokeWidth={isActive ? 2.5 : 1.8}
                                            className={`transition-all duration-300 ${isActive
                                                ? 'text-[var(--color-m3-primary)] dark:text-teal-400'
                                                : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]'
                                                }`}
                                        />
                                    </div>
                                    <span className={`text-[10px] font-semibold tracking-tight transition-all duration-300 ${isActive
                                        ? 'text-[var(--color-m3-primary)] dark:text-teal-400'
                                        : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]'
                                        }`}>
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
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

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />
        </div >
    );
};

const App = () => (
    <LanguageProvider>
        <DialogProvider>
            <AuthProvider>
                <ErrorBoundary>
                    <AppContent />
                </ErrorBoundary>
            </AuthProvider>
        </DialogProvider>
    </LanguageProvider>
);

export default App;
