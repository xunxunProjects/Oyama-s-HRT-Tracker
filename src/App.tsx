import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Activity, Calendar, FlaskConical, Settings as SettingsIcon, UserCircle, ShieldCheck } from 'lucide-react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { HRTModeProvider } from './contexts/HRTModeContext';
import ErrorBoundary from './components/ErrorBoundary';
import { APP_VERSION, AppTheme } from './constants';
import { DoseEvent, LabResult, decompressData, encryptData, decryptData, encryptCloudPayload } from '../logic';
import { parseCloudBackup } from './utils/cloudBackup';
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
import LabResultModal from './components/LabResultModal';
import AuthModal from './components/AuthModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ReloadPrompt from './components/ReloadPrompt';
import BackupConflictModal from './components/BackupConflictModal';
import { cloudService } from './services/cloud';

// Pages
import Home from './pages/Home';
import History from './pages/History';
import Lab from './pages/Lab';
import CalibrationSettings from './pages/CalibrationSettings';
import Settings from './pages/Settings';
import Account from './pages/Account';
import Admin from './pages/Admin';
import SessionsPage from './pages/Sessions';
import TwoFactorPage from './pages/TwoFactor';
import ChangePasswordPage from './pages/ChangePassword';
import DeleteAccountPage from './pages/DeleteAccount';
import EditProfilePage from './pages/EditProfile';
import EditAvatarPage from './pages/EditAvatar';
import PKParamsPage from './pages/PKParams';
import HRTModeSettings from './pages/HRTModeSettings';
import LanguageSettings from './pages/LanguageSettings';
import AppearanceSettings from './pages/AppearanceSettings';
import WeightSettings from './pages/WeightSettings';
import ExportSettings from './pages/ExportSettings';
import ImportSettings from './pages/ImportSettings';
import TransparencySettings from './pages/TransparencySettings';

// Encrypt the export payload for cloud storage when a device key is present.
// Without a key (e.g. a session predating E2EE, or a passwordless passkey
// login on a fresh device) the payload is stored as-is.
async function prepareCloudPayload(exportData: any): Promise<any> {
    const key = localStorage.getItem('enc_key');
    if (!key) return exportData;
    return await encryptCloudPayload(JSON.stringify(exportData), key);
}

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
        quickDoses,
        pkParams, setPkParams, clearPkParams, resetPkParams,
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
    const [isLabModalOpen, setIsLabModalOpen] = useState(false);
    const [editingLab, setEditingLab] = useState<LabResult | null>(null);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);

    // --- Auto-backup state ---
    const [autoBackup, setAutoBackup] = useState<boolean>(() =>
        localStorage.getItem('app-auto-backup') !== 'false'
    );
    const autoBackupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const initialLoadRef = useRef(true);
    const tokenRef = useRef(token);
    const userRef = useRef(user);
    const autoBackupRef = useRef(autoBackup);
    useEffect(() => { tokenRef.current = token; }, [token]);
    useEffect(() => { userRef.current = user; }, [user]);
    useEffect(() => { autoBackupRef.current = autoBackup; }, [autoBackup]);

    // --- Startup conflict check state ---
    const [conflictState, setConflictState] = useState<{
        cloudNewCount: number;
        localNewCount: number;
        cloudParsed: any;
    } | null>(null);
    const conflictCheckedRef = useRef(false);


    const [theme, setTheme] = useState<AppTheme>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as AppTheme) || 'system';
    });


    useEffect(() => {
        localStorage.setItem('app-auto-backup', String(autoBackup));
    }, [autoBackup]);

    // --- Auto-backup: debounced save when data changes ---
    // Deliberately depends ONLY on data slices, not on user/token/autoBackup.
    // Including those would trigger an unwanted backup on login (potentially
    // overwriting cloud data with empty local state) or when toggling the
    // setting. We read current auth/toggle state via refs at fire time.
    useEffect(() => {
        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            return;
        }
        if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
        autoBackupTimerRef.current = setTimeout(async () => {
            if (!autoBackupRef.current) return;
            const currentToken = tokenRef.current;
            const currentUser = userRef.current;
            if (!currentToken || !currentUser) return;
            try {
                const exportData = buildExportPayload();
                const payload = await prepareCloudPayload(exportData);
                await cloudService.save(currentToken, payload);
                // Silent success — no blocking dialog for background auto-backup
            } catch {
                // silent fail for auto-backup
            }
        }, 3000);
        return () => {
            if (autoBackupTimerRef.current) clearTimeout(autoBackupTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, labResults, doseTemplates]);

    // --- Startup conflict check when user logs in ---
    useEffect(() => {
        if (!user || !token) {
            conflictCheckedRef.current = false;
            setConflictState(null); // Clear any lingering modal data from previous session
            return;
        }
        if (conflictCheckedRef.current) return;
        conflictCheckedRef.current = true;

        cloudService.load(token).then(async list => {
            if (!list || list.length === 0) return;
            const latest = list[0];
            let cloudParsed: any;
            try {
                cloudParsed = await parseCloudBackup(latest.data);
            } catch {
                return; // Corrupt backup data — skip conflict check
            }
            if (!cloudParsed) return; // Encrypted but undecryptable on this device — skip

            const localPayload = buildExportPayload();
            const localIds = new Set<string>([
                ...localPayload.modes.transfem.events.map((e: any) => e.id),
                ...localPayload.modes.transmasc.events.map((e: any) => e.id),
                ...localPayload.modes.transfem.labResults.map((e: any) => e.id),
                ...localPayload.modes.transmasc.labResults.map((e: any) => e.id),
            ]);

            const cloudEvents = [
                ...(cloudParsed?.modes?.transfem?.events ?? cloudParsed?.events ?? []),
                ...(cloudParsed?.modes?.transmasc?.events ?? []),
                ...(cloudParsed?.modes?.transfem?.labResults ?? cloudParsed?.labResults ?? []),
                ...(cloudParsed?.modes?.transmasc?.labResults ?? []),
            ];
            const cloudIds = new Set<string>(cloudEvents.map((e: any) => e.id));

            const cloudNewCount = cloudEvents.filter((e: any) => !localIds.has(e.id)).length;
            const localNewCount = [...localIds].filter(id => !cloudIds.has(id)).length;

            if (cloudNewCount > 0 || localNewCount > 0) {
                setConflictState({ cloudNewCount, localNewCount, cloudParsed });
            }
        }).catch(() => {});
    }, [user, token]);

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

        // Mono renders as light with a grayscale filter (see html.mono in index.css)
        root.classList.toggle('mono', theme === 'mono');

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
        { value: 'ko', label: '한국어' },
        { value: 'tr', label: 'Türkçe' },
    ]), []);


    // --- Modal Logic Wrappers ---

    useEffect(() => {
        const shouldLock = isExportModalOpen || isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isDisclaimerOpen || isLabModalOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isExportModalOpen, isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isDisclaimerOpen, isLabModalOpen]);


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
            const payload = await prepareCloudPayload(exportData);
            await cloudService.save(token, payload);
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
                parsed = await parseCloudBackup(backup.data);
                timestamp = backup.created_at;
            } else {
                const list = await cloudService.load(token);
                if (!list || list.length === 0) {
                    showDialog('alert', t('account.no_cloud_backups'));
                    return;
                }
                const latest = list[0];
                parsed = await parseCloudBackup(latest.data);
                timestamp = latest.created_at;
            }
            if (!parsed) {
                showDialog('alert', t('account.cloud_load_failed'));
                return;
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
            const parsed = await parseCloudBackup(backup.data);
            if (!parsed) {
                showDialog('alert', t('account.merge_cloud_failed'));
                return;
            }
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
        <div className="h-[100dvh] w-full bg-[var(--color-m3-surface)] dark:bg-[var(--color-m3-dark-surface)] flex flex-col md:flex-row font-sans text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] select-none overflow-hidden">
            <Sidebar
                navItems={navItems}
                currentView={currentView}
                onViewChange={(v) => !needsSetup2FA && handleViewChange(v)}
            />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] relative">

                {/* Mobile site label — static, takes its own space above the content */}
                <div className="md:hidden shrink-0 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] pb-1 text-center text-[11px] font-medium tracking-wide text-muted select-none">
                    hrt.mahiro.uk
                </div>

                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`flex-1 flex flex-col overflow-y-auto scrollbar-hide scroll-pb-nav ${transitionDirection === 'backward' ? 'view-enter-backward' : 'view-enter-forward'}`}
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
                            onNavigateToHistory={() => handleViewChange('history')}
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
                            onAddEvents={addEvents}
                            onDeleteEvents={deleteEvents}
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
                            calibrationMethod={calibrationMethod}
                            calibration={calibration}
                            onOpenCalibrationSettings={() => handleViewChange('lab-calibration')}
                            currentTime={currentTime}
                            lang={lang}
                        />
                    )}

                    {currentView === 'lab-calibration' && (
                        <CalibrationSettings
                            method={calibrationMethod}
                            setMethod={setCalibrationMethod}
                            historyMode={calibrationHistoryMode}
                            setHistoryMode={setCalibrationHistoryMode}
                            calibration={calibration}
                            onBack={() => handleViewChange('lab')}
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
                            onNavigateToTransparency={() => handleViewChange('settings-transparency')}
                            appVersion={APP_VERSION}
                            weight={weight}
                            setIsWeightModalOpen={setIsWeightModalOpen}
                            pkParams={pkParams}
                            onNavigateToPKParams={() => handleViewChange('pk-params')}
                            onNavigateToHRTMode={() => handleViewChange('settings-hrt-mode')}
                            onNavigateToLanguage={() => handleViewChange('settings-language')}
                            onNavigateToAppearance={() => handleViewChange('settings-appearance')}
                            onNavigateToWeight={() => handleViewChange('settings-weight')}
                            onNavigateToExport={() => handleViewChange('settings-export')}
                            onNavigateToImport={() => handleViewChange('settings-import')}
                            autoBackup={autoBackup}
                            setAutoBackup={setAutoBackup}
                            isLoggedIn={!!user}
                        />
                    )}

                    {currentView === 'settings-hrt-mode' && (
                        <HRTModeSettings
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-language' && (
                        <LanguageSettings
                            lang={lang}
                            setLang={setLang}
                            languageOptions={languageOptions}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-appearance' && (
                        <AppearanceSettings
                            theme={theme}
                            setTheme={setTheme}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-weight' && (
                        <WeightSettings
                            weight={weight}
                            onSave={setWeight}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-export' && (
                        <ExportSettings
                            events={events}
                            labResults={labResults}
                            weight={weight}
                            onExport={handleExportConfirm}
                            onQuickExport={handleQuickExport}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-import' && (
                        <ImportSettings
                            onImportJson={importEventsFromJson}
                            onBack={() => handleViewChange('settings')}
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

                    {currentView === 'change-password' && (
                        <ChangePasswordPage
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'delete-account' && (
                        <DeleteAccountPage
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'edit-profile' && (
                        <EditProfilePage
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'edit-avatar' && user && token && (
                        <EditAvatarPage
                            username={user.username}
                            token={token}
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'settings-transparency' && (
                        <TransparencySettings
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'pk-params' && (
                        <PKParamsPage
                            pkParams={pkParams}
                            onSave={setPkParams}
                            onReset={clearPkParams}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'admin' && user?.isAdmin && (
                        <Admin t={t} />
                    )}
                </div>

                {/* Bottom Navigation — floating island */}
                <nav className="fixed left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 md:hidden rounded-2xl bg-[var(--color-m3-surface-bright)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] shadow-[var(--shadow-m3-3)]">
                    <div className="flex items-stretch p-1.5 gap-1">
                        {navItems.filter(item => item.id !== 'admin').map(({ id, icon: Icon, label }) => {
                            const activeTab = ({
                                'home': 'home',
                                'history': 'history',
                                'lab': 'lab',
                                'lab-calibration': 'lab',
                                'settings': 'settings',
                                'settings-hrt-mode': 'settings',
                                'settings-language': 'settings',
                                'settings-appearance': 'settings',
                                'settings-weight': 'settings',
                                'settings-export': 'settings',
                                'settings-import': 'settings',
                                'settings-transparency': 'settings',
                                'pk-params': 'settings',
                                'account': 'account',
                                'sessions': 'account',
                                'two-factor': 'account',
                                'admin': 'account',
                            } as Record<string, string>)[currentView] ?? currentView;
                            const isActive = activeTab === id;
                            const isDisabled = needsSetup2FA && id !== 'two-factor';
                            return (
                                <button
                                    key={id}
                                    onClick={() => !isDisabled && handleViewChange(id as ViewKey)}
                                    disabled={isDisabled}
                                    className={`flex-1 flex flex-col items-center justify-center gap-1 py-1.5 transition-colors duration-150 motion-reduce:transition-none
                                        ${isDisabled
                                            ? 'text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)] cursor-not-allowed'
                                            : isActive
                                            ? 'text-body'
                                            : 'text-muted'
                                        }`}
                                >
                                    <Icon size={20} strokeWidth={isActive ? 2 : 1.75} />
                                    <span className="text-[10px] font-medium">
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

            <BackupConflictModal
                isOpen={!!conflictState}
                onClose={() => setConflictState(null)}
                cloudNewCount={conflictState?.cloudNewCount ?? 0}
                localNewCount={conflictState?.localNewCount ?? 0}
                onMerge={() => {
                    if (conflictState?.cloudParsed) {
                        mergeImportedData(conflictState.cloudParsed);
                    }
                }}
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
