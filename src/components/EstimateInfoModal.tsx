import { createPortal } from 'react-dom';
import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { AlertTriangle } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const EstimateInfoModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate transition-colors duration-300">
                <div className="flex flex-col items-center mb-4">
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-m3-accent-container)] dark:bg-rose-900/20 flex items-center justify-center mb-2 transition-colors">
                        <AlertTriangle className="text-[var(--color-m3-accent)]" size={20} />
                    </div>
                    <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-center transition-colors">{t('modal.estimate.title')}</h3>
                </div>

                <div className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] space-y-3 mb-5 leading-relaxed transition-colors">
                    <p>{t('modal.estimate.p1')}</p>
                    <p className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] bg-[var(--color-m3-accent-container)] dark:bg-rose-900/10 p-2.5 rounded-[var(--radius-sm)] border border-[var(--color-m3-outline-variant)] dark:border-rose-900/20">
                        {t('modal.estimate.p2')}
                    </p>
                    <p>{t('modal.estimate.p3')}</p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition shadow-[var(--shadow-m3-1)]"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>,
        document.body
    );
};

export default EstimateInfoModal;
