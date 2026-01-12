import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { Copy } from 'lucide-react';

const PasswordDisplayModal = ({ isOpen, onClose, password }: { isOpen: boolean, onClose: () => void, password: string }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl shadow-md shadow-gray-900/10 w-full max-w-lg md:max-w-xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2 text-center transition-colors">{t('export.password_title')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center transition-colors">{t('export.password_desc')}</p>

                <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-xl mb-6 flex items-center justify-between transition-colors">
                    <span className="font-mono text-lg font-bold text-gray-800 dark:text-gray-200 tracking-wider transition-colors">{password}</span>
                    <button onClick={handleCopy} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition text-gray-600 dark:text-gray-400">
                        {copied ? <span className="text-xs font-bold text-green-600 dark:text-green-400">{t('qr.copied')}</span> : <Copy size={20} />}
                    </button>
                </div>

                <button onClick={onClose} className="w-full py-3.5 bg-[#f6c4d7] dark:bg-pink-700 text-white font-bold rounded-xl hover:bg-[#f3b4cb] dark:hover:bg-pink-600 transition">
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default PasswordDisplayModal;
