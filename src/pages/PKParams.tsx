import React, { useState, useCallback } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { RotateCcw, ChevronDown, AlertTriangle, Info } from 'lucide-react';
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

const divider = "border-b border-[var(--border)]";

const PKParamsPage: React.FC<PKParamsPageProps> = ({ pkParams, onSave, onReset, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();

    const [draft, setDraft] = useState<PKCustomParams>(() =>
        pkParams ? { ...DEFAULT_PK_PARAMS, ...pkParams } : { ...DEFAULT_PK_PARAMS }
    );
    const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['e2_inj']));
    const [saved, setSaved] = useState(false);

    const toggleSection = (key: SectionKey) => {
        setOpenSections(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const updateField = useCallback((key: keyof PKCustomParams, rawValue: string, min: number, max: number) => {
        const num = parseFloat(rawValue);
        if (!Number.isFinite(num)) return;
        setDraft(prev => ({ ...prev, [key]: Math.max(min, Math.min(max, num)) }));
    }, []);

    const handleSave = () => {
        onSave(draft);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleReset = () => {
        showDialog('confirm', t('pk.reset_confirm'), () => {
            setDraft({ ...DEFAULT_PK_PARAMS });
            onReset();
        }, { danger: true });
    };

    const isCustomized = (key: keyof PKCustomParams) => draft[key] !== DEFAULT_PK_PARAMS[key];

    return (
        <div className="relative pb-32">
            <PageHeader
                onBack={onBack}
                title={t('pk.title')}
                actions={pkParams && (
                    <span className="mr-2 text-xs font-medium text-[var(--warning)]">
                        {t('pk.customized')}
                    </span>
                )}
            />

            <div className={`${PAGE_COLUMN} mt-4`}>
                {/* Warning */}
                <div className="flex items-start gap-2 mb-6 pb-4 border-b border-[var(--border)]">
                    <span className="icon-line text-sm"><AlertTriangle size={13} className="text-[var(--warning)]" /></span>
                    <p className="text-sm text-[var(--text-muted)]">{t('pk.warn')}</p>
                </div>

                {/* Sections — flat, no cards */}
                {SECTIONS.map(section => (
                    <div key={section.key}>
                        <button
                            onClick={() => toggleSection(section.key)}
                            className={`w-full flex items-center justify-between py-4 ${divider} text-start`}
                        >
              <span className="text-[0.8125rem] font-semibold text-[var(--text-muted)]">
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
                                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" title={t('pk.modified')} />
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
                                                value={curVal}
                                                onChange={e => updateField(field.key, e.target.value, field.min, field.max)}
                                                className="w-28 px-2.5 py-1.5 bg-[var(--field)] border border-[var(--border)] rounded-md text-[var(--text)] outline-none focus:border-[var(--accent-ink)] tabular-nums"
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
                    <span className="icon-line text-xs"><Info size={13} className="text-[var(--text-muted)]" /></span>
                    <p className="text-xs text-[var(--text-muted)]">{t('pk.note')}</p>
                </div>

                {/* Save */}
                <button
                    onClick={handleSave}
                    className={`w-full flex items-center justify-between py-[18px] ${divider} text-start`}
                >
                    <span className="text-[0.9375rem] font-medium text-[var(--text)]">{t('btn.save')}</span>
                    {saved && (
                        <span className="text-xs text-[var(--status-positive)] font-medium">{t('pk.saved')}</span>
                    )}
                </button>

                {/* Reset all */}
                <button
                    onClick={handleReset}
                    className="w-full flex items-center gap-2 py-[18px] text-start"
                >
                    <RotateCcw size={14} className="text-[var(--danger)]" />
                    <span className="text-[0.9375rem] text-[var(--danger)]">{t('pk.reset')}</span>
                </button>
            </div>
        </div>
    );
};

export default PKParamsPage;
