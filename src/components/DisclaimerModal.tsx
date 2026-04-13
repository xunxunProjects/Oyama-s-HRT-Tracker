import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { AlertTriangle } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const DisclaimerModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();

    useEscape(onClose, isOpen);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-[60] p-0 md:p-4">
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-t-2xl md:rounded-xl shadow-lg w-full max-w-sm p-5 max-h-[88vh] overflow-y-auto safe-area-pb">
                <div className="flex flex-col items-center mb-4">
                    <AlertTriangle className="text-amber-500 mb-2" size={20} />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 text-center">{t('disclaimer.title')}</h3>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-2 mb-5 leading-relaxed">
                    <p>{t('disclaimer.text.intro')}</p>
                    <ul className="list-disc pl-5 space-y-2 marker:text-gray-400 dark:marker:text-gray-500">
                        <li>{t('disclaimer.text.point1')}</li>
                        <li>{t('disclaimer.text.point2')}</li>
                        <li>{t('disclaimer.text.point3')}</li>
                    </ul>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-2.5 text-sm font-medium bg-pink-600 hover:bg-pink-700 text-white rounded-md"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default DisclaimerModal;
