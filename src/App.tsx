import { useState, useEffect, useMemo, useRef } from 'react';
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
import {
    COMPLETE_BACKUP_FORMAT,
    classifyCompleteBackupOutcome,
    completeBackupPreviewFingerprint,
    type CompleteBackupMergeResult,
    type CompleteBackupPreview,
    type PortablePreferences,
} from './utils/backupBundle';
import {
    describeCompleteBackupExportWarning,
    describeCompleteBackupFailure,
    describeCompleteBackupPreview,
    describeCompleteBackupReplace,
    describeCompleteBackupReplaceFailure,
    describeCompleteBackupResult,
    describeUnreadableCompleteBackup,
    isPartialReplaceFailure,
} from './utils/backupWarnings';
import { useAppData } from './hooks/useAppData';
import { useAppNavigation, tabForView, ViewKey } from './hooks/useAppNavigation';
import Forecast from './pages/Forecast';
import Supplies from './pages/Supplies';
import { useLiveShareSync } from './hooks/useLiveShareSync';
import { describeSyncError, useCloudSync } from './hooks/useCloudSync';

import DoseFormModal from './components/DoseFormModal';
import Sidebar from './components/Sidebar';
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
import WeightSettings from './pages/WeightSettings';
import AgeSettings from './pages/AgeSettings';
import ExportSettings from './pages/ExportSettings';
import ImportSettings from './pages/ImportSettings';
import TransparencySettings from './pages/TransparencySettings';
import Credits from './pages/Credits';
import MilkTeaEasterEgg from './pages/MilkTeaEasterEgg';
import CatStates from './pages/CatStates';
import PublicShare from './pages/PublicShare';
import { parseShareFragment } from './services/shareCrypto';
import ShareSettings from './pages/ShareSettings';
import Onboarding, { markOnboardingSeen, shouldShowOnboarding } from './pages/Onboarding';
import SiteNoticeBanner from './components/SiteNotice';
import UpdatePrompt from './components/UpdatePrompt';
import { copyText } from './utils/clipboard';

const AppContent = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { mode } = useHRTMode();
    const { user, token, logout } = useAuth();
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);

    // --- Prediction curve: the Overview chart carried on past "now", dashed,
    // on the plan's doses. Off unless switched on in Settings; a display
    // preference, so it stays on the device. ---
    const [showPrediction, setShowPrediction] = useState<boolean>(
        () => localStorage.getItem('app-show-prediction') === 'true',
    );
    useEffect(() => {
        localStorage.setItem('app-show-prediction', String(showPrediction));
    }, [showPrediction]);

    // --- Age adjustment (beta): lets the year of birth adjust clearance.
    // Off unless switched on in Settings, and kept on this device. ---
    const [ageBeta, setAgeBeta] = useState<boolean>(() => localStorage.getItem('app-age-beta') === 'true');
    useEffect(() => {
        localStorage.setItem('app-age-beta', String(ageBeta));
    }, [ageBeta]);

    // Use Custom Hooks
    const {
        events,
        weight,
        setWeight,
        birthYear,
        setBirthYear,
        modelBirthYear,
        labResults,
        doseTemplates,
        simulation,
        calibrationFn,
        calibrationMethod,
        setCalibrationMethod,
        calibrationHistoryMode,
        setCalibrationHistoryMode,
        calibration,
        currentLevel,
        currentCPA,
        plan,
        savePlanItem,
        deletePlanItem,
        currentT,
        currentStatus,
        simulationAhead,
        groupedEvents,
        addEvent,
        addEvents,
        updateEvent,
        deleteEvent,
        deleteEvents,
        clearAllEvents,
        addLabResult,
        updateLabResult,
        deleteLabResult,
        clearLabResults,
        addTemplate,
        deleteTemplate,
        addQuickDose,
        deleteQuickDose,
        quickDoses,
        pkParams,
        setPkParams,
        clearPkParams,
        processImportedData,
        mergeImportedData,
        buildExportPayload,
        buildCompleteBackupBundle,
        previewCompleteBackupBundle,
        applyCompleteBackupBundle,
        replaceCompleteBackupBundle,
        applySyncedState,
        scope,
        readyScope,
        currentTime,
        regimens,
        supplies,
        saveSupply,
        deleteSupply,
    } = useAppData(showDialog, { withPrediction: showPrediction, withAge: ageBeta });
    const nowH = currentTime.getTime() / 3600000;
    // How far ahead a supply counts as running low. A preference, so it stays on the device.
    const [supplyLeadDays, setSupplyLeadDaysState] = useState(
        () => Number(localStorage.getItem('hrt-supply-lead-days')) || 14,
    );
    const setSupplyLeadDays = (d: number) => {
        setSupplyLeadDaysState(d);
        localStorage.setItem('hrt-supply-lead-days', String(d));
    };

    useLiveShareSync({
        authToken: token,
        mode,
        events,
        simulation,
        calibrationFn,
    });

    const { currentView, currentTab, transitionDirection, handleViewChange, handleTabSelect, mainScrollRef, navItems } =
        useAppNavigation(user);

    // --- Local UI State (Modals & Forms) ---
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<DoseEvent | null>(null);
    const [isPasswordInputOpen, setIsPasswordInputOpen] = useState(false);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [isQuickAddLabOpen, setIsQuickAddLabOpen] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    // Set when Share opened the sign-in modal: the modal then says why it is
    // asking, and a successful sign-in carries on to Share instead of leaving
    // the person to find the button they had already pressed.
    const [authForShare, setAuthForShare] = useState(false);
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [pendingImportText, setPendingImportText] = useState<string | null>(null);

    // --- Auto-sync preference ---
    // Storage key kept from when this only ever uploaded, so an existing
    // preference carries over rather than silently resetting to on.
    const [autoSync, setAutoSync] = useState<boolean>(() => localStorage.getItem('app-auto-backup') !== 'false');

    // --- First run ---
    const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);

    // --- Developer mode (unlocks the milk tea easter egg) ---
    const [devMode, setDevMode] = useState<boolean>(() => localStorage.getItem('app-dev-mode') === 'true');
    useEffect(() => {
        localStorage.setItem('app-dev-mode', String(devMode));
    }, [devMode]);

    // A page whose guard below has gone false (signed out, developer mode
    // off) renders nothing, leaving a blank screen. The browser's Forward can
    // land on one after a sign-out, and an expired sign-in can leave one open,
    // so step up to the page it belongs to.
    const pageGone =
        (!token &&
            (currentView === 'share' ||
                currentView === 'sessions' ||
                currentView === 'two-factor' ||
                currentView === 'edit-avatar')) ||
        (!devMode && (currentView === 'settings-milk-tea' || currentView === 'settings-cat-states')) ||
        (!ageBeta && currentView === 'settings-age');
    useEffect(() => {
        if (pageGone) handleViewChange(tabForView(currentView));
    }, [pageGone, currentView, handleViewChange]);

    // --- Site label: the host name strip above the mobile view. Switched off
    // from Settings while developer mode is on, and kept off after that. ---
    const [hideSiteLabel, setHideSiteLabel] = useState<boolean>(
        () => localStorage.getItem('app-hide-site-label') === 'true',
    );
    useEffect(() => {
        localStorage.setItem('app-hide-site-label', String(hideSiteLabel));
    }, [hideSiteLabel]);

    const [theme, setTheme] = useState<AppTheme>(() => {
        const saved = localStorage.getItem('app-theme');
        return (saved as AppTheme) || 'system';
    });

    // Imported complete bundles carry only the confirmed preference keys. The
    // data layer returns them; the app owns the React state and storage effects.
    const applyPortablePreferences = (prefs: PortablePreferences) => {
        if (prefs['app-theme'] !== undefined) setTheme(prefs['app-theme']);
        if (prefs['hrt-lang'] !== undefined) setLang(prefs['hrt-lang']);
        if (prefs['app-show-prediction'] !== undefined) setShowPrediction(prefs['app-show-prediction']);
        if (prefs['app-hide-site-label'] !== undefined) setHideSiteLabel(prefs['app-hide-site-label']);
        if (prefs['hrt-supply-lead-days'] !== undefined) setSupplyLeadDays(prefs['hrt-supply-lead-days']);
    };

    // Dialogs stay open across renders, so their callbacks must not keep the
    // arrays/functions captured when the dialog opened. Every confirm path
    // re-previews and applies through this latest snapshot instead.
    const completeBackupRef = useRef({
        preview: previewCompleteBackupBundle,
        apply: applyCompleteBackupBundle,
        replace: replaceCompleteBackupBundle,
        build: buildCompleteBackupBundle,
    });
    useEffect(() => {
        completeBackupRef.current = {
            preview: previewCompleteBackupBundle,
            apply: applyCompleteBackupBundle,
            replace: replaceCompleteBackupBundle,
            build: buildCompleteBackupBundle,
        };
    });
    // Same reading as the Overview's: an explicit dark theme, or the system's under "system".
    const isDarkMode =
        theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

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
        birthYear,
        pkParams,
    });

    // --- Theme Effect ---
    useEffect(() => {
        localStorage.setItem('app-theme', theme);
        const root = window.document.documentElement;

        const applyTheme = (isDark: boolean) => {
            root.classList.remove('light', 'dark');
            root.classList.add(isDark ? 'dark' : 'light');
            // The browser's own bar takes this colour: Android's status bar
            // and toolbar, an installed app's title bar. index.html's white is
            // right until the theme is applied (and for the shared view,
            // which applies none), but it stayed white over a dark page.
            // --bg of each theme, as hex because not every browser reads
            // oklch() in this tag.
            document
                .querySelectorAll('meta[name="theme-color"]')
                .forEach(meta => meta.setAttribute('content', isDark ? '#181714' : '#ffffff'));
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

    const languageOptions = useMemo(
        () => [
            { value: 'zh', label: '简体中文' },
            { value: 'zh-TW', label: '正體中文' },
            { value: 'yue', label: '廣東話' },
            { value: 'en', label: 'English' },
            { value: 'ja', label: '日本語' },
            { value: 'ko', label: '한국어' },
            { value: 'tr', label: 'Türkçe' },
        ],
        [],
    );

    // --- Modal Logic Wrappers ---

    useEffect(() => {
        const shouldLock = isPasswordInputOpen || isFormOpen || isDisclaimerOpen;
        document.body.style.overflow = shouldLock ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [isPasswordInputOpen, isFormOpen, isDisclaimerOpen]);

    // An import replaces the records on this device (and, with sync on, on
    // every device), so it asks first whenever there is something to lose, in
    // either HRT mode: a backup carries both. Restoring a backup onto an empty
    // device stays a single step, and a file with nothing usable in it is
    // reported as such before anything is asked. Resolves to whether the
    // import went through, so the paste box keeps its text after a Cancel.
    const confirmImport = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            if (!processImportedData(parsed, { check: true })) {
                showDialog('alert', t('drawer.import_error'));
                resolve(false);
                return;
            }
            const run = () => resolve(processImportedData(parsed));
            const { modes } = buildExportPayload();
            if (Object.values(modes).every(m => !m.events.length && !m.labResults.length && !m.doseTemplates.length)) {
                run();
                return;
            }
            showDialog('confirm', t('import.replace_confirm'), run, {
                danger: true,
                title: t('import.replace_title'),
                confirmLabel: t('import.replace_btn'),
                onCancel: () => resolve(false),
            });
        });

    /**
     * Complete bundles are unencrypted JSON and merge only. Replace-all remains
     * BLOCKED: there is no proven multi-key transaction, so this path never
     * clears local categories.
     */
    const confirmCompleteBackupImport = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            // The validator's messages name fields and record ids. They are for
            // whoever looks into the file, so they go to the console and the
            // person is told only that the file can't be read, or is too new.
            const rejectUnreadable = (unreadable: CompleteBackupPreview) => {
                console.warn('Complete backup not imported:', unreadable.errors);
                showDialog('alert', describeUnreadableCompleteBackup(unreadable, t));
                resolve(false);
            };

            const preview = completeBackupRef.current.preview(parsed);
            if (!preview.ok) {
                rejectUnreadable(preview);
                return;
            }
            if (preview.issues.length || preview.conflicts.length) {
                console.warn('Complete backup preview:', { issues: preview.issues, conflicts: preview.conflicts });
            }

            const run = () => {
                let result: CompleteBackupMergeResult;
                try {
                    result = completeBackupRef.current.apply(parsed);
                } catch (err) {
                    console.error(err);
                    showDialog('alert', describeCompleteBackupFailure(err, t));
                    resolve(false);
                    return;
                }
                const outcome = classifyCompleteBackupOutcome(result);
                applyPortablePreferences(result.preferences);
                showDialog('alert', describeCompleteBackupResult(result, outcome, t));
                resolve(outcome !== 'nothing');
            };

            const openPreview = (current: CompleteBackupPreview) => {
                showDialog(
                    'confirm',
                    describeCompleteBackupPreview(current, { t, lang, user }),
                    () => {
                        // The active arrays can change while a dialog is open.
                        // Recompute at confirm time; if the visible outcome
                        // changed, show it again instead of applying stale consent.
                        const latest = completeBackupRef.current.preview(parsed);
                        if (!latest.ok) {
                            rejectUnreadable(latest);
                            return;
                        }
                        if (completeBackupPreviewFingerprint(latest) !== completeBackupPreviewFingerprint(current)) {
                            openPreview(latest);
                            return;
                        }
                        if (latest.scalars.calibration?.action !== 'overwrite') {
                            run();
                            return;
                        }
                        // Calibration changes how PK estimates are interpreted.
                        // It gets its own explicit confirmation instead of
                        // riding on the merge. Apply re-previews again, so a
                        // change during this dialog cannot bypass the latest
                        // conflict/block decisions.
                        showDialog(
                            'confirm',
                            t('import.bundle_calibration_confirm'),
                            () => {
                                const finalPreview = completeBackupRef.current.preview(parsed);
                                if (!finalPreview.ok) {
                                    rejectUnreadable(finalPreview);
                                    return;
                                }
                                run();
                            },
                            {
                                danger: true,
                                title: t('import.bundle_calibration_confirm_title'),
                                confirmLabel: t('import.bundle_calibration_confirm_btn'),
                                onCancel: () => resolve(false),
                            },
                        );
                    },
                    {
                        // A merge that only adds records is not a red-button
                        // action; one that deletes local records is.
                        danger: current.stats.removed > 0,
                        title: t('import.bundle_preview_title'),
                        confirmLabel: t('import.bundle_merge_btn'),
                        onCancel: () => resolve(false),
                    },
                );
            };

            openPreview(preview);
        });

    /**
     * Replace, unlike merge, may not silently drop or block a category: the
     * file has to describe the whole store. Scalars the format may omit
     * (weight, PK parameters) and preferences are optional.
     */
    const confirmCompleteBackupReplace = (parsed: unknown): Promise<boolean> =>
        new Promise(resolve => {
            const optionalMissing = new Set(['weight', 'pkParams', 'preferences']);
            const requiredMissing = (preview: CompleteBackupPreview) =>
                preview.missing.filter(path => !optionalMissing.has(path));
            const reject = (preview: CompleteBackupPreview) => {
                console.warn('Complete backup cannot replace this device:', {
                    errors: preview.errors,
                    issues: preview.issues,
                    missing: requiredMissing(preview),
                });
                showDialog('alert', t('import.bundle_invalid'));
                resolve(false);
            };

            const preview = completeBackupRef.current.preview(parsed);
            if (!preview.ok || preview.issues.length > 0 || requiredMissing(preview).length > 0) {
                reject(preview);
                return;
            }

            const run = () => {
                try {
                    const result = completeBackupRef.current.replace(parsed);
                    applyPortablePreferences(result.preferences);
                    showDialog('alert', t('import.replace_complete_success'));
                    resolve(true);
                } catch (err) {
                    console.error(err);
                    // A partial write leaves its journal behind, and the store
                    // half replaced. Reloading runs the recovery before
                    // anything reads or syncs it, instead of asking the person
                    // to know to reload.
                    showDialog(
                        'alert',
                        describeCompleteBackupReplaceFailure(err, t),
                        isPartialReplaceFailure(err) ? () => window.location.reload() : undefined,
                    );
                    resolve(false);
                }
            };

            const open = (current: CompleteBackupPreview, fingerprint: string) => {
                showDialog(
                    'confirm',
                    describeCompleteBackupReplace(current, { t, lang, user }),
                    () => {
                        // The active arrays can change while the dialog is open.
                        // Replacing them without showing the new contents would
                        // be consent to a different operation.
                        const latest = completeBackupRef.current.preview(parsed);
                        if (!latest.ok || latest.issues.length > 0 || requiredMissing(latest).length > 0) {
                            reject(latest);
                            return;
                        }
                        const latestFingerprint = completeBackupPreviewFingerprint(latest);
                        if (latestFingerprint !== fingerprint) {
                            open(latest, latestFingerprint);
                            return;
                        }
                        run();
                    },
                    {
                        danger: true,
                        title: t('import.replace_complete_title'),
                        confirmLabel: t('import.replace_complete_btn'),
                        onCancel: () => resolve(false),
                    },
                );
            };

            open(preview, completeBackupPreviewFingerprint(preview));
        });

    const replaceCompleteBackupFromJson = async (text: string): Promise<boolean> => {
        try {
            let parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && parsed.c && typeof parsed.c === 'string') {
                parsed = JSON.parse(await decompressData(parsed.c));
            }
            if (!parsed || typeof parsed !== 'object' || parsed.format !== COMPLETE_BACKUP_FORMAT) {
                showDialog('alert', t('import.bundle_invalid'));
                return false;
            }
            return await confirmCompleteBackupReplace(parsed);
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

            if (parsed && typeof parsed === 'object' && parsed.format === COMPLETE_BACKUP_FORMAT) {
                return await confirmCompleteBackupImport(parsed);
            }

            return await confirmImport(parsed);
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
                setIsPasswordInputOpen(false);
                setPendingImportText(null);
                if (parsed && typeof parsed === 'object' && parsed.format === COMPLETE_BACKUP_FORMAT) {
                    await confirmCompleteBackupImport(parsed);
                    return;
                }
                confirmImport(parsed);
            } catch (e) {
                console.error(e);
                showDialog('alert', t('import.decrypt_error'));
            }
        } else {
            showDialog('alert', t('import.decrypt_error'));
        }
    };

    const handleEditEvent = (e: DoseEvent) => {
        setEditingEvent(e);
        setIsFormOpen(true);
    };
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

    // Says whether the copy landed, and nothing more: Export shows the result
    // in place on its Copy row, so a success alert on top only cost a tap,
    // and a failed write used to be swallowed while the row still said "copied".
    const handleQuickExport = async (): Promise<boolean> => {
        if (events.length === 0 && labResults.length === 0) {
            showDialog('alert', t('drawer.empty_export'));
            return false;
        }
        const exportData = buildExportPayload();
        const json = JSON.stringify(exportData, null, 2);
        try {
            await copyText(json);
            return true;
        } catch (err) {
            console.error('Failed to copy: ', err);
            return false;
        }
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

    /**
     * The complete bundle is deliberately plaintext JSON. OpenPGP encryption is
     * the offline Tools project's job; this website never handles keys or
     * passphrases and does not claim a cold-backup encryption format. The
     * download stays behind an explicit plaintext-health-data confirmation.
     */
    const handleCompleteBackupExport = () => {
        const warning = describeCompleteBackupExportWarning(t);
        showDialog(
            'confirm',
            warning.message,
            () => {
                try {
                    // Build at confirm time, not when the dialog opened: the
                    // arrays may have changed while the warning was on screen.
                    const report = completeBackupRef.current.build();
                    downloadFile(
                        JSON.stringify(report.bundle, null, 2),
                        `hrt-complete-backup-${new Date().toISOString().split('T')[0]}.json`,
                    );
                    // Collapsed duplicates and expired deletion marks are
                    // housekeeping; only records left out are worth a word.
                    if (report.issues.length) console.warn('Complete backup export:', report.issues);
                    if (report.invalidRecords > 0) {
                        showDialog('alert', t('export.complete_skipped').replace('{n}', String(report.invalidRecords)));
                    }
                } catch (err) {
                    console.error(err);
                    showDialog('alert', t('export.complete_failed'));
                }
            },
            {
                danger: true,
                title: warning.title,
                confirmLabel: warning.confirmLabel,
            },
        );
    };

    // Reconcile, then upload — not a plain upload. Every save inserts a new
    // newest revision with no "only if unchanged", so writing without reading
    // first would let one device's press erase a dose another device deleted.
    // Works with auto-sync switched off; refuses when the cloud copy is
    // encrypted and unreadable here, rather than replacing it with plaintext.
    const handleCloudSave = async () => {
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }
        const { outcome, errorCode } = await syncState.syncNow();
        // A locked cloud copy is not a failure to retry — it is a password this
        // device hasn't been given. Say so, rather than the flat "save failed"
        // that sent people pressing the button again to no effect. A failure
        // likewise names its cause: the worker's error code picks the line.
        if (outcome === 'error') {
            showDialog('alert', `${t('account.cloud_save_failed')} ${describeSyncError(errorCode, t)}`);
            return;
        }
        showDialog(
            'alert',
            t(
                outcome === 'synced'
                    ? 'account.cloud_save_success'
                    : outcome === 'locked'
                      ? 'account.cloud_save_locked'
                      : 'account.cloud_save_failed',
            ),
        );
    };

    const handleCloudLoad = async (backupId?: string) => {
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }
        try {
            let parsed: unknown;
            let timestamp: number;
            if (backupId) {
                const backup = await cloudService.loadOne(token, backupId);
                parsed = await parseCloudBackup(backup.data);
                timestamp = backup.created_at;
            } else {
                // Metadata first, then fetch only the newest body.
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
            showDialog(
                'confirm',
                (t('account.load_confirm') as string).replace('{time}', new Date(timestamp * 1000).toLocaleString()),
                () => {
                    processImportedData(parsed);
                },
                { danger: true },
            );
        } catch (e) {
            showDialog('alert', t('account.cloud_load_failed'));
        }
    };

    const handleCloudMerge = async (backupId: string) => {
        if (!token) {
            setIsAuthModalOpen(true);
            return;
        }
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

    // Takes over the whole screen rather than sitting in the view stack: the
    // intro is where language and HRT mode get chosen, and leaving the nav up
    // would let someone tab away with both still on their defaults.
    if (showOnboarding) {
        return (
            <Onboarding
                languageOptions={languageOptions}
                weight={weight}
                onWeightChange={setWeight}
                plan={plan}
                onAddPlanItem={savePlanItem}
                onDeletePlanItem={deletePlanItem}
                onDone={() => {
                    markOnboardingSeen();
                    setShowOnboarding(false);
                }}
            />
        );
    }

    return (
        <div className="h-[100dvh] w-full bg-[var(--bg)] flex flex-col md:flex-row font-sans text-[var(--text)] select-none overflow-hidden">
            <Sidebar navItems={navItems} currentView={currentTab} onViewChange={handleTabSelect} />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-[var(--bg)] relative">
                {/* Mobile site label — reflects the current deployment host. Hidden,
                    it still keeps its top padding, which is what holds the content
                    clear of a notch or status bar. */}
                <div
                    className={`md:hidden shrink-0 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] ${hideSiteLabel ? '' : 'pb-1 text-center text-[0.6875rem] font-medium tracking-wide text-muted select-none'}`}
                >
                    {!hideSiteLabel && window.location.hostname}
                </div>

                {/* Operator banner. Outside the scroller and keyed off nothing in
                    this component, so it stays put across view changes. */}
                <SiteNoticeBanner />
                <UpdatePrompt />

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
                            simulation={simulation}
                            simulationAhead={simulationAhead}
                            showPrediction={showPrediction}
                            labResults={labResults}
                            onEditEvent={handleEditEvent}
                            calibrationFn={calibrationFn}
                            theme={theme}
                            onNavigateToHistory={() => {
                                setIsQuickAddOpen(true);
                                handleViewChange('history');
                            }}
                            onNavigateToLab={() => {
                                setIsQuickAddLabOpen(true);
                                handleViewChange('lab');
                            }}
                            onNavigateToShare={() => handleViewChange('share')}
                            authToken={token}
                            onAuthRequired={() => {
                                setAuthForShare(true);
                                setIsAuthModalOpen(true);
                            }}
                            regimens={regimens}
                            plan={plan}
                            onLogPlanItem={handleLogPlanItem}
                            undoableIds={undoableIds}
                            onUndoPlanLog={handleUndoPlanLog}
                            onNavigateToPlan={() => handleViewChange('plan')}
                            onNavigateToSupplies={() => handleViewChange('supplies')}
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
                            birthYear={modelBirthYear}
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
                            events={events}
                            quickDoses={quickDoses}
                            onAddQuickDose={addQuickDose}
                            onDeleteQuickDose={deleteQuickDose}
                        />
                    )}

                    {currentView === 'lab' && (
                        <Lab
                            t={t}
                            isQuickAddLabOpen={isQuickAddLabOpen}
                            setIsQuickAddLabOpen={setIsQuickAddLabOpen}
                            labResults={labResults}
                            events={events}
                            simulation={simulation}
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
                            onClearAllEvents={clearAllEvents}
                            events={events}
                            showDialog={showDialog}
                            setIsDisclaimerOpen={setIsDisclaimerOpen}
                            onShowIntro={() => setShowOnboarding(true)}
                            onNavigateToTransparency={() => handleViewChange('settings-transparency')}
                            onNavigateToCredits={() => handleViewChange('settings-credits')}
                            weight={weight}
                            birthYear={birthYear}
                            ageBeta={ageBeta}
                            setAgeBeta={setAgeBeta}
                            pkParams={pkParams}
                            onNavigateToPKParams={() => handleViewChange('pk-params')}
                            onNavigateToHRTMode={() => handleViewChange('settings-hrt-mode')}
                            onNavigateToWeight={() => handleViewChange('settings-weight')}
                            onNavigateToAge={() => handleViewChange('settings-age')}
                            onNavigateToExport={() => handleViewChange('settings-export')}
                            onNavigateToImport={() => handleViewChange('settings-import')}
                            autoSync={autoSync}
                            setAutoSync={setAutoSync}
                            isLoggedIn={!!user}
                            devMode={devMode}
                            setDevMode={setDevMode}
                            hideSiteLabel={hideSiteLabel}
                            setHideSiteLabel={setHideSiteLabel}
                            showPrediction={showPrediction}
                            setShowPrediction={setShowPrediction}
                            onNavigateToMilkTea={() => handleViewChange('settings-milk-tea')}
                            onNavigateToCatStates={() => handleViewChange('settings-cat-states')}
                            isAdmin={!!user?.isAdmin}
                            onNavigateToAdmin={() => handleViewChange('admin')}
                            onNavigateToSupplies={() => handleViewChange('supplies')}
                            supplyCount={supplies.length}
                        />
                    )}

                    {currentView === 'settings-hrt-mode' && (
                        <HRTModeSettings onBack={() => handleViewChange('settings')} />
                    )}

                    {currentView === 'settings-weight' && (
                        <WeightSettings
                            weight={weight}
                            onSave={setWeight}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-age' && ageBeta && (
                        <AgeSettings
                            birthYear={birthYear}
                            onSave={setBirthYear}
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
                            onExportCompleteBackup={handleCompleteBackupExport}
                            onBack={() => handleViewChange('settings')}
                        />
                    )}

                    {currentView === 'settings-import' && (
                        <ImportSettings
                            onImportJson={importEventsFromJson}
                            onReplaceJson={replaceCompleteBackupFromJson}
                            onBack={() => handleViewChange('settings')}
                            onNavigateToExport={() => handleViewChange('settings-export')}
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
                            onNavigate={v => handleViewChange(v as ViewKey)}
                            twoFAEnabled={twoFAEnabled}
                            onTwoFAStatusChange={setTwoFAEnabled}
                            syncStatus={syncState.status}
                            syncErrorCode={syncState.errorCode}
                            lastSyncedAt={syncState.lastSyncedAt}
                        />
                    )}

                    {currentView === 'sessions' && token && (
                        <SessionsPage token={token} onBack={() => handleViewChange('account')} />
                    )}

                    {currentView === 'two-factor' && token && (
                        <TwoFactorPage
                            token={token}
                            enabled={twoFAEnabled}
                            onStatusChange={setTwoFAEnabled}
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'change-password' && (
                        <ChangePasswordPage onBack={() => handleViewChange('account')} />
                    )}

                    {currentView === 'delete-account' && (
                        <DeleteAccountPage onBack={() => handleViewChange('account')} />
                    )}

                    {currentView === 'edit-profile' && <EditProfilePage onBack={() => handleViewChange('account')} />}

                    {currentView === 'edit-avatar' && user && token && (
                        <EditAvatarPage
                            username={user.username}
                            token={token}
                            onBack={() => handleViewChange('account')}
                        />
                    )}

                    {currentView === 'settings-transparency' && (
                        <TransparencySettings onBack={() => handleViewChange('settings')} />
                    )}

                    {currentView === 'settings-credits' && <Credits onBack={() => handleViewChange('settings')} />}

                    {currentView === 'settings-milk-tea' && devMode && (
                        <MilkTeaEasterEgg onBack={() => handleViewChange('settings')} />
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

                    {currentView === 'admin' && user?.isAdmin && <Admin />}
                </div>

                {/* Bottom Navigation — a frosted floating island. Content scrolls
                    visibly beneath it; the current tab's icon sits in a tonal
                    terracotta pill. Labels stay on one line: a wrapped one
                    raised its icon above the rest and grew the island past
                    the scroller's bottom padding. Below 340px they drop to
                    10px rather than being cut off, and the packs keep them
                    short enough for that. The longest, Turkish Genel Bakış,
                    is the name that pack's other strings give the page, so
                    it stays, and its tab takes a few pixels more than the
                    rest. Each tab is rounded so the focus ring nests in
                    the island instead of cutting a square into the next
                    tab's pill. */}
                <nav className="glass fixed left-4 right-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-40 md:hidden rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-md)]">
                    <div className="flex items-stretch p-1.5 gap-0.5">
                        {navItems
                            .filter(item => item.id !== 'admin')
                            .map(({ id, icon: Icon, label }) => {
                                // Mobile reaches admin from Settings → General, so the
                                // settings tab is the one that should read as active.
                                const activeTab = currentView === 'admin' ? 'settings' : currentTab;
                                const isActive = activeTab === id;
                                return (
                                    <button
                                        key={id}
                                        onClick={() => handleTabSelect(id as ViewKey)}
                                        aria-current={isActive ? 'page' : undefined}
                                        className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1 rounded-[var(--radius-lg)] transition-colors duration-150 motion-reduce:transition-none
                                        ${isActive ? 'text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
                                    >
                                        <span
                                            className={`grid h-[30px] w-[52px] place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none ${isActive ? 'bg-[var(--accent-subtle)] text-[var(--accent-ink)]' : ''}`}
                                        >
                                            <Icon size={22} strokeWidth={isActive ? 2 : 1.75} />
                                        </span>
                                        <span className="whitespace-nowrap text-[0.6875rem] leading-[0.875rem] font-medium tracking-[0.01em] max-[340px]:text-[0.625rem]">
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

            <DisclaimerModal isOpen={isDisclaimerOpen} onClose={() => setIsDisclaimerOpen(false)} />

            <AuthModal
                isOpen={isAuthModalOpen}
                onClose={() => {
                    setIsAuthModalOpen(false);
                    setAuthForShare(false);
                }}
                reason={authForShare ? 'share' : undefined}
                onSuccess={() => {
                    if (authForShare) handleViewChange('share');
                }}
            />
        </div>
    );
};

const getShareRoute = (): { isShareRoute: boolean; token: string | null; shareKey: string | null } => {
    if (!/^\/share\/?$/.test(window.location.pathname)) {
        return { isShareRoute: false, token: null, shareKey: null };
    }

    // `#<token>.<key>`: the token finds the link on the server, the key
    // decrypts it and never leaves this page. Links made before share
    // encryption have a token only.
    const fragment = window.location.hash.slice(1).replace(/^\/+/, '').split(/[/?]/, 1)[0];
    const { token, key } = parseShareFragment(fragment);

    return { isShareRoute: true, token, shareKey: key };
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
                        <PublicShare token={shareRoute.token} shareKey={shareRoute.shareKey} />
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
