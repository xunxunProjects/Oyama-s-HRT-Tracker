import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Calendar, FlaskConical, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { HRTModeProvider } from './contexts/HRTModeContext';
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
import Sidebar from './components/Sidebar';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import TransparencyModal from './components/TransparencyModal';
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
import SessionsPage from './pages/Sessions';
import TwoFactorPage from './pages/TwoFactor';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { user, token, logout, needsSetup2FA, clearSetup2FA } = useAuth();
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);

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
        currentT,
        currentStatus,
        groupedEvents,
        addEvent, updateEvent, deleteEvent, clearAllEvents,
        addLabResult, updateLabResult, deleteLabResult, clearLabResults,
        addTemplate, deleteTemplate,
        addQuickDose, deleteQuickDose,
        quickDoses,
        processImportedData,
        mergeImportedData,
        buildExportPayload
    } = useAppData(showDialog);

    const {
        currentView,
        transitionDirection,
        handleViewChange,
        mainScrollRef,
        navItems,
    } = useAppNavigation(user);


    // --- Local UI State (Modals & Forms) ---
    const [isWeightModalOpen, setIsWeightModalOpen] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<DoseEvent | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [isQuickAddLabOpen, setIsQuickAddLabOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [isTransparencyOpen, setIsTransparencyOpen] = useState(false);
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<LabResult | null>(null);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);


    const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as 'light' | 'dark' | 'system') || 'system';
    });


    // --- Theme Effect ---
    useEffect(() => {
        if (needsSetup2FA && user && currentView !== 'two-factor') {
            handleViewChange('two-factor');
        }
    }, [needsSetup2FA, user]);

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
        { value: 'he', label: 'עברית' },
    ]), []);


    // --- Modal Logic Wrappers ---

    useEffect(() => {
        const shouldLock = isExportModalOpen || isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isDisclaimerOpen || isLabModalOpen || isTransparencyOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isExportModalOpen, isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isDisclaimerOpen, isLabModalOpen, isTransparencyOpen]);


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
        const exportData = buildExportPayload();
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

    const handleExportConfirm = async (encrypt: boolean, customPassword?: string): Promise<string | null> => {
        setIsExportModalOpen(false);
        const exportData = buildExportPayload();
        const json = JSON.stringify(exportData, null, 2);

        if (encrypt) {
            const { data, password } = await encryptData(json, customPassword);
            downloadFile(data, `hrt-dosages-encrypted-${new Date().toISOString().split('T')[0]}.json`);
            if (!customPassword) {
                return password;
            }
        } else {
            downloadFile(json, `hrt-dosages-${new Date().toISOString().split('T')[0]}.json`);
        }
        return null;
    };

    const handleCloudSave = async () => {
        if (!token) { setIsAuthModalOpen(true); return; }
        const exportData = buildExportPayload();
        try {
            await cloudService.save(token, exportData);
            showDialog('alert', t('account.cloud_save_success'));
        } catch (e) {
            showDialog('alert', t('account.cloud_save_failed'));
        }
    };

    const handleCloudLoad = async (backupId?: string) => {
        if (!token) { setIsAuthModalOpen(true); return; }
        try {
            let parsed: any;
            let timestamp: number;
            if (backupId) {
                const backup = await cloudService.loadOne(token, backupId);
                parsed = JSON.parse(backup.data);
                timestamp = backup.created_at;
            } else {
                const list = await cloudService.load(token);
                if (!list || list.length === 0) {
                    showDialog('alert', t('account.no_cloud_backups'));
                    return;
                }
                const latest = list[0];
                parsed = JSON.parse(latest.data);
                timestamp = latest.created_at;
            }
            showDialog('confirm', (t('account.load_confirm') as string).replace('{time}', new Date(timestamp * 1000).toLocaleString()), () => {
                processImportedData(parsed);
            });
        } catch (e) {
            showDialog('alert', t('account.cloud_load_failed'));
        }
    };

    const handleCloudMerge = async (backupId: string) => {
        if (!token) { setIsAuthModalOpen(true); return; }
        try {
            const backup = await cloudService.loadOne(token, backupId);
            const parsed = JSON.parse(backup.data);
            mergeImportedData(parsed);
        } catch (e) {
            showDialog('alert', t('account.merge_cloud_failed'));
        }
    };

    // Construct Nav Items again just for Sidebar prop, or reuse from hook if we exported it
    // Actually we exported navItems from useAppNavigation
    // But we need to pass them to sidebar. 
    // And also reconstruct the bottom nav bar manually because it was inline in the original App.tsx
    // Let's grab navItems logic from hook or just reconstruct here?
    // The hook provides navItems.

    return (
        <div className="h-[100dvh] w-full bg-[var(--color-m3-surface)] dark:bg-[var(--color-m3-dark-surface)] flex flex-col md:flex-row font-sans text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] select-none overflow-hidden transition-colors duration-300">
            <Sidebar
                navItems={navItems}
                currentView={currentView}
                onViewChange={(v) => !needsSetup2FA && handleViewChange(v)}
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
                            currentT={currentT}
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
                            quickDoses={quickDoses}
                            onAddQuickDose={addQuickDose}
                            onDeleteQuickDose={deleteQuickDose}
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
                            onImportJson={importEventsFromJson}
                            labResults={labResults}
                            onExport={handleExportConfirm}
                            onQuickExport={handleQuickExport}
                            onClearAllEvents={clearAllEvents}
                            events={events}
                            showDialog={showDialog}
                            setIsDisclaimerOpen={setIsDisclaimerOpen}
                            setIsTransparencyOpen={setIsTransparencyOpen}
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
                            onCloudMerge={handleCloudMerge}
                            localData={{ events, labResults, doseTemplates, weight }}
                            onNavigate={(v) => handleViewChange(v as ViewKey)}
                            twoFAEnabled={twoFAEnabled}
                            onTwoFAStatusChange={setTwoFAEnabled}
                        />
                    )}

                    {currentView === 'sessions' && token && (
                        <SessionsPage
                            token={token}
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'two-factor' && token && (
                        <TwoFactorPage
                            token={token}
                            enabled={twoFAEnabled}
                            onStatusChange={(v) => { setTwoFAEnabled(v); if (v) clearSetup2FA(); }}
                            onBack={() => handleViewChange('account')}
                            setupRequired={needsSetup2FA}
                        />
                    )}

                    {currentView === 'admin' && user?.isAdmin && (
                        <Admin t={t} />
                    )}
                </div>

                {/* Bottom Navigation - M3 Navigation Bar */}
                <nav className="fixed bottom-0 left-0 right-0 z-40 safe-area-pb md:hidden">
                    <div className="w-full bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container)] border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] flex items-center transition-all duration-300">
                        {navItems.filter(item => item.id !== 'admin').map(({ id, icon: Icon, label }) => {
                            const isActive = currentView === id;
                            const isDisabled = needsSetup2FA && id !== 'two-factor';
                            return (
                                <button
                                    key={id}
                                    onClick={() => !isDisabled && handleViewChange(id as ViewKey)}
                                    disabled={isDisabled}
                                    className={`flex-1 flex flex-col items-center justify-center gap-1.5 pt-3 pb-2 transition-colors duration-300 relative group
                                        ${isDisabled
                                            ? 'text-gray-300 dark:text-neutral-600 cursor-not-allowed'
                                            : isActive
                                            ? 'text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]'
                                        }`}
                                >
                                    {/* Active indicator underline */}
                                    <span 
                                        className={`absolute bottom-0 left-0 w-full h-[2px] bg-current transition-opacity duration-300 ease-out
                                            ${isActive 
                                                ? 'opacity-100' 
                                                : 'opacity-0'
                                            }`}
                                    />
                                    
                                    <span className="z-10">
                                        <Icon
                                            size={22}
                                            strokeWidth={isActive ? 2.5 : 2}
                                        />
                                    </span>
                                    <span className="text-[10px] font-medium tracking-tight z-10">
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
                onSave={(e: DoseEvent) => {
                    if (events.find(p => p.id === e.id)) updateEvent(e);
                    else addEvent(e);
                }}
                onDelete={deleteEvent}
                templates={doseTemplates}
                onSaveTemplate={addTemplate}
                onDeleteTemplate={deleteTemplate}
                quickDoses={quickDoses}
                onAddQuickDose={addQuickDose}
                onDeleteQuickDose={deleteQuickDose}
            />

            <DisclaimerModal
                isOpen={isDisclaimerOpen}
                onClose={() => setIsDisclaimerOpen(false)}
            />

            <TransparencyModal
                isOpen={isTransparencyOpen}
                onClose={() => setIsTransparencyOpen(false)}
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
        <HRTModeProvider>
            <DialogProvider>
                <AuthProvider>
                    <ErrorBoundary>
                        <AppContent />
                    </ErrorBoundary>
                </AuthProvider>
            </DialogProvider>
        </HRTModeProvider>
    </LanguageProvider>
);

export default App;
