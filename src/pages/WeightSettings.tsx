import React, { useState, useEffect } from 'react';
import { ArrowLeft, Scale, Info } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';

interface WeightSettingsProps {
    weight: number;
    onSave: (weight: number) => void;
    onBack: () => void;
}

const WeightSettings: React.FC<WeightSettingsProps> = ({ weight, onSave, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [weightStr, setWeightStr] = useState(weight.toString());

    useEffect(() => {
        setWeightStr(weight.toString());
    }, [weight]);

    const handleSave = () => {
        const val = parseFloat(weightStr);
        if (!isNaN(val) && val > 0) {
            onSave(val);
            onBack();
        } else {
            showDialog('alert', t('error.nonPositive'));
        }
    };

    return (
        <div className="relative space-y-4 pt-6 pb-32">
            <div className="px-6 md:px-8 mb-2">
                <div className="w-full p-4 rounded-lg bg-white dark:bg-neutral-900 flex items-center gap-3 border border-gray-200 dark:border-neutral-800">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="p-2 rounded-md bg-pink-50 dark:bg-pink-900/20">
                            <Scale size={18} className="text-pink-500 dark:text-pink-400" />
                        </div>
                        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                            {t('status.weight')}
                        </h2>
                    </div>
                </div>
            </div>

            <div className="mx-6 md:mx-8 space-y-4">
                <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-6">
                    <div className="flex justify-center mb-6">
                        <div className="flex items-end gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                value={weightStr}
                                onChange={(e) => setWeightStr(e.target.value)}
                                className="font-display text-5xl font-black text-[var(--color-m3-primary)] tabular-nums w-28 text-center bg-transparent border-b-2 border-gray-200 dark:border-neutral-700 focus:border-[var(--color-m3-primary)] outline-none transition-colors pb-1"
                                placeholder="0.0"
                                autoFocus
                            />
                            <div className="text-2xl font-medium text-gray-500 dark:text-gray-400 pb-2">kg</div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-neutral-800 p-3.5 rounded-lg flex gap-2.5 items-start border border-gray-200 dark:border-neutral-700">
                        <Info className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                            {t('modal.weight.desc')}
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleSave}
                    className="w-full py-3 text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-lg transition"
                >
                    {t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default WeightSettings;
