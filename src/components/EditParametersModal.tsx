import React, { useState, useEffect, useCallback } from 'react';
import { X, RotateCcw, Save, ChevronDown, AlertTriangle, Info } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';
import { PKCustomParams, DEFAULT_PK_PARAMS } from '../../logic';

interface EditParametersModalProps {
    isOpen: boolean;
    onClose: () => void;
    pkParams: PKCustomParams | null;
    onSave: (params: PKCustomParams) => void;
    onReset: () => void;
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
            { key: 't_gel_F', labelKey: 'pk.t_gel_F', min: 0, max: 1, step: 0.001, precision: 3 },
            { key: 't_kClear', labelKey: 'pk.t_kClear', min: 0.001, max: 5, step: 0.001, precision: 4 },
            { key: 't_kClearInj', labelKey: 'pk.t_kClearInj', min: 0.001, max: 1, step: 0.001, precision: 4 },
        ],
    },
];

const EditParametersModal: React.FC<EditParametersModalProps> = ({
    isOpen,
    onClose,
    pkParams,
    onSave,
    onReset,
}) => {
    const { t } = useTranslation();
    useEscape(onClose, isOpen);

    // Local draft state — copy of pkParams or defaults
    const [draft, setDraft] = useState<PKCustomParams>(() => pkParams ? { ...DEFAULT_PK_PARAMS, ...pkParams } : { ...DEFAULT_PK_PARAMS });
    const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set(['e2_inj']));
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setDraft(pkParams ? { ...DEFAULT_PK_PARAMS, ...pkParams } : { ...DEFAULT_PK_PARAMS });
            setSaved(false);
        }
    }, [isOpen, pkParams]);

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
        onReset();
        // Keep modal open — the confirm dialog (z-100) appears above us (z-50).
        // If confirmed, pkParams becomes null → useEffect resets draft to defaults.
    };

    const isCustomized = (key: keyof PKCustomParams) => {
        return draft[key] !== DEFAULT_PK_PARAMS[key];
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="w-full md:max-w-lg safe-area-pb">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg flex flex-col max-h-[92vh] md:max-h-[85vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-neutral-800 flex-shrink-0">
                        <div>
                            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {t('pk.title')}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {t('pk.desc')}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Warning banner */}
                    <div className="mx-5 mt-4 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg p-3 flex-shrink-0">
                        <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-amber-800 dark:text-amber-300">{t('pk.warn')}</p>
                    </div>

                    {/* Scrollable content */}
                    <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
                        {SECTIONS.map(section => (
                            <div key={section.key} className="border border-gray-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                                <button
                                    onClick={() => toggleSection(section.key)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-neutral-800/50 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors text-start"
                                >
                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                        {t(section.titleKey)}
                                    </span>
                                    <ChevronDown
                                        size={15}
                                        className={`text-gray-400 transition-transform ${openSections.has(section.key) ? 'rotate-180' : ''}`}
                                    />
                                </button>

                                {openSections.has(section.key) && (
                                    <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                                        {section.fields.map(field => {
                                            const defVal = DEFAULT_PK_PARAMS[field.key] as number;
                                            const curVal = draft[field.key] as number;
                                            const changed = isCustomized(field.key);
                                            return (
                                                <div key={field.key} className="px-4 py-3">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                                            {t(field.labelKey)}
                                                            {changed && (
                                                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-pink-500 flex-shrink-0" title={t('pk.modified')} />
                                                            )}
                                                        </label>
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                                            {t('pk.default')}: {defVal.toFixed(field.precision)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            inputMode="decimal"
                                                            min={field.min}
                                                            max={field.max}
                                                            step={field.step}
                                                            value={curVal}
                                                            onChange={e => updateField(field.key, e.target.value, field.min, field.max)}
                                                            className="flex-1 text-sm px-3 py-2 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-pink-400 dark:focus:ring-pink-500 tabular-nums"
                                                        />
                                                        {changed && (
                                                            <button
                                                                onClick={() => setDraft(prev => ({ ...prev, [field.key]: defVal }))}
                                                                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                                                                title={t('pk.reset_field')}
                                                            >
                                                                <RotateCcw size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Info note */}
                        <div className="flex items-start gap-2 pt-1">
                            <Info size={13} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-gray-400 dark:text-gray-500">{t('pk.note')}</p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-neutral-800 flex-shrink-0">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        >
                            <RotateCcw size={15} />
                            {t('pk.reset')}
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
                            >
                                {t('btn.cancel')}
                            </button>
                            <button
                                onClick={handleSave}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-lg transition-colors"
                            >
                                <Save size={15} />
                                {saved ? t('pk.saved') : t('btn.save')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditParametersModal;
