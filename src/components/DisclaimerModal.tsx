import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { AlertTriangle } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const DisclaimerModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate transition-colors duration-300">
                <div className="flex flex-col items-center mb-4">
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-2 transition-colors">
                        <AlertTriangle className="text-amber-500" size={20} />
                    </div>
                    <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-center transition-colors">{t('disclaimer.title')}</h3>
                </div>

                <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] space-y-2 mb-5 leading-relaxed transition-colors">
                    <p>{t('disclaimer.text.intro')}</p>
                    <ul className="list-disc pl-5 space-y-2 marker:text-[var(--color-m3-outline-variant)] dark:marker:text-[var(--color-m3-dark-outline-variant)]">
                        <li>{t('disclaimer.text.point1')}</li>
                        <li>{t('disclaimer.text.point2')}</li>
                        <li>{t('disclaimer.text.point3')}</li>
                    </ul>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition shadow-[var(--shadow-m3-1)]"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default DisclaimerModal;
