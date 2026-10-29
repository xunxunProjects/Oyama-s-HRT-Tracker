import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Ester, GEL_SITE_ORDER } from '../../../logic';
import { useHRTMode } from '../../contexts/HRTModeContext';
import CustomSelect from '../CustomSelect';
import GelDoseConverter from './GelDoseConverter';
import { refusedFieldProps } from './refusedField';

interface GelFieldsProps {
    ester: Ester;
    gelSite: number;
    setGelSite: (val: number) => void;
    e2Dose: string;
    onE2Change: (val: string) => void;
    bioMultiplier?: number;
    /** Save was refused for an empty or zero dose; see refusedFieldProps. */
    invalid?: boolean;
    errorId?: string;
}

const GelFields: React.FC<GelFieldsProps> = ({
    ester,
    gelSite,
    setGelSite,
    e2Dose,
    onE2Change,
    bioMultiplier,
    invalid,
    errorId,
}) => {
    const { t } = useTranslation();
    const { isTransmasc } = useHRTMode();
    // What goes in is the estradiol in the gel, not grams of gel or pumps,
    // and not an "equivalent" to convert to: the label says so.
    const equivLabelKey = isTransmasc ? 'field.dose_t' : 'field.gel_e2_applied';

    const appliedVal = parseFloat(e2Dose);
    const hasDose = Number.isFinite(appliedVal) && appliedVal > 0;
    const absorbed = hasDose && bioMultiplier ? appliedVal * bioMultiplier : null;
    const bioPct = bioMultiplier ? bioMultiplier * 100 : null;
    const siteLabelId = React.useId();
    const doseId = React.useId();

    return (
        <div className="space-y-4">
            {/* Application site */}
            <div className="space-y-1.5">
                <label id={siteLabelId} className="field-label">
                    {t('field.gel_site')}
                </label>
                <CustomSelect
                    labelledBy={siteLabelId}
                    value={String(gelSite)}
                    onChange={val => setGelSite(parseInt(val, 10))}
                    options={GEL_SITE_ORDER.map((siteKey, idx) => ({
                        value: String(idx),
                        label: t(`gel.site.${siteKey}`),
                    }))}
                />
            </div>

            {/* Applied dose */}
            <div className="space-y-1.5">
                <label htmlFor={doseId} className="field-label">
                    {t(equivLabelKey)}
                </label>
                <input
                    id={doseId}
                    {...refusedFieldProps(e2Dose, invalid, errorId)}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={e2Dose}
                    onChange={e => onE2Change(e.target.value)}
                    className="input-base w-full text-[var(--text)] font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="0.0"
                    style={{ fontSize: '16px' }}
                />
                {/* Absorbed estimate from site bioavailability */}
                {bioPct !== null && (
                    <p className="field-hint">
                        {t('gel.bioavailability')}: {bioPct.toFixed(0)}%
                        {absorbed !== null && (
                            <>
                                , {t('gel.absorbed')} ≈ {absorbed.toFixed(3).replace(/\.?0+$/, '')} mg
                            </>
                        )}
                    </p>
                )}
                {/* Gel is sold by rulers and pumps, but the model takes mg. */}
                {ester === Ester.E2 && <GelDoseConverter onApply={onE2Change} />}
            </div>
        </div>
    );
};

export default GelFields;
