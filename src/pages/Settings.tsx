import React, { useState } from 'react';
import { ChevronRight, Settings2, Database, Info } from 'lucide-react';
import { Lang } from '../i18n/translations';
import { AppTheme } from '../constants';
import { DoseEvent, PKCustomParams } from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';
import { usePixelCats, CatStyle } from '../contexts/PixelCatContext';
import Switch from '../components/Switch';
import { settingsSection, rowBleed } from '../components/SettingsListItem';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Tabs, { useSwitchAnimation } from '../components/Tabs';
import { fill } from '../utils/regimenText';

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
    onShowIntro: () => void;
    onNavigateToTransparency: () => void;
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
    autoSync: boolean;
    setAutoSync: (v: boolean) => void;
    isLoggedIn: boolean;
    devMode: boolean;
    setDevMode: (v: boolean) => void;
    hideSiteLabel: boolean;
    setHideSiteLabel: (v: boolean) => void;
    onNavigateToMilkTea: () => void;
    onNavigateToCatStates: () => void;
    isAdmin: boolean;
    onNavigateToAdmin: () => void;
    onNavigateToSupplies: () => void;
    supplyCount: number;
}

type SettingsCat = 'general' | 'data' | 'about';
type MobileView = 'list' | SettingsCat;

const rowBase = "w-full min-h-14 flex items-center justify-between gap-4 py-3.5 text-start";
const rowLabel = "text-[0.9375rem] text-[var(--text)]";
const rowValue = "flex items-center gap-1 text-[0.9375rem] text-[var(--text-muted)]";
const muted = "text-[var(--text-muted)]";
const on = "text-[var(--text)]";

const section = settingsSection;

const NavRow: React.FC<{ label: string; value?: React.ReactNode; onClick: () => void }> = ({ label, value, onClick }) => (
    <button onClick={onClick} className={`${rowBase} ${rowBleed}`}>
        <span className={rowLabel}>{label}</span>
        <span className={rowValue}>
            {value}
            <ChevronRight size={18} className="opacity-70 rtl:-scale-x-100" />
        </span>
    </button>
);

const SwitchRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, desc, checked, onChange }) => (
    <div className={`${rowBase} cursor-default`}>
        <div>
            <p className={rowLabel}>{label}</p>
            <p className={`text-xs ${muted} mt-0.5`}>{desc}</p>
        </div>
        <Switch checked={checked} onChange={onChange} label={label} />
    </div>
);

// Hard stops rather than a smooth blend, in equal fifths — the flag's stripes
// are even, and anything else reads as a lopsided swatch.
const CAT_STYLE_SWATCHES: { id: CatStyle; background: string }[] = [
    {
        id: 'flag',
        background:
            'linear-gradient(180deg, var(--pixel-blue) 0 20%, var(--pixel-pink) 20% 40%, var(--pixel-white) 40% 60%, var(--pixel-pink) 60% 80%, var(--pixel-blue) 80% 100%)',
    },
    { id: 'blue', background: 'var(--pixel-blue)' },
    { id: 'pink', background: 'var(--pixel-pink)' },
];

const CAT_ORDER: readonly SettingsCat[] = ['general', 'data', 'about'];
const MOBILE_ORDER: readonly MobileView[] = ['list', ...CAT_ORDER];

let _savedCat: SettingsCat = 'general';
let _savedMobileView: MobileView = 'list';

const Settings: React.FC<SettingsProps> = ({
    t, lang, theme, languageOptions, onClearAllEvents, events,
    showDialog, setIsDisclaimerOpen, onShowIntro, onNavigateToTransparency,
    weight, pkParams, onNavigateToPKParams, onNavigateToHRTMode,
    onNavigateToLanguage, onNavigateToAppearance, onNavigateToWeight,
    onNavigateToExport, onNavigateToImport, autoSync, setAutoSync, isLoggedIn,
    devMode, setDevMode, hideSiteLabel, setHideSiteLabel, onNavigateToMilkTea, onNavigateToCatStates, isAdmin, onNavigateToAdmin,
    onNavigateToSupplies, supplyCount,
}) => {
    const { mode } = useHRTMode();
    const { showCats, setShowCats, catStyle, setCatStyle } = usePixelCats();
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

    const catAnim = useSwitchAnimation(cat, CAT_ORDER);
    const mobileAnim = useSwitchAnimation(mobileView, MOBILE_ORDER);

    const cats: { id: SettingsCat; label: string; Icon: React.ElementType; hint: string }[] = [
        { id: 'general', label: t('settings.group.general'), Icon: Settings2, hint: [t('settings.hrt_mode'), t('drawer.lang'), t('settings.theme')].join(' · ') },
        { id: 'data',    label: t('settings.group.data'),    Icon: Database,  hint: [t('export.title'), t('import.title')].join(' · ') },
        { id: 'about',   label: t('settings.group.about'),   Icon: Info,      hint: [t('drawer.model_title'), t('transparency.title')].join(' · ') },
    ];

    // Each category is a stack of sections: like rows sit together, and the
    // space between sections is the only grouping, so no extra headings to
    // translate.
    const renderGeneral = () => (
        <div className="space-y-8">
            {/* What the model is fed. */}
            <div className={section}>
                <NavRow
                    label={t('settings.hrt_mode')}
                    value={t(mode === 'transfem' ? 'mode.transfem' : 'mode.transmasc')}
                    onClick={() => navTo(onNavigateToHRTMode, 'general')}
                />
                <NavRow
                    label={t('status.weight')}
                    value={`${weight} kg`}
                    onClick={() => navTo(onNavigateToWeight, 'general')}
                />
                <NavRow
                    label={t('settings.pk_params')}
                    value={pkParams && (
                        <span className="text-xs text-[var(--warning)] font-medium mr-1">
                            {t('pk.customized')}
                        </span>
                    )}
                    onClick={() => navTo(onNavigateToPKParams, 'general')}
                />
            </div>

            {/* What's left on hand. */}
            <div className={section}>
                <NavRow
                    label={t('supplies.title')}
                    value={supplyCount > 0 ? fill(t('supplies.count'), { n: supplyCount }) : undefined}
                    onClick={() => navTo(onNavigateToSupplies, 'general')}
                />
            </div>

            {/* How the app looks and speaks. */}
            <div className={section}>
                <NavRow
                    label={t('drawer.lang')}
                    value={languageOptions.find(o => o.value === lang)?.label ?? lang}
                    onClick={() => navTo(onNavigateToLanguage, 'general')}
                />
                <NavRow
                    label={t('settings.theme')}
                    value={t(`theme.${theme}`)}
                    onClick={() => navTo(onNavigateToAppearance, 'general')}
                />
                <SwitchRow
                    label={t('settings.pixel_cats')}
                    desc={t('settings.pixel_cats_desc')}
                    checked={showCats}
                    onChange={setShowCats}
                />
                {/* Only worth showing once the cats themselves are on. */}
                {showCats && (
                    <div className={`${rowBase} cursor-default`}>
                        <span className={rowLabel}>{t('settings.cat_style')}</span>
                        <div className="flex items-center gap-2.5">
                            {CAT_STYLE_SWATCHES.map(({ id, background }) => (
                                <button
                                    key={id}
                                    onClick={() => setCatStyle(id)}
                                    aria-label={t(`settings.cat_style.${id}`)}
                                    title={t(`settings.cat_style.${id}`)}
                                    aria-pressed={catStyle === id}
                                    className={`h-6 w-6 shrink-0 rounded-full border border-[var(--border)] ${
                                        catStyle === id
                                            ? 'ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]'
                                            : ''
                                    }`}
                                    style={{ background }}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Desktop reaches the admin area from the left nav rail; on mobile that
                rail doesn't exist, so this is the only way in. */}
            {isAdmin && (
                <div className={`${section} md:hidden`}>
                    <NavRow label={t('admin.dashboard')} onClick={() => navTo(onNavigateToAdmin, 'general')} />
                </div>
            )}
        </div>
    );

    const renderData = () => (
        <div className="space-y-8">
            {isLoggedIn && (
                <div className={section}>
                    <SwitchRow
                        label={t('settings.auto_sync')}
                        desc={t('settings.auto_sync_desc')}
                        checked={autoSync}
                        onChange={setAutoSync}
                    />
                </div>
            )}

            <div className={section}>
                <NavRow label={t('export.title')} onClick={() => navTo(onNavigateToExport, 'data')} />
                <NavRow label={t('import.title')} onClick={() => navTo(onNavigateToImport, 'data')} />
            </div>

            {/* Destructive, so it sits apart from Export and Import rather than one row under them. */}
            <div className={section}>
                <button
                    onClick={onClearAllEvents}
                    disabled={!events.length}
                    className={`${rowBase} ${events.length ? rowBleed : 'row-bleed opacity-45 cursor-not-allowed'}`}
                >
                    <span className={`text-[0.9375rem] ${events.length ? 'text-[var(--danger)]' : rowLabel}`}>
                        {t('drawer.clear')}
                    </span>
                </button>
            </div>
        </div>
    );

    const renderAbout = () => (
        <div className="space-y-8">
            <div className={section}>
                <NavRow
                    label={t('drawer.model_title')}
                    onClick={() => showDialog('confirm', t('drawer.model_confirm'), () => window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank'))}
                />
                <NavRow
                    label={t('drawer.github')}
                    onClick={() => showDialog('confirm', t('drawer.github_confirm'), () => window.open('https://github.com/SmirnovaOyama/Oyama-s-HRT-recorder', '_blank'))}
                />
                <NavRow label={t('transparency.title')} onClick={() => navTo(onNavigateToTransparency, 'about')} />
                <NavRow label={t('drawer.disclaimer')} onClick={() => setIsDisclaimerOpen(true)} />
                {/* The intro only ever shows itself once, so this is the only way back
                    to it — and the only way anyone who skipped it can read it. */}
                <NavRow label={t('settings.show_intro')} onClick={onShowIntro} />
            </div>

            <div className={section}>
                <SwitchRow
                    label={t('settings.developer_mode')}
                    desc={t('settings.developer_mode_desc')}
                    checked={devMode}
                    onChange={setDevMode}
                />
                {devMode && (
                    <SwitchRow
                        label={t('settings.hide_site_label')}
                        desc={t('settings.hide_site_label_desc')}
                        checked={hideSiteLabel}
                        onChange={setHideSiteLabel}
                    />
                )}
                {devMode && <NavRow label={t('settings.cat_states')} onClick={() => navTo(onNavigateToCatStates, 'about')} />}
                {devMode && <NavRow label={t('settings.milk_tea_egg')} onClick={() => navTo(onNavigateToMilkTea, 'about')} />}
            </div>

        </div>
    );

    // Called, not mounted as <Component />: a component declared inside render is
    // a new type every render, so React would tear the rows down on each toggle
    // and a keyboard user's focus would drop off the switch they just pressed.
    const catContent = (id: SettingsCat) => {
        if (id === 'general') return renderGeneral();
        if (id === 'data') return renderData();
        return renderAbout();
    };

    return (
        <div className="relative pb-32">
            {/* ── Mobile: the category list, then one category ─────────── */}
            <div className="md:hidden">
                {/* Keyed so drilling in slides forward and backing out slides back. */}
                <div key={mobileView} className={mobileAnim}>
                {mobileView === 'list' ? (
                    <>
                        <PageHeader title={t('nav.settings')} />
                        <div className={`${PAGE_COLUMN} mt-3 ${section}`}>
                            {cats.map(({ id, label, Icon, hint }) => (
                                <button
                                    key={id}
                                    onClick={() => enterMobileCat(id)}
                                    // The rule starts after the 36px tile and its 12px gap.
                                    style={{ '--divider-inset': '3rem' } as React.CSSProperties}
                                    className={`${rowBase} ${rowBleed}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--surface-muted)]">
                                            <Icon size={20} strokeWidth={1.75} className={muted} />
                                        </div>
                                        <div className="text-start">
                                            <p className={`text-[0.9375rem] font-medium ${on}`}>{label}</p>
                                            <p className={`text-xs ${muted} mt-0.5`}>{hint}</p>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} className={`${muted} shrink-0 opacity-70 rtl:-scale-x-100`} />
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <PageHeader onBack={exitMobileCat} title={cats.find(c => c.id === mobileView)?.label} />
                        <div className={`${PAGE_COLUMN} mt-3`}>
                            {catContent(mobileView as SettingsCat)}
                        </div>
                    </>
                )}
                </div>
            </div>

            {/* ── Desktop: the same header and column as every other page,
                with the categories as tabs under the title. A second nav rail
                beside the app's own sidebar pushed the whole page left. ── */}
            <div className="hidden md:block">
                <PageHeader title={t('nav.settings')} />
                <div className={`${PAGE_COLUMN} mt-3`}>
                    <Tabs
                        tabs={cats}
                        value={cat}
                        onChange={selectCat}
                        className="mb-4"
                    />
                    <div key={cat} className={catAnim}>
                        {catContent(cat)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
