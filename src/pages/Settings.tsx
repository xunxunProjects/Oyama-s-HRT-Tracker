import React, { useState } from 'react';
import { ChevronRight, Settings2, Database, Info, ArrowLeft, Globe } from 'lucide-react';
import { Lang } from '../i18n/translations';
import { AppTheme } from '../constants';
import { DoseEvent, PKCustomParams } from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    setLang: (lang: Lang) => void;
    theme: AppTheme;
    setTheme: (theme: AppTheme) => void;
    languageOptions: { value: string; label: string }[];
    onImportJson: (text: string) => boolean | Promise<boolean>;
    labResults: any[];
    onExport: (encrypt: boolean, password?: string) => Promise<string | null>;
    onQuickExport: () => void;
    onClearAllEvents: () => void;
    events: DoseEvent[];
    showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void;
    setIsDisclaimerOpen: (isOpen: boolean) => void;
    onNavigateToTransparency: () => void;
    appVersion: string;
    weight: number;
    setIsWeightModalOpen: (isOpen: boolean) => void;
    pkParams: PKCustomParams | null;
    onNavigateToPKParams: () => void;
    onNavigateToHRTMode: () => void;
    onNavigateToLanguage: () => void;
    onNavigateToAppearance: () => void;
    onNavigateToWeight: () => void;
    onNavigateToExport: () => void;
    onNavigateToImport: () => void;
    autoBackup: boolean;
    setAutoBackup: (v: boolean) => void;
    isLoggedIn: boolean;
    devMode: boolean;
    setDevMode: (v: boolean) => void;
    onNavigateToMilkTea: () => void;
}

type SettingsCat = 'general' | 'data' | 'about';
type MobileView = 'list' | SettingsCat;

const rowBase = "w-full flex items-center justify-between py-[18px] border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-start";
const rowLabel = "text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";
const rowValue = "flex items-center gap-1 text-[15px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]";
const muted = "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]";
const on = "text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";

let _savedCat: SettingsCat = 'general';
let _savedMobileView: MobileView = 'list';

const Settings: React.FC<SettingsProps> = ({
    t, lang, theme, languageOptions, onClearAllEvents, events,
    showDialog, setIsDisclaimerOpen, onNavigateToTransparency, appVersion,
    weight, pkParams, onNavigateToPKParams, onNavigateToHRTMode,
    onNavigateToLanguage, onNavigateToAppearance, onNavigateToWeight,
    onNavigateToExport, onNavigateToImport, autoBackup, setAutoBackup, isLoggedIn,
    devMode, setDevMode, onNavigateToMilkTea,
}) => {
    const { mode } = useHRTMode();
    const [cat, setCat] = useState<SettingsCat>(_savedCat);
    const [mobileView, setMobileView] = useState<MobileView>(_savedMobileView);

    const selectCat = (c: SettingsCat) => {
        _savedCat = c;
        setCat(c);
    };

    const enterMobileCat = (c: SettingsCat) => {
        _savedCat = c;
        _savedMobileView = c;
        setCat(c);
        setMobileView(c);
    };

    const exitMobileCat = () => {
        _savedMobileView = 'list';
        setMobileView('list');
    };

    const navTo = (fn: () => void, forCat: SettingsCat) => {
        _savedCat = forCat;
        _savedMobileView = forCat;
        fn();
    };

    const cats: { id: SettingsCat; label: string; Icon: React.ElementType; hint: string }[] = [
        { id: 'general', label: t('settings.group.general'), Icon: Settings2, hint: [t('settings.hrt_mode'), t('drawer.lang'), t('settings.theme')].join(' · ') },
        { id: 'data',    label: t('settings.group.data'),    Icon: Database,  hint: [t('export.title'), t('import.title')].join(' · ') },
        { id: 'about',   label: t('settings.group.about'),   Icon: Info,      hint: [t('drawer.model_title'), t('transparency.title')].join(' · ') },
    ];

    const catLabel = cats.find(c => c.id === (mobileView === 'list' ? 'general' : mobileView))?.label ?? '';

    const GeneralContent = () => (
        <div>
            <button onClick={() => navTo(onNavigateToHRTMode, 'general')} className={rowBase}>
                <span className={rowLabel}>{t('settings.hrt_mode')}</span>
                <span className={rowValue}>
                    {t(mode === 'transfem' ? 'mode.transfem' : 'mode.transmasc')}
                    <ChevronRight size={15} />
                </span>
            </button>

            <button onClick={() => navTo(onNavigateToLanguage, 'general')} className={rowBase}>
                <span className={rowLabel}>{t('drawer.lang')}</span>
                <span className={rowValue}>
                    <Globe size={14} className="opacity-50" />
                    {languageOptions.find(o => o.value === lang)?.label ?? lang}
                    <ChevronRight size={15} />
                </span>
            </button>

            <button onClick={() => navTo(onNavigateToAppearance, 'general')} className={rowBase}>
                <span className={rowLabel}>{t('settings.theme')}</span>
                <span className={rowValue}>
                    {t(`theme.${theme}`)}
                    <ChevronRight size={15} />
                </span>
            </button>

            <button onClick={() => navTo(onNavigateToWeight, 'general')} className={rowBase}>
                <span className={rowLabel}>{t('status.weight')}</span>
                <span className={rowValue}>
                    {weight} kg
                    <ChevronRight size={15} />
                </span>
            </button>

            {isLoggedIn && (
                <div className={`${rowBase} cursor-default`}>
                    <div>
                        <p className={rowLabel}>{t('settings.auto_backup')}</p>
                        <p className={`text-xs ${muted} mt-0.5`}>{t('settings.auto_backup_desc')}</p>
                    </div>
                    <button
                        onClick={() => setAutoBackup(!autoBackup)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${autoBackup ? 'bg-[var(--color-m3-primary)]' : 'bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'}`}
                        role="switch"
                        aria-checked={autoBackup}
                    >
                        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ${autoBackup ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            )}

            <button onClick={() => navTo(onNavigateToPKParams, 'general')} className={`${rowBase} border-b-0`}>
                <span className={rowLabel}>{t('settings.pk_params')}</span>
                <span className={rowValue}>
                    {pkParams && (
                        <span className="text-xs text-amber-600 dark:text-amber-400 font-medium mr-1">
                            {t('pk.customized')}
                        </span>
                    )}
                    <ChevronRight size={15} />
                </span>
            </button>
        </div>
    );

    const DataContent = () => (
        <div>
            <button onClick={() => navTo(onNavigateToExport, 'data')} className={rowBase}>
                <span className={rowLabel}>{t('export.title')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <button onClick={() => navTo(onNavigateToImport, 'data')} className={rowBase}>
                <span className={rowLabel}>{t('import.title')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <button
                onClick={onClearAllEvents}
                disabled={!events.length}
                className={`${rowBase} border-b-0 ${!events.length ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
                <span className={`text-[15px] ${events.length ? 'text-red-600 dark:text-red-400' : rowLabel}`}>
                    {t('drawer.clear')}
                </span>
            </button>
        </div>
    );

    const AboutContent = () => (
        <div>
            <button
                onClick={() => showDialog('confirm', t('drawer.model_confirm'), () => window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank'))}
                className={rowBase}
            >
                <span className={rowLabel}>{t('drawer.model_title')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <button
                onClick={() => showDialog('confirm', t('drawer.github_confirm'), () => window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank'))}
                className={rowBase}
            >
                <span className={rowLabel}>{t('drawer.github')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <button onClick={() => navTo(onNavigateToTransparency, 'about')} className={rowBase}>
                <span className={rowLabel}>{t('transparency.title')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <button onClick={() => setIsDisclaimerOpen(true)} className={rowBase}>
                <span className={rowLabel}>{t('drawer.disclaimer')}</span>
                <ChevronRight size={15} className={muted} />
            </button>

            <div className={`${rowBase} cursor-default`}>
                <div>
                    <p className={rowLabel}>{t('settings.developer_mode')}</p>
                    <p className={`text-xs ${muted} mt-0.5`}>{t('settings.developer_mode_desc')}</p>
                </div>
                <button
                    onClick={() => setDevMode(!devMode)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${devMode ? 'bg-[var(--color-m3-primary)]' : 'bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]'}`}
                    role="switch"
                    aria-checked={devMode}
                >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow ${devMode ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
            </div>

            {devMode && (
                <button onClick={() => navTo(onNavigateToMilkTea, 'about')} className={`${rowBase} border-b-0`}>
                    <span className={rowLabel}>{t('settings.milk_tea_egg')}</span>
                    <ChevronRight size={15} className={muted} />
                </button>
            )}

            <p className={`mt-10 text-xs ${muted}`}>{appVersion}</p>
        </div>
    );

    const catContent = (id: SettingsCat) => {
        if (id === 'general') return <GeneralContent />;
        if (id === 'data') return <DataContent />;
        return <AboutContent />;
    };

    return (
        <div className="flex pt-8 pb-32 min-h-full">

            {/* ── Left category nav (desktop) ─────────────────────────── */}
            <nav className="hidden md:flex flex-col w-52 shrink-0 px-3 gap-0.5 border-r border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                <p className={`px-3 py-1.5 mb-3 text-xl font-semibold ${on}`}>
                    {t('nav.settings')}
                </p>
                {cats.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => selectCat(id)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] text-start
                            ${cat === id
                                ? `bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] ${on} font-medium`
                                : `${muted} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] hover:${on}`
                            }`}
                    >
                        <Icon size={16} strokeWidth={1.75} />
                        {label}
                    </button>
                ))}
            </nav>

            {/* ── Desktop content ─────────────────────────────────────── */}
            <div className="hidden md:block flex-1 px-10 max-w-2xl">
                <h2 className={`text-xl font-semibold ${on} mb-6`}>
                    {cats.find(c => c.id === cat)?.label}
                </h2>
                {catContent(cat)}
            </div>

            {/* ── Mobile ──────────────────────────────────────────────── */}
            <div className="md:hidden flex-1 px-6">
                {mobileView === 'list' ? (
                    <>
                        <h1 className={`sticky top-0 z-20 -mx-6 px-6 pt-2 pb-3 mb-3 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] text-xl font-semibold ${on}`}>{t('nav.settings')}</h1>
                        {cats.map(({ id, label, Icon, hint }) => (
                            <button
                                key={id}
                                onClick={() => enterMobileCat(id)}
                                className={`${rowBase} items-center`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]`}>
                                        <Icon size={18} strokeWidth={1.75} className={muted} />
                                    </div>
                                    <div className="text-start">
                                        <p className={`text-[15px] font-medium ${on}`}>{label}</p>
                                        <p className={`text-xs ${muted} mt-0.5 leading-relaxed`}>{hint}</p>
                                    </div>
                                </div>
                                <ChevronRight size={15} className={muted} />
                            </button>
                        ))}
                    </>
                ) : (
                    <>
                        <div className="sticky top-0 z-20 -mx-6 px-6 pt-2 pb-3 mb-3 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)]">
                            <button
                                onClick={exitMobileCat}
                                className="flex items-center gap-2 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                            >
                                <ArrowLeft size={18} className={`${muted} shrink-0`} />
                                <h1 className={`text-xl font-semibold ${on}`}>
                                    {cats.find(c => c.id === mobileView)?.label}
                                </h1>
                            </button>
                        </div>
                        {catContent(mobileView as SettingsCat)}
                    </>
                )}
            </div>
        </div>
    );
};

export default Settings;
