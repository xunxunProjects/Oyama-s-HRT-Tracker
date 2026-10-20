import React from 'react';
import { ChevronRight, ChevronsUpDown } from 'lucide-react';
import { Lang } from '../i18n/translations';
import { AppTheme } from '../constants';
import { DoseEvent, PKCustomParams } from '../../logic';
import { useHRTMode } from '../contexts/HRTModeContext';
import { usePixelCats, CatStyle } from '../contexts/PixelCatContext';
import Switch from '../components/Switch';
import { settingsSection, rowBleed } from '../components/SettingsListItem';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { fill } from '../utils/regimenText';

interface SettingsProps {
    t: (key: string) => string;
    lang: Lang;
    setLang: (lang: Lang) => void;
    theme: AppTheme;
    setTheme: (theme: AppTheme) => void;
    languageOptions: { value: string; label: string }[];
    onClearAllEvents: () => void;
    events: DoseEvent[];
    showDialog: (type: 'alert' | 'confirm', message: string, onConfirm?: () => void) => void;
    setIsDisclaimerOpen: (isOpen: boolean) => void;
    onShowIntro: () => void;
    onNavigateToTransparency: () => void;
    onNavigateToCredits: () => void;
    weight: number;
    birthYear: number | null;
    ageBeta: boolean;
    setAgeBeta: (v: boolean) => void;
    pkParams: PKCustomParams | null;
    onNavigateToPKParams: () => void;
    onNavigateToHRTMode: () => void;
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

const rowBase = 'w-full min-h-14 flex items-center justify-between gap-4 py-3.5 text-start';
const rowLabel = 'text-[0.9375rem] text-[var(--text)]';
const rowValue = 'flex items-center gap-1 text-[0.9375rem] text-[var(--text-muted)]';
const muted = 'text-[var(--text-muted)]';
const groupLabel = `text-xs font-semibold mb-2 block ${muted}`;

const section = settingsSection;

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

// A short list picked in place: the row looks like any other, and a native
// <select> laid over it opens the system picker (the wheel on a phone, a menu
// on a computer) from one tap, rather than a page of its own to go into and
// back out of.
const PickRow = <K extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: K;
    options: { value: K; label: string }[];
    onChange: (v: K) => void;
}) => (
    <div
        className={`${rowBase} ${rowBleed} relative focus-within:outline focus-within:outline-2 focus-within:outline-[var(--accent)]`}
    >
        <span className={rowLabel}>{label}</span>
        <span className={rowValue}>
            {options.find(o => o.value === value)?.label ?? value}
            <ChevronsUpDown size={16} className="opacity-70" />
        </span>
        <select
            value={value}
            onChange={e => onChange(e.target.value as K)}
            aria-label={label}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
        >
            {options.map(o => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    </div>
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

const THEMES: readonly AppTheme[] = ['light', 'dark', 'system', 'mono'];

const Settings: React.FC<SettingsProps> = ({
    t,
    lang,
    setLang,
    theme,
    setTheme,
    languageOptions,
    onClearAllEvents,
    events,
    showDialog,
    setIsDisclaimerOpen,
    onShowIntro,
    onNavigateToTransparency,
    onNavigateToCredits,
    weight,
    birthYear,
    ageBeta,
    setAgeBeta,
    pkParams,
    onNavigateToPKParams,
    onNavigateToHRTMode,
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

    // One page, the same on a phone and a computer. It used to open on three
    // categories to go into first, so even the theme was three taps and two
    // pages deep. Now every row is on the first screen or a scroll below it,
    // and the group names are only headings.
    return (
        <div className="relative pb-32">
            <PageHeader title={t('nav.settings')} />
            <div className={`${PAGE_COLUMN} mt-3 space-y-8`}>
                {/* What the model is fed. */}
                <div className={section}>
                    <NavRow
                        label={t('settings.hrt_mode')}
                        value={t(mode === 'transfem' ? 'mode.transfem' : 'mode.transmasc')}
                        onClick={onNavigateToHRTMode}
                    />
                    <NavRow label={t('status.weight')} value={`${weight} kg`} onClick={onNavigateToWeight} />
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
                                birthYear === null
                                    ? t('settings.age_unset')
                                    : String(new Date().getFullYear() - birthYear)
                            }
                            onClick={onNavigateToAge}
                        />
                    )}
                    <NavRow
                        label={t('settings.pk_params')}
                        value={
                            pkParams && (
                                <span className="text-xs text-[var(--warning)] font-medium mr-1">
                                    {t('pk.customized')}
                                </span>
                            )
                        }
                        onClick={onNavigateToPKParams}
                    />
                </div>

                {/* What's left on hand. */}
                <div className={section}>
                    <NavRow
                        label={t('supplies.title')}
                        value={supplyCount > 0 ? fill(t('supplies.count'), { n: supplyCount }) : undefined}
                        onClick={onNavigateToSupplies}
                    />
                </div>

                {/* How the app looks and speaks. */}
                <div className={section}>
                    <PickRow
                        label={t('drawer.lang')}
                        value={lang}
                        options={languageOptions as { value: Lang; label: string }[]}
                        onChange={setLang}
                    />
                    <PickRow
                        label={t('settings.theme')}
                        value={theme}
                        options={THEMES.map(v => ({ value: v, label: t(`theme.${v}`) }))}
                        onChange={setTheme}
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
                        <NavRow label={t('admin.dashboard')} onClick={onNavigateToAdmin} />
                    </div>
                )}

                <section>
                    <h2 className={groupLabel}>{t('settings.group.data')}</h2>
                    <div className={section}>
                        {isLoggedIn && (
                            <SwitchRow
                                label={t('settings.auto_sync')}
                                desc={t('settings.auto_sync_desc')}
                                checked={autoSync}
                                onChange={setAutoSync}
                            />
                        )}
                        <NavRow label={t('export.title')} onClick={onNavigateToExport} />
                        <NavRow label={t('import.title')} onClick={onNavigateToImport} />
                    </div>
                </section>

                {/* Destructive, so it sits apart from Export and Import rather than one row under them.
                    The count says how much goes before the tap, not only in the confirm. */}
                <div className={section}>
                    <button
                        onClick={onClearAllEvents}
                        disabled={!events.length}
                        className={`${rowBase} ${events.length ? rowBleed : 'row-bleed opacity-45 cursor-not-allowed'}`}
                    >
                        <span className={`text-[0.9375rem] ${events.length ? 'text-[var(--danger)]' : rowLabel}`}>
                            {t('drawer.clear')}
                        </span>
                        {events.length > 0 && (
                            <span className={`${rowValue} tabular-nums`}>
                                {events.length} {t('timeline.records')}
                            </span>
                        )}
                    </button>
                </div>

                <section>
                    <h2 className={groupLabel}>{t('settings.group.about')}</h2>
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
                        <NavRow label={t('transparency.title')} onClick={onNavigateToTransparency} />
                        <NavRow label="Credits" onClick={onNavigateToCredits} />
                        <NavRow label={t('drawer.disclaimer')} onClick={() => setIsDisclaimerOpen(true)} />
                        {/* The intro only ever shows itself once, so this is the only way back
                            to it — and the only way anyone who skipped it can read it. */}
                        <NavRow label={t('settings.show_intro')} onClick={onShowIntro} />
                    </div>
                </section>

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
                    {devMode && <NavRow label={t('settings.cat_states')} onClick={onNavigateToCatStates} />}
                    {devMode && <NavRow label={t('settings.milk_tea_egg')} onClick={onNavigateToMilkTea} />}
                </div>
            </div>
        </div>
    );
};

export default Settings;
