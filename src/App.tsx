import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Calendar, FlaskConical, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import ErrorBoundary from './components/ErrorBoundary';
import { APP_VERSION } from './constants';
import { DoseEvent, LabResult, createCalibrationInterpolator, decompressData, encryptData, decryptData } from '../logic';
import { DoseTemplate } from './components/DoseFormModal';
import { useAppData } from './hooks/useAppData';
import { useAppNavigation, ViewKey } from './hooks/useAppNavigation';

// Define NavItem interface to match what useAppNavigation returns
interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType; // Use ElementType to accept components like Lucide icons
}

import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal from './components/DoseFormModal';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import PasswordDisplayModal from './components/PasswordDisplayModal';
import Sidebar from './components/Sidebar';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import LabResultModal from './components/LabResultModal';
import AuthModal from './components/AuthModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ReloadPrompt from './components/ReloadPrompt';

import { cloudService } from './services/cloud';

// Pages
import Home from './pages/Home';
import History from './pages/History';
import Lab from './pages/Lab';
import Settings from './pages/Settings';
import Account from './pages/Account';
import Admin from './pages/Admin';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { user, token, logout } = useAuth();

    // Use Custom Hooks
    const {
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
    } = useAppData(showDialog);

    const {
        currentView,
        transitionDirection,
        handleViewChange,
        mainScrollRef,
    } = useAppNavigation(user);


    // --- Local UI State (Modals & Forms) ---
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
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<LabResult | null>(null);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);


    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as 'light' | 'dark' | 'system') || 'system';
    });


    // --- Theme Effect ---
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
            const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches);
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        } else {
            applyTheme(theme === 'dark');
        }
    }, [theme]);

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


    // --- Modal Logic Wrappers ---

    useEffect(() => {
        const shouldLock = isExportModalOpen || isPasswordDisplayOpen || isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isDisclaimerOpen || isLabModalOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isExportModalOpen, isPasswordDisplayOpen, isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isDisclaimerOpen, isLabModalOpen]);


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

    const handleAddEvent = () => { setEditingEvent(null); setIsFormOpen(true); };
    const handleEditEvent = (e: DoseEvent) => { setEditingEvent(e); setIsFormOpen(true); };

    const handleAddLabResult = () => { setEditingLab(null); setIsLabModalOpen(true); };
    const handleEditLabResult = (res: LabResult) => { setEditingLab(res); setIsLabModalOpen(true); };


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

    const handleCloudSave = async () => {
        if (!token) { setIsAuthModalOpen(true); return; }
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
        if (!token) { setIsAuthModalOpen(true); return; }
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

    // Construct Nav Items again just for Sidebar prop, or reuse from hook if we exported it
    // Actually we exported navItems from useAppNavigation
    // But we need to pass them to sidebar. 
    // And also reconstruct the bottom nav bar manually because it was inline in the original App.tsx
    // Let's grab navItems logic from hook or just reconstruct here?
    // The hook provides navItems.

    const { navItems } = useAppNavigation(user); // Re-calling hook? No, I returned it. 
    // Wait, I need to get it from the previous call.
    // I already destructured it: const { ... } = useAppNavigation(user);
    // Ah I missed destructuring `navItems` in line 59. Let me fix the destructuring.

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
                            onSaveEvent={e => {
                                if (events.find(p => p.id === e.id)) updateEvent(e);
                                else addEvent(e);
                            }}
                            onDeleteEvent={deleteEvent}
                            onSaveTemplate={addTemplate}
                            onDeleteTemplate={deleteTemplate}
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
                            onSaveLabResult={r => {
                                if (labResults.find(prev => prev.id === r.id)) updateLabResult(r);
                                else addLabResult(r);
                            }}
                            onDeleteLabResult={deleteLabResult}
                            onEditLabResult={handleEditLabResult}
                            onClearLabResults={clearLabResults}
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
                            onClearAllEvents={clearAllEvents}
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
                        {navItems.filter(item => item.id !== 'admin').map(({ id, icon: Icon, label }) => {
                            const isActive = currentView === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => handleViewChange(id as ViewKey)}
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
                onSave={e => {
                    if (events.find(p => p.id === e.id)) updateEvent(e);
                    else addEvent(e);
                }}
                onDelete={deleteEvent}
                templates={doseTemplates}
                onSaveTemplate={addTemplate}
                onDeleteTemplate={deleteTemplate}
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
                onSave={r => {
                    if (labResults.find(prev => prev.id === r.id)) updateLabResult(r);
                    else addLabResult(r);
                }}
                onDelete={deleteLabResult}
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
