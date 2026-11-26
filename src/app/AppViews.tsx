import { Suspense, useState } from 'react';
import BottomNav from '../components/BottomNav';
import JsDependencyNotice from '../components/JsDependencyNotice';
import PageLoading from '../components/PageLoading';
import PasswordPrompt from '../components/PasswordPrompt';
import Sidebar from '../components/Sidebar';
import SiteNoticeBanner from '../components/SiteNotice';
import UpdatePrompt from '../components/UpdatePrompt';
import type { ViewKey } from '../hooks/useAppNavigation';
import { supportsViewTransitions } from '../motion/viewMove';
import Home from '../pages/Home';
import Search from '../pages/Search';
import { JournalTabs, type JournalPanel } from '../pages/journal/JournalTabs';
import type { DoseTemplate } from '../components/DoseForm';
import Onboarding, { markOnboardingSeen } from '../pages/Onboarding';
import {
    Account,
    Admin,
    AgeSettings,
    AppearanceSettings,
    CalibrationGuide,
    CalibrationSettings,
    CatStates,
    ChangePasswordPage,
    CommunityVote,
    Credits,
    DeleteAccountPage,
    Disclaimer,
    EditAvatarPage,
    EditProfilePage,
    ExportSettings,
    F2fPage,
    Forecast,
    History,
    HRTModeSettings,
    JournalStats,
    JournalWeight,
    Kind,
    Medication,
    HrtSecurityPage,
    ImportSettings,
    Lab,
    LanguageSettings,
    MilkTeaEasterEgg,
    ModelGuide,
    OpSec,
    PKParamsPage,
    PKDemos,
    Plan,
    SessionsPage,
    Settings,
    ShareSettings,
    Simulator,
    Supplies,
    TransparencySettings,
    TwoFactorPage,
    WeightSettings,
} from '../routes/lazyPages';
import type { AppShell } from './useAppShell';

const AppViews = ({ shell }: { shell: AppShell }) => {
    const {
        t,
        lang,
        setLang,
        showDialog,
        mode,
        user,
        token,
        logout,
        theme,
        setTheme,
        isDarkMode,
        showPrediction,
        setShowPrediction,
        autoSync,
        setAutoSync,
        showOnboarding,
        setShowOnboarding,
        devMode,
        setDevMode,
        hideSiteLabel,
        setHideSiteLabel,
        supplyLeadDays,
        setSupplyLeadDays,
        languageOptions,
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
        ageBeta,
        setAgeBeta,
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
        regimens,
        supplies,
        saveSupply,
        deleteSupply,
        nowH,
        currentView,
        currentTab,
        viewParam,
        move,
        handleViewChange,
        handleTabSelect,
        mainScrollRef,
        navItems,
        twoFAEnabled,
        setTwoFAEnabled,
        editFromOverview,
        setEditFromOverview,
        isQuickAddOpen,
        setIsQuickAddOpen,
        isQuickAddLabOpen,
        setIsQuickAddLabOpen,
        signInReason,
        communityVoteReturn,
        setCommunityVoteReturn,
        requireSignIn,
        openCommunityVote,
        signInForCommunityVote,
        handleLogPlanItem,
        handleUndoPlanLog,
        undoableIds,
        isPasswordInputOpen,
        closePasswordPrompt,
        handlePasswordSubmit,
        handleQuickExport,
        handleExportConfirm,
        handleCompleteBackupExport,
        importEventsFromJson,
        replaceCompleteBackupFromJson,
        handleCloudSave,
        handleCloudLoad,
        handleCloudMerge,
        handleEditEvent,
        syncState,
    } = shell;

    // A medicine's page sends its Log here: the journal's form opens on it.
    const [addPrefill, setAddPrefill] = useState<Pick<DoseTemplate, 'route' | 'ester' | 'doseMG' | 'extras'> | null>(
        null,
    );
    const openPanel = (p: JournalPanel) => handleViewChange(p);
    const logFrom = (prefill: Pick<DoseTemplate, 'route' | 'ester' | 'doseMG' | 'extras'> | null) => {
        setAddPrefill(prefill);
        setIsQuickAddOpen(true);
        handleViewChange('history');
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
            <Sidebar
                navItems={navItems}
                currentView={
                    currentView === 'settings-community' && navItems.some(item => item.id === 'settings-community')
                        ? 'settings-community'
                        : currentTab
                }
                onViewChange={view => {
                    // Opened from the sidebar rather than a row, Back returns
                    // to whatever page was showing when the door was used.
                    if (view === 'settings-community' && currentView !== 'settings-community') {
                        setCommunityVoteReturn(currentView);
                    }
                    handleTabSelect(view);
                }}
            />
            <div className="flex-1 flex flex-col overflow-hidden w-full bg-[var(--bg)] relative">
                {/* Mobile site label — reflects the current deployment host. Hidden,
                    it still keeps its top padding, which is what holds the content
                    clear of a notch or status bar. */}
                <div
                    className={`md:hidden shrink-0 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] ${hideSiteLabel ? '' : 'pb-1 text-center text-xs font-medium tracking-wide text-muted select-none'}`}
                >
                    {!hideSiteLabel && window.location.hostname}
                </div>

                {/* Operator banner. Outside the scroller and keyed off nothing in
                    this component, so it stays put across view changes. */}
                <JsDependencyNotice />
                <SiteNoticeBanner />
                <UpdatePrompt />
                {/* Where a prompt goes when nothing on the page was pressed to
                    put it under (contexts/DialogContext.tsx). */}
                <div id="prompt-slot" className="relative z-30 shrink-0" />

                {/* The page area, captured on its own for page moves
                    (motion.css), so the sidebar and the bottom bar stay put,
                    and on the page colour, so no move goes see-through.
                    Without view transitions the arriving page settles alone. */}
                <div
                    ref={mainScrollRef}
                    key={currentView}
                    className={`main-view flex-1 flex flex-col overflow-y-auto scrollbar-hide scroll-pb-nav bg-[var(--bg)] ${supportsViewTransitions || (move !== 'push' && move !== 'pop') ? '' : `view-in-${move}`}`}
                >
                    <Suspense fallback={<PageLoading />}>
                        {currentView === 'home' && (
                            <Search
                                onOpenMed={m => handleViewChange('med', m.id)}
                                onOpenKind={k => handleViewChange('kind', k)}
                            />
                        )}

                        {currentView === 'kind' && (
                            <Kind
                                kind={viewParam}
                                onOpenMed={m => handleViewChange('med', m.id)}
                                onBack={() => handleViewChange('home')}
                            />
                        )}

                        {currentView === 'med' && (
                            <Medication
                                id={viewParam}
                                weight={weight}
                                birthYear={modelBirthYear}
                                events={events}
                                plan={plan}
                                onBack={() => window.history.back()}
                                onLog={(route, ester, amount) => {
                                    const isPatch = route === 'patchApply';
                                    logFrom({
                                        route,
                                        ester,
                                        doseMG: isPatch ? 0 : amount,
                                        extras: isPatch ? { releaseRateUGPerDay: amount } : {},
                                    });
                                }}
                                onOpenJournal={() => handleViewChange('history-stats')}
                                onOpenModel={() => handleViewChange('settings-model')}
                            />
                        )}

                        {currentView === 'plan' && (
                            <Plan plan={plan} onSave={savePlanItem} onDelete={deletePlanItem} events={events} />
                        )}

                        {currentView === 'forecast' && (
                            <Forecast
                                onBack={() => handleViewChange('history')}
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
                                onBack={() => handleViewChange('history')}
                                authToken={token}
                                mode={mode}
                                events={events}
                                simulation={simulation}
                                calibrationFn={calibrationFn}
                            />
                        )}

                        {currentView === 'history' && (
                            <History
                                title={t('nav.journal')}
                                belowHeader={<JournalTabs value="history" onChange={openPanel} />}
                                beforeList={
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
                                        onNavigateToHistory={() => setIsQuickAddOpen(true)}
                                        onNavigateToLab={() => {
                                            setIsQuickAddLabOpen(true);
                                            handleViewChange('lab');
                                        }}
                                        onNavigateToShare={() => handleViewChange('share')}
                                        authToken={token}
                                        onAuthRequired={() => requireSignIn('share', 'share')}
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
                                        onNavigateToCommunityVote={() => openCommunityVote('home')}
                                        onCommunityVoteSignIn={() => signInForCommunityVote('home')}
                                        embedded
                                    />
                                }
                                listHeading={t('journal.list')}
                                addPrefill={addPrefill}
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
                                openEditId={editFromOverview}
                                onOpenEditHandled={() => setEditFromOverview(null)}
                            />
                        )}

                        {currentView === 'history-stats' && (
                            <JournalStats
                                events={events}
                                isDarkMode={isDarkMode}
                                onPanel={openPanel}
                                onOpenMed={id => handleViewChange('med', id)}
                                onLog={() => logFrom(null)}
                            />
                        )}

                        {currentView === 'history-weight' && (
                            <JournalWeight weight={weight} onSetWeight={setWeight} onPanel={openPanel} />
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
                                onOpenGuide={() => handleViewChange('lab-calibration-guide')}
                                onBack={() => handleViewChange('lab')}
                            />
                        )}

                        {currentView === 'lab-calibration-guide' && (
                            <CalibrationGuide weight={weight} onBack={() => handleViewChange('lab-calibration')} />
                        )}

                        {currentView === 'settings' && (
                            <Settings
                                onNavigateToAccount={() => handleViewChange('account')}
                                accountName={user?.username ?? null}
                                t={t}
                                lang={lang}
                                theme={theme}
                                languageOptions={languageOptions}
                                onClearAllEvents={clearAllEvents}
                                events={events}
                                showDialog={showDialog}
                                onNavigateToDisclaimer={() => handleViewChange('settings-disclaimer')}
                                onNavigateToOpSec={() => handleViewChange('settings-opsec')}
                                onShowIntro={() => setShowOnboarding(true)}
                                onNavigateToTransparency={() => handleViewChange('settings-transparency')}
                                onNavigateToCredits={() => handleViewChange('settings-credits')}
                                onNavigateToCommunity={() => openCommunityVote('settings')}
                                weight={weight}
                                birthYear={birthYear}
                                ageBeta={ageBeta}
                                setAgeBeta={setAgeBeta}
                                pkParams={pkParams}
                                onNavigateToPKParams={() => handleViewChange('pk-params')}
                                onNavigateToPKDemos={() => handleViewChange('settings-pk-viz')}
                                onNavigateToModelGuide={() => handleViewChange('settings-model')}
                                onNavigateToHRTMode={() => handleViewChange('settings-hrt-mode')}
                                onNavigateToLanguage={() => handleViewChange('settings-language')}
                                onNavigateToAppearance={() => handleViewChange('settings-appearance')}
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
                                onNavigateToSimulator={() => handleViewChange('settings-simulator')}
                                isAdmin={!!user?.isAdmin}
                                onNavigateToAdmin={() => handleViewChange('admin')}
                                onNavigateToSupplies={() => handleViewChange('supplies')}
                                supplyCount={supplies.length}
                            />
                        )}

                        {currentView === 'settings-hrt-mode' && (
                            <HRTModeSettings onBack={() => handleViewChange('settings')} />
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
                                signInReason={signInReason}
                                onBack={() => handleViewChange('settings')}
                            />
                        )}

                        {currentView === 'sessions' && token && (
                            <SessionsPage token={token} onBack={() => handleViewChange('account')} />
                        )}

                        {currentView === 'hrt-security' && token && (
                            <HrtSecurityPage token={token} onBack={() => handleViewChange('account')} />
                        )}

                        {currentView === 'f2f' && token && (
                            <F2fPage token={token} onBack={() => handleViewChange('account')} />
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

                        {currentView === 'edit-profile' && (
                            <EditProfilePage onBack={() => handleViewChange('account')} />
                        )}

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

                        {currentView === 'settings-community' && (
                            <CommunityVote
                                onBack={() => handleViewChange(communityVoteReturn)}
                                onSignIn={() => signInForCommunityVote(communityVoteReturn)}
                            />
                        )}

                        {currentView === 'settings-opsec' && <OpSec onBack={() => handleViewChange('settings')} />}

                        {currentView === 'settings-pk-viz' && <PKDemos onBack={() => handleViewChange('settings')} />}

                        {currentView === 'settings-model' && (
                            <ModelGuide weight={weight} onBack={() => handleViewChange('settings')} />
                        )}

                        {currentView === 'settings-disclaimer' && (
                            <Disclaimer onBack={() => handleViewChange('settings')} />
                        )}

                        {currentView === 'settings-milk-tea' && devMode && (
                            <MilkTeaEasterEgg onBack={() => handleViewChange('settings')} />
                        )}

                        {currentView === 'settings-cat-states' && devMode && (
                            <CatStates onBack={() => handleViewChange('settings')} />
                        )}

                        {currentView === 'settings-simulator' && devMode && (
                            <Simulator onBack={() => handleViewChange('settings')} />
                        )}

                        {currentView === 'supplies' && (
                            <Supplies
                                onBack={() => window.history.back()}
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
                            <Admin onBack={() => handleViewChange('settings')} />
                        )}
                    </Suspense>
                </div>

                {/* The bottom bar on a phone (components/BottomNav.tsx). Mobile
                    reaches admin from Settings, so there the settings tab is
                    the one that reads as current. The funding vote keeps its
                    page under Settings too, so it never adds a sixth tab. */}
                <BottomNav
                    tabs={navItems.filter(item => item.id !== 'admin' && item.id !== 'settings-community')}
                    activeTab={currentView === 'admin' ? 'settings' : currentTab}
                    onSelect={id => handleTabSelect(id as ViewKey)}
                    pageKey={currentView}
                />
            </div>

            {/* An encrypted file's password, asked for as a line under the
                Import page's button (components/PasswordPrompt.tsx). */}
            <PasswordPrompt
                isOpen={isPasswordInputOpen}
                onClose={closePasswordPrompt}
                onConfirm={handlePasswordSubmit}
            />
        </div>
    );
};

export default AppViews;
