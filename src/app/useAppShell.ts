import { useState } from 'react';
import { type DoseEvent } from '../../logic';
import { useAuth } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { useHRTMode } from '../contexts/HRTModeContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useAppData } from '../hooks/useAppData';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useCloudSync } from '../hooks/useCloudSync';
import { useLiveShareSync } from '../hooks/useLiveShareSync';
import { shouldShowOnboarding } from '../pages/Onboarding';
import { useAccountFlows } from './useAccountFlows';
import { useAppPreferences } from './useAppPreferences';
import { useBackupActions } from './useBackupActions';
import { usePlanLog } from './usePlanLog';
import { useViewGoneGuard } from './guards';

/**
 * The signed-in app shell: data, navigation, local preferences and the
 * import/export/cloud actions that the page views wire together.
 *
 * Keeping this here rather than in App.tsx leaves the root as provider
 * composition and keeps the view map in AppViews.
 */
export const useAppShell = () => {
    const { t, lang, setLang } = useTranslation();
    const { showDialog } = useDialog();
    const { mode } = useHRTMode();
    const { user, token, logout } = useAuth();
    const [twoFAEnabled, setTwoFAEnabled] = useState(false);

    const preferences = useAppPreferences(setLang);
    const data = useAppData(showDialog, { withPrediction: preferences.showPrediction });
    const nowH = data.currentTime.getTime() / 3600000;

    useLiveShareSync({
        authToken: token,
        mode,
        events: data.events,
        simulation: data.simulation,
        calibrationFn: data.calibrationFn,
    });

    const navigation = useAppNavigation(user);

    const account = useAccountFlows({
        user,
        currentView: navigation.currentView,
        handleViewChange: navigation.handleViewChange,
    });

    // --- Local UI state ---
    // A dose on the Overview's chart sent here to be changed: History opens
    // it in place, where every other dose is edited.
    const [editFromOverview, setEditFromOverview] = useState<string | null>(null);
    const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
    const [isQuickAddLabOpen, setIsQuickAddLabOpen] = useState(false);

    // --- First run ---
    const [showOnboarding, setShowOnboarding] = useState(shouldShowOnboarding);

    // A page whose guard below has gone false (signed out, developer mode off)
    // renders nothing, leaving a blank screen. The browser's Forward can land
    // on one after a sign-out, and an expired sign-in can leave one open, so
    // step up to the page it belongs to.
    useViewGoneGuard({
        authToken: token,
        devMode: preferences.devMode,
        ageBeta: data.ageBeta,
        currentView: navigation.currentView,
        onLeave: navigation.handleViewChange,
    });

    // Two-way sync with the cloud backup: pull, reconcile, push. Replaces both
    // the upload-only auto-backup and the startup "your data differs" prompt —
    // the prompt could only add records the cloud had and this device lacked, so
    // edits and deletions stayed unresolved and it reappeared every launch.
    const syncState = useCloudSync({
        token,
        userId: user?.id ?? null,
        enabled: preferences.autoSync,
        // Never touch the cloud while the data layer is mid-switch between
        // accounts or modes: the payload would mix one account's in-memory
        // records with another's storage keys.
        ready: data.readyScope === data.scope,
        buildPayload: data.buildExportPayload,
        applyRemote: data.applySyncedState,
        events: data.events,
        labResults: data.labResults,
        doseTemplates: data.doseTemplates,
        weight: data.weight,
        birthYear: data.birthYear,
        pkParams: data.pkParams,
        plan: data.plan,
        modelSettings: data.modelSettings,
    });

    const backup = useBackupActions({
        t,
        lang,
        user,
        token,
        showDialog,
        data,
        applyPortablePreferences: preferences.applyPortablePreferences,
        requireSignIn: account.requireSignIn,
        sync: syncState,
    });

    const planLog = usePlanLog({
        events: data.events,
        addEvent: data.addEvent,
        deleteEvent: data.deleteEvent,
    });

    const handleEditEvent = (event: DoseEvent) => {
        setEditFromOverview(event.id);
        navigation.handleViewChange('history');
    };

    return {
        ...data,
        ...preferences,
        ...navigation,
        ...account,
        ...backup,
        ...planLog,
        t,
        lang,
        setLang,
        showDialog,
        mode,
        user,
        token,
        logout,
        twoFAEnabled,
        setTwoFAEnabled,
        editFromOverview,
        setEditFromOverview,
        isQuickAddOpen,
        setIsQuickAddOpen,
        isQuickAddLabOpen,
        setIsQuickAddLabOpen,
        showOnboarding,
        setShowOnboarding,
        nowH,
        handleEditEvent,
        syncState,
    };
};

export type AppShell = ReturnType<typeof useAppShell>;
