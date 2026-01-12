import React from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { AlertTriangle } from 'lucide-react';

const DisclaimerModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
    const { t } = useTranslation();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200 p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg p-6 md:p-8 animate-in slide-in-from-bottom duration-300 transition-colors duration-300">
                <div className="flex flex-col items-center mb-4">
                    <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3 transition-colors">
                        <AlertTriangle className="text-amber-500" size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white text-center transition-colors">{t('disclaimer.title')}</h3>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-300 space-y-3 mb-8 leading-relaxed transition-colors">
                    <p>{t('disclaimer.text.intro')}</p>
                    <ul className="list-disc pl-5 space-y-2">
                        <li>{t('disclaimer.text.point1')}</li>
                        <li>{t('disclaimer.text.point2')}</li>
                        <li>{t('disclaimer.text.point3')}</li>
                    </ul>
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-white/90 transition"
                >
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default DisclaimerModal;






