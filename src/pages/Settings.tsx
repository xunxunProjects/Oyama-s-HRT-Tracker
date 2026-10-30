import React, { useEffect, useState } from 'react';
import { ChevronRight, Sliders, Database, Info } from '../components/icons';
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
import { navDepth, pushNavEntry, readNavEntry, replaceNavEntry, stepBack, TAB_RESELECT } from '../hooks/navHistory';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    theme: AppTheme;
    languageOptions: { value: string; label: string }[];
    onClearAllEvents: () => void;
    events: DoseEvent[];
    showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void;
    onNavigateToDisclaimer: () => void;
    onShowIntro: () => void;
    onNavigateToTransparency: () => void;
    onNavigateToCredits: () => void;
    onNavigateToCommunity: () => void;
    weight: number;
    birthYear: number | null;
    ageBeta: boolean;
    setAgeBeta: (v: boolean) => void;
    pkParams: PKCustomParams | null;
    onNavigateToPKParams: () => void;
    onNavigateToHRTMode: () => void;
    onNavigateToLanguage: () => void;
    onNavigateToAppearance: () => void;
    onNavigateToWeight: () => void;
    onNavigateToAge: () => void;
    onNavigateToExport: () => void;
    onNavigateToImport: () => void;
    autoSync: boolean;
    setAutoSync: (v: boolean) => void;
    isLoggedIn: boolean;
    devMode: boolean;
    setDevMode: (v: boolean) => void;
    hideSiteLabel: boolean;
    setHideSiteLabel: (v: boolean) => void;
    showPrediction: boolean;
    setShowPrediction: (v: boolean) => void;
    onNavigateToMilkTea: () => void;
    onNavigateToCatStates: () => void;
    isAdmin: boolean;
    onNavigateToAdmin: () => void;
    onNavigateToSupplies: () => void;
    supplyCount: number;
}

type SettingsCat = 'general' | 'data' | 'about';
type MobileView = 'list' | SettingsCat;

const rowBase = 'w-full min-h-14 flex items-center justify-between gap-4 py-3.5 text-start';
const rowLabel = 'text-sm text-[var(--text)]';
const rowValue = 'flex items-center gap-1 text-sm text-[var(--text-muted)]';
const muted = 'text-[var(--text-muted)]';
const on = 'text-[var(--text)]';

const section = settingsSection;

/** The heading over a section of rows: sentence case, quiet, and close to its rows. Its own margin wins over the stack's gap below it. */
const SectionHeading: React.FC<{ title: string }> = ({ title }) => <h2 className="group-heading mb-1">{title}</h2>;

const NavRow: React.FC<{ label: string; value?: React.ReactNode; onClick: () => void }> = ({
    label,
    value,
    onClick,
}) => (
    <button onClick={onClick} className={`${rowBase} ${rowBleed}`}>
        <span className={rowLabel}>{label}</span>
        <span className={rowValue}>
            {value}
            <ChevronRight size={18} className="opacity-70 rtl:-scale-x-100" />
        </span>
    </button>
);

// The text is the switch's <label>, so a tap on the words (the bigger, more
// natural target on a phone) flips it too. The description is read after the
// name rather than folded into it.
const SwitchRow: React.FC<{ label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }> = ({
    label,
    desc,
    checked,
    onChange,
}) => {
    const id = React.useId();
    return (
        <div className={`${rowBase} cursor-default`}>
            <label htmlFor={id} className="cursor-pointer">
                <span className={`block ${rowLabel}`}>{label}</span>
                <span id={`${id}-desc`} className={`block text-xs ${muted} mt-0.5`}>
                    {desc}
                </span>
            </label>
            <Switch id={id} checked={checked} onChange={onChange} label={label} describedBy={`${id}-desc`} />
        </div>
    );
};

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

// On a phone the category drilled into is a level of its own for the system
// Back, so it lives in the history entry pushed on the way in (navHistory)
// rather than in a module variable. That also makes it last as long as it
// should: Back from one of its pages lands in it again, while leaving by a
// tab drops it, so the Settings tab opens on the list, not on whichever
// category was open last.
const mobileViewFromHistory = (): MobileView => {
    const entry = readNavEntry();
    const cat = entry?.view === 'settings' ? entry.cat : undefined;
    return CAT_ORDER.find(c => c === cat) ?? 'list';
};

// Out of a category back through history, so the entry pushed on the way in
// is not left behind for the next Back; popstate then shows the list.
const leaveMobileCat = (setMobileView: (v: MobileView) => void) => {
    if (readNavEntry()?.cat) stepBack();
    else setMobileView('list');
};

const Settings: React.FC<SettingsProps> = ({
    t,
    lang,
    theme,
    languageOptions,
    onClearAllEvents,
    events,
    showDialog,
    onNavigateToDisclaimer,
    onShowIntro,
    onNavigateToTransparency,
    onNavigateToCredits,
    onNavigateToCommunity,
    weight,
    birthYear,
    ageBeta,
    setAgeBeta,
    pkParams,
    onNavigateToPKParams,
    onNavigateToHRTMode,
    onNavigateToLanguage,
    onNavigateToAppearance,
    onNavigateToWeight,
    onNavigateToAge,
    onNavigateToExport,
    onNavigateToImport,
    autoSync,
    setAutoSync,
    isLoggedIn,
    devMode,
    setDevMode,
    hideSiteLabel,
    setHideSiteLabel,
    showPrediction,
    setShowPrediction,
    onNavigateToMilkTea,
    onNavigateToCatStates,
    isAdmin,
    onNavigateToAdmin,
    onNavigateToSupplies,
    supplyCount,
}) => {
    const { mode } = useHRTMode();
    const { showCats, setShowCats, catStyle, setCatStyle } = usePixelCats();
    const [cat, setCat] = useState<SettingsCat>(_savedCat);
    const [mobileView, setMobileView] = useState<MobileView>(mobileViewFromHistory);

    const selectCat = (c: SettingsCat) => {
        _savedCat = c;
        setCat(c);
    };

    const enterMobileCat = (c: SettingsCat) => {
        _savedCat = c;
        setCat(c);
        setMobileView(c);
        const entry = readNavEntry();
        if (entry?.cat) replaceNavEntry('settings', entry.depth, c);
        else pushNavEntry('settings', navDepth() + 1, c);
    };

    const exitMobileCat = () => leaveMobileCat(setMobileView);

    // The system Back (or Forward) moving between the list and a category,
    // and the Settings tab tapped again while a category is open.
    useEffect(() => {
        const onPop = () => {
            if (readNavEntry()?.view === 'settings') setMobileView(mobileViewFromHistory());
        };
        const onReselect = (e: Event) => {
            if ((e as CustomEvent<{ view: string }>).detail?.view === 'settings') leaveMobileCat(setMobileView);
        };
        window.addEventListener('popstate', onPop);
        window.addEventListener(TAB_RESELECT, onReselect);
        return () => {
            window.removeEventListener('popstate', onPop);
            window.removeEventListener(TAB_RESELECT, onReselect);
        };
    }, []);

    const navTo = (fn: () => void, forCat: SettingsCat) => {
        _savedCat = forCat;
        fn();
    };

    const catAnim = useSwitchAnimation(cat, CAT_ORDER);
    const mobileAnim = useSwitchAnimation(mobileView, MOBILE_ORDER);

    // Each hint names what people come looking for in that category, so the
    // weight and the prediction switch can be found from this first screen.
    const cats: { id: SettingsCat; label: string; Icon: React.ElementType; hint: string }[] = [
        {
            id: 'general',
            label: t('settings.group.general'),
            Icon: Sliders,
            hint: [t('status.weight'), t('settings.theme'), t('settings.prediction')].join(t('list.sep')),
        },
        {
            id: 'data',
            label: t('settings.group.data'),
            Icon: Database,
            hint: [t('export.title'), t('import.title')].join(t('list.sep')),
        },
        {
            id: 'about',
            label: t('settings.group.about'),
            Icon: Info,
            hint: [t('drawer.model_title'), t('transparency.title')].join(t('list.sep')),
        },
    ];

    // Each category is a stack of sections, each under a short heading in
    // sentence case. Space alone grouped them before, and a section of one row
    // (Supplies) read as a row that had come loose from the rest.
    const renderGeneral = () => (
        <div className="space-y-8">
            {/* What the model is fed. */}
            <SectionHeading title={t('settings.section.model')} />
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
                <SwitchRow
                    label={t('settings.age_beta')}
                    desc={t('settings.age_beta_desc')}
                    checked={ageBeta}
                    onChange={setAgeBeta}
                />
                {/* Only worth showing once the beta itself is on. */}
                {ageBeta && (
                    <NavRow
                        label={t('settings.age')}
                        value={
                            birthYear === null ? t('settings.age_unset') : String(new Date().getFullYear() - birthYear)
                        }
                        onClick={() => navTo(onNavigateToAge, 'general')}
                    />
                )}
                <NavRow
                    label={t('settings.pk_params')}
                    value={
                        pkParams && (
                            <span className="text-xs text-[var(--warning)] font-medium mr-1">{t('pk.customized')}</span>
                        )
                    }
                    onClick={() => navTo(onNavigateToPKParams, 'general')}
                />
            </div>

            {/* What's left on hand. */}
            <SectionHeading title={t('settings.section.supplies')} />
            <div className={section}>
                <NavRow
                    label={t('supplies.title')}
                    value={supplyCount > 0 ? fill(t('supplies.count'), { n: supplyCount }) : undefined}
                    onClick={() => navTo(onNavigateToSupplies, 'general')}
                />
            </div>

            {/* How the app looks and speaks. */}
            <SectionHeading title={t('settings.section.display')} />
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
                    label={t('settings.prediction')}
                    desc={t('settings.prediction_desc')}
                    checked={showPrediction}
                    onChange={setShowPrediction}
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
                                    className={`h-6 w-6 shrink-0 rounded-full border-(length:--hairline) border-[var(--border)] ${
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
                <div className="md:hidden">
                    <SectionHeading title={t('settings.section.admin')} />
                    <div className={section}>
                        <NavRow label={t('admin.dashboard')} onClick={() => navTo(onNavigateToAdmin, 'general')} />
                    </div>
                </div>
            )}
        </div>
    );

    const renderData = () => (
        <div className="space-y-8">
            {isLoggedIn && (
                <div>
                    <SectionHeading title={t('settings.section.sync')} />
                    <div className={section}>
                        <SwitchRow
                            label={t('settings.auto_sync')}
                            desc={t('settings.auto_sync_desc')}
                            checked={autoSync}
                            onChange={setAutoSync}
                        />
                    </div>
                </div>
            )}

            <SectionHeading title={t('settings.section.backup')} />
            <div className={section}>
                <NavRow label={t('export.title')} onClick={() => navTo(onNavigateToExport, 'data')} />
                <NavRow label={t('import.title')} onClick={() => navTo(onNavigateToImport, 'data')} />
            </div>

            {/* Destructive, so it sits apart from Export and Import rather than one row under them.
                The count says how much goes before the tap, not only in the confirm. */}
            <SectionHeading title={t('settings.section.clear')} />
            <div className={section}>
                <button
                    onClick={onClearAllEvents}
                    disabled={!events.length}
                    className={`${rowBase} ${events.length ? rowBleed : 'row-bleed opacity-45 cursor-not-allowed'}`}
                >
                    <span className={`text-sm ${events.length ? 'text-[var(--danger)]' : rowLabel}`}>
                        {t('drawer.clear')}
                    </span>
                    {events.length > 0 && (
                        <span className={`${rowValue} tabular-nums`}>
                            {events.length === 1
                                ? t('timeline.records_one')
                                : t('timeline.records_n').replace('{n}', String(events.length))}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );

    const renderAbout = () => (
        <div className="space-y-8">
            <SectionHeading title={t('settings.section.about')} />
            <div className={section}>
                <NavRow
                    label={t('drawer.model_title')}
                    onClick={() =>
                        showDialog('confirm', t('drawer.model_confirm'), () =>
                            window.open('https://mahiro.uk/articles/estrogen-model-summary', '_blank'),
                        )
                    }
                />
                <NavRow
                    label={t('drawer.github')}
                    onClick={() =>
                        showDialog('confirm', t('drawer.github_confirm'), () =>
                            window.open('https://github.com/xunxunProjects/Oyama-s-HRT-Tracker', '_blank'),
                        )
                    }
                />
                <NavRow label={t('transparency.title')} onClick={() => navTo(onNavigateToTransparency, 'about')} />
                <NavRow label="Credits" onClick={() => navTo(onNavigateToCredits, 'about')} />
                <NavRow label={t('settings.community')} onClick={() => navTo(onNavigateToCommunity, 'about')} />
                <NavRow label={t('drawer.disclaimer')} onClick={() => navTo(onNavigateToDisclaimer, 'about')} />
                {/* The intro only ever shows itself once, so this is the only way back
                    to it — and the only way anyone who skipped it can read it. */}
                <NavRow label={t('settings.show_intro')} onClick={onShowIntro} />
            </div>

            <SectionHeading title={t('settings.section.developer')} />
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
                {devMode && (
                    <NavRow label={t('settings.cat_states')} onClick={() => navTo(onNavigateToCatStates, 'about')} />
                )}
                {devMode && (
                    <NavRow label={t('settings.milk_tea_egg')} onClick={() => navTo(onNavigateToMilkTea, 'about')} />
                )}
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
        <div className="relative md:pb-32">
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
                                                <p className={`text-sm font-medium ${on}`}>{label}</p>
                                                <p className={`text-xs ${muted} mt-0.5`}>{hint}</p>
                                            </div>
                                        </div>
                                        <ChevronRight
                                            size={18}
                                            className={`${muted} shrink-0 opacity-70 rtl:-scale-x-100`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <PageHeader onBack={exitMobileCat} title={cats.find(c => c.id === mobileView)?.label} />
                            <div className={`${PAGE_COLUMN} mt-3`}>{catContent(mobileView as SettingsCat)}</div>
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
                    <Tabs tabs={cats} value={cat} onChange={selectCat} className="mb-4" />
                    <div key={cat} className={catAnim}>
                        {catContent(cat)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
