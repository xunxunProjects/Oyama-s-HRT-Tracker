import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester } from '../../../logic';

interface GelFieldsProps {
    gelSite: number;
    setGelSite: (val: number) => void;
    e2Dose: string;
    onE2Change: (val: string) => void;
}

const GelFields: React.FC<GelFieldsProps> = ({
    gelSite,
    setGelSite,
    e2Dose,
    onE2Change
}) => {
    const { t } = useTranslation();

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('field.gel_site')}</label>
                <div className="p-4 bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border border-dashed border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-[var(--radius-md)] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] text-sm font-medium select-none">
                    {t('gel.site_disabled')}
                </div>
                <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 p-3 rounded-[var(--radius-md)]">
                    {t('beta.gel')}
                </div>
            </div>

            <div className="space-y-2 col-span-2">
                <label className="block text-xs font-bold text-[var(--color-m3-accent)] uppercase tracking-wider">
                    {t('field.dose_e2')}
                </label>
                <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={e2Dose} onChange={e => onE2Change(e.target.value)}
                    className="w-full p-4 bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 border border-[var(--color-m3-outline-variant)] dark:border-rose-900/30 rounded-[var(--radius-lg)] focus:ring-2 focus:ring-[var(--color-m3-accent)]/30 outline-none font-bold text-[var(--color-m3-accent)] dark:text-rose-400 font-mono"
                    placeholder="0.0"
                />
            </div>
        </div>
    );
};

export default GelFields;
