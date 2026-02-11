import React from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { Route, Ester } from '../../../logic'; // Ester isn't really needed for Gel check but good for props consistency if extended

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
                <label className="block text-sm font-bold text-zinc-700">{t('field.gel_site')}</label>
                <div className="p-4 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl text-zinc-400 text-sm font-medium select-none">
                    {t('gel.site_disabled')}
                </div>
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                    {t('beta.gel')}
                </div>
            </div>

            <div className="space-y-2 col-span-2">
                <label className="block text-xs font-bold text-pink-400 uppercase tracking-wider">
                    {t('field.dose_e2')}
                </label>
                <input
                    type="number" inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={e2Dose} onChange={e => onE2Change(e.target.value)}
                    className="w-full p-4 bg-pink-50/50 dark:bg-pink-900/20 border border-pink-100 dark:border-pink-900/30 rounded-2xl focus:ring-2 focus:ring-pink-300/50 outline-none font-bold text-pink-500 dark:text-pink-400 font-mono"
                    placeholder="0.0"
                />
            </div>
        </div>
    );
};

export default GelFields;
