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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200 p-4">
            <div className="bg-white dark:bg-zinc-900 rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg p-6 md:p-8 animate-in slide-in-from-bottom duration-300 transition-colors duration-300">
                <div className="flex flex-col items-center mb-6">
                    <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-3 transition-colors">
                        <AlertTriangle className="text-red-500" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white text-center transition-colors">{t('modal.estimate.title')}</h3>
                </div>

                <div className="text-sm text-zinc-500 dark:text-zinc-400 space-y-4 mb-8 leading-relaxed transition-colors">
                    <p>{t('modal.estimate.p1')}</p>
                    <p className="font-medium text-zinc-900 dark:text-zinc-200 bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/20">
                        {t('modal.estimate.p2')}
                    </p>
                    <p>{t('modal.estimate.p3')}</p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>,
        document.body
    );
};

export default EstimateInfoModal;
