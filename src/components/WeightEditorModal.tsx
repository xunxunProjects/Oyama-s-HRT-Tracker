import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { Info } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const WeightEditorModal = ({ isOpen, onClose, currentWeight, onSave }: any) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const [weightStr, setWeightStr] = useState(currentWeight.toString());

    useEscape(onClose, isOpen);

    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => setWeightStr(currentWeight.toString()), [currentWeight, isOpen]);

    const handleSave = () => {
        if (isSaving) return;
        setIsSaving(true);
        const val = parseFloat(weightStr);
        if (!isNaN(val) && val > 0) {
            onSave(val);
            onClose();
        } else {
            showDialog('alert', t('error.nonPositive'));
            setIsSaving(false);
        }
        setIsSaving(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
            <div className="w-full md:max-w-sm safe-area-pb">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-5 max-h-[88vh] overflow-y-auto">
                    <h3 className="text-lg md:text-base font-semibold text-gray-900 dark:text-gray-100 mb-5 md:mb-4">{t('modal.weight.title')}</h3>

                    <div className="flex justify-center mb-6 md:mb-5">
                        <div className="flex items-end gap-2">
                            <input
                                type="number"
                                inputMode="decimal"
                                value={weightStr}
                                onChange={(e) => setWeightStr(e.target.value)}
                                className="font-display text-12xl md:text-base font-black text-[var(--color-m3-primary)] tabular-nums w-20 md:w-16 text-center bg-transparent border-b-2 border-gray-200 dark:border-neutral-700 focus:border-[var(--color-m3-primary)] outline-none transition-colors pb-1"
                                placeholder="0.0"
                                autoFocus
                            />
                            <div className="text-2xl md:text-base font-medium text-gray-500 dark:text-gray-400 pb-2 md:pb-1">kg</div>
                        </div>
                    </div>

                    <div className="bg-gray-50 dark:bg-neutral-800 p-3.5 md:p-3 rounded-lg mb-6 md:mb-5 flex gap-2.5 items-start border border-gray-200 dark:border-neutral-700">
                        <Info className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" />
                        <p className="text-sm md:text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                            {t('modal.weight.desc')}
                        </p>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <button
                            onClick={onClose}
                            className="flex-1 py-3 md:py-2 text-base md:text-sm font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-neutral-600 rounded-xl md:rounded-md"
                        >
                            {t('btn.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`flex-1 py-3 md:py-2 text-base md:text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-xl md:rounded-md transition ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {isSaving ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    {t('btn.save')}
                                </span>
                            ) : t('btn.save')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeightEditorModal;
