import { useState, useEffect, useMemo } from 'react';
import { useTranslation, LanguageProvider } from './contexts/LanguageContext';
import { useDialog, DialogProvider } from './contexts/DialogContext';
import { HRTModeProvider, useHRTMode } from './contexts/HRTModeContext';
import { PixelCatProvider } from './contexts/PixelCatContext';
import ErrorBoundary from './components/ErrorBoundary';
import { AppTheme } from './constants';
import { DoseEvent, decompressData, encryptData, decryptData } from '../logic';
import { v4 as uuidv4 } from 'uuid';
import { PlanItem, planEvent } from './utils/plan';
import Plan from './pages/Plan';
import { parseCloudBackup } from './utils/cloudBackup';
import { useAppData } from './hooks/useAppData';
import { useAppNavigation, ViewKey, tabForView } from './hooks/useAppNavigation';
import Forecast from './pages/Forecast';
import Supplies from './pages/Supplies';
import { useLiveShareSync } from './hooks/useLiveShareSync';
import { describeSyncError, useCloudSync } from './hooks/useCloudSync';

import WeightEditorModal from './components/WeightEditorModal';
import DoseFormModal from './components/DoseFormModal';
import ImportModal from './components/ImportModal';
import Sidebar from './components/Sidebar';
import { PageBackLabelContext } from './components/PageHeader';
import PasswordInputModal from './components/PasswordInputModal';
import DisclaimerModal from './components/DisclaimerModal';
import AuthModal from './components/AuthModal';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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
import MilkTeaEasterEgg from './pages/MilkTeaEasterEgg';
import CatStates from './pages/CatStates';
import PublicShare from './pages/PublicShare';
import ShareSettings from './pages/ShareSettings';
import Onboarding, { markOnboardingSeen, shouldShowOnboarding } from './pages/Onboarding';
import SiteNoticeBanner from './components/SiteNotice';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { mode } = useHRTMode();
    const { user, token, logout, needsSetup2FA, clearSetup2FA } = useAuth();
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);

    // Use Custom Hooks
    const {
        events,
        weight, setWeight,
        labResults,
        doseTemplates,
        simulation,
        calibrationFn,
        calibrationMethod, setCalibrationMethod,
        calibrationHistoryMode, setCalibrationHistoryMode,
        calibration,
        currentLevel,
        plan, savePlanItem, deletePlanItem,
        currentT,
        currentStatus,
        groupedEvents,
        addEvent, addEvents, updateEvent, deleteEvent, deleteEvents, clearAllEvents,
        addLabResult, updateLabResult, deleteLabResult, clearLabResults,
        addTemplate, deleteTemplate,
        addQuickDose, deleteQuickDose,
        quickDoses,
        pkParams, setPkParams, clearPkParams,
        processImportedData,
        mergeImportedData,
        buildExportPayload,
        applySyncedState,
        scope,
        readyScope,
        currentTime,
        regimens,
        supplies, saveSupply, deleteSupply,
    } = useAppData(showDialog);
    const nowH = currentTime.getTime() / 3600000;
    // How far ahead a supply counts as running low. A preference, so it stays on the device.
    const [supplyLeadDays, setSupplyLeadDaysState] = useState(() => Number(localStorage.getItem('hrt-supply-lead-days')) || 14);
    const setSupplyLeadDays = (d: number) => { setSupplyLeadDaysState(d); localStorage.setItem('hrt-supply-lead-days', String(d)); };

    useLiveShareSync({
        authToken: token,
        mode,
        events,
        simulation,
        calibrationFn,
    });

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
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [isQuickAddLabOpen, setIsQuickAddLabOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);

    // --- Auto-sync preference ---
    // Storage key kept from when this only ever uploaded, so an existing
    // preference carries over rather than silently resetting to on.
    const [autoSync, setAutoSync] = useState<boolean>(() =>
        localStorage.getItem('app-auto-backup') !== 'false'
    );

    // --- First run ---
    const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);

    // --- Developer mode (unlocks the milk tea easter egg) ---
    const [devMode, setDevMode] = useState<boolean>(() =>
        localStorage.getItem('app-dev-mode') === 'true'
    );
    useEffect(() => {
        localStorage.setItem('app-dev-mode', String(devMode));
    }, [devMode]);

    // --- Site label: the host name strip above the mobile view. Switched off
    // from Settings while developer mode is on, and kept off after that. ---
    const [hideSiteLabel, setHideSiteLabel] = useState<boolean>(() =>
        localStorage.getItem('app-hide-site-label') === 'true'
    );
    useEffect(() => {
        localStorage.setItem('app-hide-site-label', String(hideSiteLabel));
    }, [hideSiteLabel]);

    const [theme, setTheme] = useState<AppTheme>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as AppTheme) || 'system';
    });
    // Same reading as the Overview's: an explicit dark theme, or the system's under "system".
    const isDarkMode = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    useEffect(() => {
        localStorage.setItem('app-auto-backup', String(autoSync));
    }, [autoSync]);

    // Two-way sync with the cloud backup: pull, reconcile, push. Replaces both
    // the upload-only auto-backup and the startup "your data differs" prompt —
    // the prompt could only add records the cloud had and this device lacked, so
    // edits and deletions stayed unresolved and it reappeared every launch.
    const syncState = useCloudSync({
        token,
        userId: user?.id ?? null,
        enabled: autoSync,
        // Never touch the cloud while the data layer is mid-switch between
        // accounts or modes: the payload would mix one account's in-memory
        // records with another's storage keys.
        ready: readyScope === scope,
        buildPayload: buildExportPayload,
        applyRemote: applySyncedState,
        events,
        labResults,
        doseTemplates,
        weight,
        pkParams,
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
        const shouldLock = isPasswordInputOpen || isWeightModalOpen || isFormOpen || isImportModalOpen || isDisclaimerOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isPasswordInputOpen, isWeightModalOpen, isFormOpen, isImportModalOpen, isDisclaimerOpen]);


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

    const handleEditEvent = (e: DoseEvent) => { setEditingEvent(e); setIsFormOpen(true); };
    // One tap on the Overview logs a plan item's dose. Every dose logged this
    // way is kept, newest last, so the taps can be taken back one at a time:
    // three doses in a day are three taps and three undos.
    const [planLogs, setPlanLogs] = useState<{ itemId: string; eventId: string }[]>([]);
    const handleLogPlanItem = (item: PlanItem) => {
        const eventId = uuidv4();
        addEvent(planEvent(item, eventId, Date.now()));
        setPlanLogs(logs => [...logs, { itemId: item.id, eventId }]);
    };
    const handleUndoPlanLog = (itemId: string) => {
        const last = [...planLogs].reverse().find(l => l.itemId === itemId && events.some(e => e.id === l.eventId));
        if (!last) return;
        deleteEvent(last.eventId);
        setPlanLogs(logs => logs.filter(l => l !== last));
    };
    // Items with a tap still on record to take back. A dose deleted elsewhere is gone from here too.
    const undoableIds = planLogs.filter(l => events.some(e => e.id === l.eventId)).map(l => l.itemId);

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

    // Reconcile, then upload — not a plain upload. Every save inserts a new
    // newest revision with no "only if unchanged", so writing without reading
    // first would let one device's press erase a dose another device deleted.
    // Works with auto-sync switched off; refuses when the cloud copy is
    // encrypted and unreadable here, rather than replacing it with plaintext.
    const handleCloudSave = async () => {
        if (!token) { setIsAuthModalOpen(true); return; }
        const { outcome, errorCode } = await syncState.syncNow();
        // A locked cloud copy is not a failure to retry — it is a password this
        // device hasn't been given. Say so, rather than the flat "save failed"
        // that sent people pressing the button again to no effect. A failure
        // likewise names its cause: the worker's error code picks the line.
        if (outcome === 'error') {
            showDialog('alert', `${t('account.cloud_save_failed')} ${describeSyncError(errorCode, t)}`);
            return;
        }
        showDialog('alert', t(
            outcome === 'synced' ? 'account.cloud_save_success'
                : outcome === 'locked' ? 'account.cloud_save_locked'
                    : 'account.cloud_save_failed'));
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
                // Metadata first, then fetch only the newest body — the same
                // reason as the startup check: the plain list endpoint is
                // SELECT * and would ship every retained backup to read one.
                const metas = await cloudService.listMeta(token);
                if (!metas || metas.length === 0) {
                    showDialog('alert', t('account.no_cloud_backups'));
                    return;
                }
                const newest = metas.reduce((a, b) => (b.created_at > a.created_at ? b : a));
                const latest = await cloudService.loadOne(token, newest.id);
                parsed = await parseCloudBackup(latest.data);
                timestamp = latest.created_at;
            }
            if (!parsed) {
                showDialog('alert', t('account.cloud_load_failed'));
                return;
            }
            showDialog('confirm', (t('account.load_confirm') as string).replace('{time}', new Date(timestamp * 1000).toLocaleString()), () => {
                processImportedData(parsed);
            }, { danger: true });
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

    // Takes over the whole screen rather than sitting in the view stack: the
    // intro is where language and HRT mode get chosen, and leaving the nav up
    // would let someone tab away with both still on their defaults. Yields to a
    // forced 2FA setup, which is the one thing that can't wait behind a tour.
    if (showOnboarding && !needsSetup2FA) {
        return (
            <Onboarding
                languageOptions={languageOptions}
                weight={weight}
                onWeightChange={setWeight}
                plan={plan}
                onAddPlanItem={savePlanItem}
                onDeletePlanItem={deletePlanItem}
                onDone={() => { markOnboardingSeen(); setShowOnboarding(false); }}
            />
        );
    }

    // The page a back link returns to is the section the view sits in.
    const parentTab = tabForView(currentView);
    const backLabel = parentTab !== currentView ? navItems.find(item => item.id === parentTab)?.label ?? null : null;

    return (
        <div className="h-[100dvh] w-full bg-[var(--bg)] flex flex-col md:flex-row font-sans text-[var(--text)] select-none overflow-hidden">
            <Sidebar
                navItems={navItems}
                currentView={tabForView(currentView)}
                onViewChange={(v) => !needsSetup2FA && handleViewChange(v)}
            />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-[var(--bg)] relative">

                {/* Mobile site label — reflects the current deployment host. Hidden,
                    it still keeps its top padding, which is what holds the content
                    clear of a notch or status bar. */}
                <div className={`md:hidden shrink-0 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] ${hideSiteLabel ? '' : 'pb-1 text-center text-[0.6875rem] font-medium tracking-wide text-muted select-none'}`}>
                    {!hideSiteLabel && window.location.hostname}
                </div>

                {/* Operator banner. Outside the scroller and keyed off nothing in
                    this component, so it stays put across view changes. */}
                <SiteNoticeBanner />

                <PageBackLabelContext.Provider value={backLabel}>
                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`flex-1 flex flex-col overflow-y-auto scrollbar-hide scroll-pb-nav ${transitionDirection === 'backward' ? 'view-enter-backward' : 'view-enter-forward'}`}
                >
                    {currentView === 'home' && (
                        <Home
                            t={t}
                            currentLevel={currentLevel}
                            currentT={currentT}
                            currentStatus={currentStatus}
                            events={events}
                            simulation={simulation}
                            labResults={labResults}
                            onEditEvent={handleEditEvent}
                            calibrationFn={calibrationFn}
                            theme={theme}
                            onNavigateToHistory={() => handleViewChange('history')}
                            onNavigateToLab={() => handleViewChange('lab')}
                            onNavigateToShare={() => handleViewChange('share')}
                            authToken={token}
                            onAuthRequired={() => setIsAuthModalOpen(true)}
                            regimens={regimens}
                            plan={plan}
                            onLogPlanItem={handleLogPlanItem}
                            undoableIds={undoableIds}
                            onUndoPlanLog={handleUndoPlanLog}
                            onNavigateToPlan={() => handleViewChange('plan')}
                            supplies={supplies}
                            nowH={nowH}
                            onNavigateToForecast={() => handleViewChange('forecast')}
                            supplyLeadDays={supplyLeadDays}
                        />
                    )}

                    {currentView === 'plan' && (
                        <Plan
                            onBack={() => handleViewChange('home')}
                            plan={plan}
                            onSave={savePlanItem}
                            onDelete={deletePlanItem}
                        />
                    )}

                    {currentView === 'forecast' && (
                        <Forecast
                            onBack={() => handleViewChange('home')}
                            events={events}
                            weight={weight}
                            labResults={labResults}
                            calibration={calibration}
                            calibrationMethod={calibrationMethod}
                            calibrationHistoryMode={calibrationHistoryMode}
                            regimens={regimens}
                            nowH={nowH}
                            isDarkMode={isDarkMode}
                            onSaveTemplate={addTemplate}
                        />
                    )}

                    {currentView === 'share' && token && (
                        <ShareSettings
                            onBack={() => handleViewChange('home')}
                            authToken={token}
                            mode={mode}
                            events={events}
                            simulation={simulation}
                            calibrationFn={calibrationFn}
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
                            groupedEvents={groupedEvents}
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
                            onClearLabResults={clearLabResults}
                            calibrationMethod={calibrationMethod}
                            calibration={calibration}
                            onOpenCalibrationSettings={() => handleViewChange('lab-calibration')}
                            lang={lang}
                            events={events}
                            regimens={regimens}
                            weight={weight}
                            nowH={nowH}
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
                            onShowIntro={() => setShowOnboarding(true)}
                            onNavigateToTransparency={() => handleViewChange('settings-transparency')}
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
                            autoSync={autoSync}
                            setAutoSync={setAutoSync}
                            isLoggedIn={!!user}
                            devMode={devMode}
                            setDevMode={setDevMode}
                            hideSiteLabel={hideSiteLabel}
                            setHideSiteLabel={setHideSiteLabel}
                            onNavigateToMilkTea={() => handleViewChange('settings-milk-tea')}
                            onNavigateToCatStates={() => handleViewChange('settings-cat-states')}
                            isAdmin={!!user?.isAdmin}
                            onNavigateToAdmin={() => handleViewChange('admin')}
                            onNavigateToSupplies={() => handleViewChange('supplies')}
                            supplyCount={supplies.length}
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
                            onLogout={logout}
                            onCloudSave={handleCloudSave}
                            onCloudLoad={handleCloudLoad}
                            onCloudMerge={handleCloudMerge}
                            localData={{ events, labResults, doseTemplates, weight }}
                            onNavigate={(v) => handleViewChange(v as ViewKey)}
                            twoFAEnabled={twoFAEnabled}
                            onTwoFAStatusChange={setTwoFAEnabled}
                            syncStatus={syncState.status}
                            syncErrorCode={syncState.errorCode}
                            lastSyncedAt={syncState.lastSyncedAt}
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

                    {currentView === 'settings-milk-tea' && devMode && (
                        <MilkTeaEasterEgg
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-cat-states' && devMode && (
                        <CatStates onBack={() => handleViewChange('settings')} />
                    )}

                    {currentView === 'supplies' && (
                        <Supplies
                            onBack={() => handleViewChange('settings')}
                            supplies={supplies}
                            onSave={saveSupply}
                            onDelete={deleteSupply}
                            leadDays={supplyLeadDays}
                            onLeadDaysChange={setSupplyLeadDays}
                            events={events}
                            regimens={regimens}
                            nowH={nowH}
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
                        <Admin />
                    )}
                </div>
                </PageBackLabelContext.Provider>

                {/* Bottom Navigation — a frosted floating island. Content scrolls
                    visibly beneath it; the current tab's icon sits in a tonal
                    terracotta pill. */}
                <nav className="glass fixed left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 md:hidden rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-md)]">
                    <div className="flex items-stretch p-1.5 gap-0.5">
                        {navItems.filter(item => item.id !== 'admin').map(({ id, icon: Icon, label }) => {
                            // Mobile reaches admin from Settings → General, so the
                            // settings tab is the one that should read as active.
                            const activeTab = currentView === 'admin' ? 'settings' : tabForView(currentView);
                            const isActive = activeTab === id;
                            const isDisabled = needsSetup2FA && id !== 'two-factor';
                            return (
                                <button
                                    key={id}
                                    onClick={() => !isDisabled && handleViewChange(id as ViewKey)}
                                    disabled={isDisabled}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 transition-colors duration-150 motion-reduce:transition-none
                                        ${isDisabled
                                            ? 'text-[var(--text-disabled)] cursor-not-allowed'
                                            : isActive
                                            ? 'text-[var(--text)]'
                                            : 'text-[var(--text-muted)]'
                                        }`}
                                >
                                    <span className={`grid h-[30px] w-[52px] place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${isActive && !isDisabled ? 'bg-[var(--accent-subtle)] text-[var(--accent-ink)]' : ''}`}>
                                        <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
                                    </span>
                                    <span className="text-[0.6875rem] leading-[0.875rem] font-medium tracking-[0.01em]">
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>

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
                events={events}
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

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
            />

        </div >
    );
};

const getShareRoute = (): { isShareRoute: boolean; token: string | null } => {
    if (!/^\/share\/?$/.test(window.location.pathname)) {
        return { isShareRoute: false, token: null };
    }

    const fragmentToken = window.location.hash
        .slice(1)
        .replace(/^\/+/, '')
        .split(/[/?]/, 1)[0];

    return { isShareRoute: true, token: fragmentToken || null };
};

const App = () => {
    const [shareRoute, setShareRoute] = useState(getShareRoute);
    useEffect(() => {
        const updateRoute = () => setShareRoute(getShareRoute());
        window.addEventListener('hashchange', updateRoute);
        window.addEventListener('popstate', updateRoute);
        return () => {
            window.removeEventListener('hashchange', updateRoute);
            window.removeEventListener('popstate', updateRoute);
        };
    }, []);
    return (
        <LanguageProvider>
            <HRTModeProvider>
                {shareRoute.isShareRoute ? (
                    <ErrorBoundary>
                        <PublicShare token={shareRoute.token} />
                    </ErrorBoundary>
                ) : (
                    <DialogProvider>
                        <AuthProvider>
                            <PixelCatProvider>
                                <ErrorBoundary>
                                    <AppContent />
                                </ErrorBoundary>
                            </PixelCatProvider>
                        </AuthProvider>
                    </DialogProvider>
                )}
            </HRTModeProvider>
        </LanguageProvider>
    );
};

export default App;
