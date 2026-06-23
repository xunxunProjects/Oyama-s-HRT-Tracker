import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { GEL_SITE_ORDER } from '../../../logic';
import { useHRTMode } from '../../contexts/HRTModeContext';
import CustomSelect from '../CustomSelect';

interface GelFieldsProps {
    gelSite: number;
    setGelSite: (val: number) => void;
    e2Dose: string;
    onE2Change: (val: string) => void;
    bioMultiplier?: number;
}

const GelFields: React.FC<GelFieldsProps> = ({
    gelSite,
    setGelSite,
    e2Dose,
    onE2Change,
    bioMultiplier
}) => {
    const { t } = useTranslation();
    const { isTransmasc } = useHRTMode();
    const equivLabelKey = isTransmasc ? 'field.dose_t' : 'field.dose_e2';

    const appliedVal = parseFloat(e2Dose);
    const hasDose = Number.isFinite(appliedVal) && appliedVal > 0;
    const absorbed = hasDose && bioMultiplier ? appliedVal * bioMultiplier : null;
    const bioPct = bioMultiplier ? (bioMultiplier * 100) : null;

    return (
        <div className="space-y-4">
            {/* Application site */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">{t('field.gel_site')}</label>
                <CustomSelect
                    value={String(gelSite)}
                    onChange={(val) => setGelSite(parseInt(val, 10))}
                    options={GEL_SITE_ORDER.map((siteKey, idx) => ({
                        value: String(idx),
                        label: t(`gel.site.${siteKey}`)
                    }))}
                />
                <p className="text-xs text-amber-700 dark:text-amber-400 pl-1">{t('beta.gel')}</p>
            </div>

            {/* Applied dose */}
            <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1">
                    {t(equivLabelKey)}
                </label>
                <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={e2Dose} onChange={e => onE2Change(e.target.value)}
                    className="w-full p-3 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] outline-none text-gray-900 dark:text-gray-100 font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.0"
                    style={{ fontSize: '16px' }}
                />
                {/* Absorbed estimate from site bioavailability */}
                {bioPct !== null && (
                    <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] pl-1">
                        {t('gel.bioavailability')}: {bioPct.toFixed(0)}%
                        {absorbed !== null && (
                            <> · {t('gel.absorbed')} ≈ {absorbed.toFixed(3).replace(/\.?0+$/, '')} mg</>
                        )}
                    </p>
                )}
            </div>
        </div>
    );
};

export default GelFields;
