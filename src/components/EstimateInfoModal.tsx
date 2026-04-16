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
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60] p-0 md:p-4">
            <div className="w-full md:max-w-sm safe-area-pb">
                <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg p-6 md:p-5 max-h-[88vh] overflow-y-auto">
                <div className="flex flex-col items-center mb-4">
                    <AlertTriangle className="text-amber-500 mb-2" size={20} />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 text-center">{t('modal.estimate.title')}</h3>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3 mb-5 leading-relaxed">
                    <p>{t('modal.estimate.p1')}</p>
                    <p className="font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-neutral-800 p-2.5 rounded-md border border-gray-200 dark:border-neutral-700">
                        {t('modal.estimate.p2')}
                    </p>
                    <p>{t('modal.estimate.p3')}</p>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 md:py-2 text-base md:text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-xl md:rounded-md"
                >
                    {t('btn.ok')}
                </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EstimateInfoModal;
