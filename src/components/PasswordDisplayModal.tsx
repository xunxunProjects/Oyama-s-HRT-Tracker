import React, { useState } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { Copy } from 'lucide-react';
import { useEscape } from '../hooks/useEscape';

const PasswordDisplayModal = ({ isOpen, onClose, password }: { isOpen: boolean, onClose: () => void, password: string }) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);

    useEscape(onClose, isOpen);

    const handleCopy = () => {
        navigator.clipboard.writeText(password);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-[60] animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 rounded-[24px] shadow-xl border border-zinc-200 dark:border-zinc-800 w-full max-w-lg md:max-w-xl p-6 md:p-8 animate-in slide-in-from-bottom duration-300 safe-area-pb transition-colors duration-300">
                <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2 text-center tracking-tight transition-colors">{t('export.password_title')}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-8 text-center transition-colors leading-relaxed">{t('export.password_desc')}</p>

                <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 p-5 rounded-2xl mb-8 flex items-center justify-between transition-colors">
                    <span className="font-mono text-xl font-bold text-zinc-900 dark:text-white tracking-widest transition-colors select-all">{password}</span>
                    <button onClick={handleCopy} className="p-2.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full transition text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
                        {copied ? <span className="text-xs font-bold text-emerald-500">{t('qr.copied')}</span> : <Copy size={20} />}
                    </button>
                </div>

                <button onClick={onClose} className="w-full py-3.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-200 transition shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10">
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default PasswordDisplayModal;
