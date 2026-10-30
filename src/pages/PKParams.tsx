import React, { useState } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Undo, ChevronDown, Warning, Info, Check } from '../components/icons';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { PKCustomParams, DEFAULT_PK_PARAMS } from '../../logic';

interface PKParamsPageProps {
    pkParams: PKCustomParams | null;
    onSave: (params: PKCustomParams) => void;
    onReset: () => void;
    onBack: () => void;
}

type SectionKey = 'e2_inj' | 'e2_oral_sl' | 'e2_gel' | 'e2_core' | 't_inj' | 't_other';

interface FieldDef {
    key: keyof PKCustomParams;
    labelKey: string;
    min: number;
    max: number;
    step: number;
    precision: number;
}

const SECTIONS: { key: SectionKey; titleKey: string; fields: FieldDef[] }[] = [
    {
        key: 'e2_inj',
        titleKey: 'pk.group.e2_inj',
        fields: [
            { key: 'e2_ff_EB', labelKey: 'pk.e2_ff.EB', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_ff_EV', labelKey: 'pk.e2_ff.EV', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_ff_EC', labelKey: 'pk.e2_ff.EC', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_ff_EN', labelKey: 'pk.e2_ff.EN', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_ff_EU', labelKey: 'pk.e2_ff.EU', min: 0, max: 1, step: 0.001, precision: 4 },
        ],
    },
    {
        key: 'e2_oral_sl',
        titleKey: 'pk.group.e2_oral_sl',
        fields: [
            { key: 'e2_oral_bio', labelKey: 'pk.e2_oral_bio', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_sl_quick', labelKey: 'pk.sl_theta.quick', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_sl_casual', labelKey: 'pk.sl_theta.casual', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_sl_standard', labelKey: 'pk.sl_theta.standard', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 'e2_sl_strict', labelKey: 'pk.sl_theta.strict', min: 0, max: 1, step: 0.001, precision: 4 },
        ],
    },
    {
        key: 'e2_gel',
        titleKey: 'pk.group.e2_gel',
        fields: [
            { key: 'e2_gel_arm', labelKey: 'pk.e2_gel.arm', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 'e2_gel_thigh', labelKey: 'pk.e2_gel.thigh', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 'e2_gel_scrotal', labelKey: 'pk.e2_gel.scrotal', min: 0, max: 1, step: 0.001, precision: 3 },
        ],
    },
    {
        key: 'e2_core',
        titleKey: 'pk.group.e2_core',
        fields: [
            { key: 'e2_kClear', labelKey: 'pk.e2_kClear', min: 0.001, max: 5, step: 0.001, precision: 4 },
            { key: 'e2_kClearInj', labelKey: 'pk.e2_kClearInj', min: 0.001, max: 1, step: 0.001, precision: 4 },
        ],
    },
    {
        key: 't_inj',
        titleKey: 'pk.group.t_inj',
        fields: [
            { key: 't_ff_TC', labelKey: 'pk.t_ff.TC', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 't_ff_TE', labelKey: 'pk.t_ff.TE', min: 0, max: 1, step: 0.001, precision: 4 },
            { key: 't_ff_TU', labelKey: 'pk.t_ff.TU', min: 0, max: 1, step: 0.001, precision: 4 },
        ],
    },
    {
        key: 't_other',
        titleKey: 'pk.group.t_other',
        fields: [
            { key: 't_gel_arm', labelKey: 'pk.t_gel.arm', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 't_gel_thigh', labelKey: 'pk.t_gel.thigh', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 't_gel_scrotal', labelKey: 'pk.t_gel.scrotal', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 't_kClear', labelKey: 'pk.t_kClear', min: 0.001, max: 5, step: 0.001, precision: 4 },
            { key: 't_kClearInj', labelKey: 'pk.t_kClearInj', min: 0.001, max: 1, step: 0.001, precision: 4 },
        ],
    },
];

const divider = 'border-b-(length:--hairline) border-[var(--border)]';

const FIELDS = SECTIONS.flatMap(s => s.fields);
const clampTo = (f: FieldDef, n: number) => Math.max(f.min, Math.min(f.max, n));

const PKParamsPage: React.FC<PKParamsPageProps> = ({ pkParams, onSave, onReset, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();

    const [draft, setDraft] = useState<PKCustomParams>(() =>
        pkParams ? { ...DEFAULT_PK_PARAMS, ...pkParams } : { ...DEFAULT_PK_PARAMS },
    );
    // What a field shows while it is being typed in. The number behind it is
    // read in, and clamped, when the field is left, so clearing a field to
    // retype it doesn't snap back to 0 mid-edit.
    const [text, setText] = useState<Partial<Record<keyof PKCustomParams, string>>>({});
    const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['e2_inj']));
    const [saved, setSaved] = useState(false);

    const savedParams: PKCustomParams = pkParams ? { ...DEFAULT_PK_PARAMS, ...pkParams } : DEFAULT_PK_PARAMS;

    const toggleSection = (key: SectionKey) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    // The draft with every half-typed field read in and clamped; a field
    // left empty or unreadable keeps the value it had.
    const settle = (): PKCustomParams => {
        const next = { ...draft };
        for (const f of FIELDS) {
            const raw = text[f.key];
            if (raw === undefined) continue;
            const num = parseFloat(raw);
            if (Number.isFinite(num)) next[f.key] = clampTo(f, num);
        }
        return next;
    };

    const commitField = (f: FieldDef) => {
        if (text[f.key] === undefined) return;
        setDraft(settle());
        setText(prev => {
            const next = { ...prev };
            delete next[f.key];
            return next;
        });
    };

    const settled = settle();
    const dirty = FIELDS.some(f => settled[f.key] !== savedParams[f.key]);

    const handleSave = () => {
        setDraft(settled);
        setText({});
        onSave(settled);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    // Edits only take effect on Save, so leaving with some unsaved asks first
    // instead of dropping them without a word. This covers the back arrow
    // only: the bottom nav and the sidebar switch views in App, which does
    // not ask the page first, so leaving that way still drops the edits.
    const handleBack = () => {
        if (!dirty) {
            onBack();
            return;
        }
        showDialog('confirm', t('pk.discard_confirm'), onBack, {
            title: t('pk.discard_title'),
            confirmLabel: t('pk.discard'),
        });
    };

    const handleReset = () => {
        showDialog(
            'confirm',
            t('pk.reset_confirm'),
            () => {
                setDraft({ ...DEFAULT_PK_PARAMS });
                setText({});
                onReset();
            },
            { danger: true },
        );
    };

    const isCustomized = (key: keyof PKCustomParams) => draft[key] !== DEFAULT_PK_PARAMS[key];

    return (
        <div className="relative md:pb-32">
            <PageHeader
                onBack={handleBack}
                title={t('pk.title')}
                actions={
                    pkParams && (
                        <span className="mr-2 text-xs font-medium text-[var(--warning)]">{t('pk.customized')}</span>
                    )
                }
            />

            <div className={`${PAGE_COLUMN} mt-4`}>
                {/* Warning */}
                <div className="flex items-start gap-2 mb-6 pb-4 border-b-(length:--hairline) border-[var(--border)]">
                    <span className="icon-line text-sm">
                        <Warning size={13} className="text-[var(--warning)]" />
                    </span>
                    <p className="text-sm text-[var(--text-muted)]">{t('pk.warn')}</p>
                </div>

                {/* Sections — flat, no cards */}
                {SECTIONS.map(section => (
                    <div key={section.key}>
                        <button
                            onClick={() => toggleSection(section.key)}
                            className={`w-full flex items-center justify-between py-4 ${divider} text-start`}
                        >
                            <span className="text-xs font-semibold text-[var(--text-muted)]">
                                {t(section.titleKey)}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`chev text-[var(--text-muted)] ${openSections.has(section.key) ? 'rotate-180' : ''}`}
                            />
                        </button>

                        <div className="disclosure" data-open={openSections.has(section.key)}>
                            <div className="disclosure-inner">
                                {section.fields.map(field => {
                                    const defVal = DEFAULT_PK_PARAMS[field.key] as number;
                                    const curVal = draft[field.key] as number;
                                    const changed = isCustomized(field.key);
                                    return (
                                        <div key={field.key} className={`flex items-center gap-3 py-3 ${divider}`}>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm text-[var(--text)]">
                                                        {t(field.labelKey)}
                                                    </span>
                                                    {changed && (
                                                        <span className="text-xs text-[var(--accent-ink)]">
                                                            {t('pk.modified')}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-[var(--text-muted)]">
                                                    {t('pk.default')}: {defVal.toFixed(field.precision)}
                                                </span>
                                            </div>
                                            <input
                                                type="number"
                                                inputMode="decimal"
                                                min={field.min}
                                                max={field.max}
                                                step={field.step}
                                                value={text[field.key] ?? String(curVal)}
                                                onChange={e => {
                                                    const raw = e.target.value;
                                                    setText(prev => ({ ...prev, [field.key]: raw }));
                                                }}
                                                onBlur={() => commitField(field)}
                                                aria-label={t(field.labelKey)}
                                                className="input-base w-28 text-[var(--text)] tabular-nums"
                                                style={{ fontSize: '16px' }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}

                {/* Info note */}
                <div className="flex items-start gap-2 pt-4 pb-2">
                    <span className="icon-line text-xs">
                        <Info size={13} className="text-[var(--text-muted)]" />
                    </span>
                    <p className="text-xs text-[var(--text-muted)]">{t('pk.note')}</p>
                </div>

                {/* Save: the page's one primary action, above Reset, and only
                    live once something differs from what is saved. For a
                    moment after saving it says so instead, still disabled,
                    since there is nothing new to save. */}
                <button onClick={handleSave} disabled={!dirty} className="btn-primary w-full mt-4">
                    {saved && !dirty ? (
                        <>
                            <Check size={14} />
                            {t('pk.saved')}
                        </>
                    ) : (
                        t('btn.save')
                    )}
                </button>

                {/* Reset all */}
                <button onClick={handleReset} className="w-full flex items-center gap-2 py-[18px] text-start">
                    <Undo size={14} className="text-[var(--danger)]" />
                    <span className="text-sm text-[var(--danger)]">{t('pk.reset')}</span>
                </button>
            </div>
        </div>
    );
};

export default PKParamsPage;
