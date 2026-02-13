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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate safe-area-pb transition-colors duration-300">
                <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-2 text-center tracking-tight transition-colors">{t('export.password_title')}</h3>
                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-5 text-center transition-colors leading-relaxed">{t('export.password_desc')}</p>

                <div className="bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] p-3.5 rounded-[var(--radius-md)] mb-5 flex items-center justify-between transition-colors">
                    <span className="font-mono text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-widest transition-colors select-all">{password}</span>
                    <button onClick={handleCopy} className="p-2.5 hover:bg-[var(--color-m3-surface-container-high)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] rounded-[var(--radius-full)] transition text-[var(--color-m3-on-surface-variant)] hover:text-[var(--color-m3-on-surface)]">
                        {copied ? <span className="text-xs font-bold text-emerald-500">{t('qr.copied')}</span> : <Copy size={20} />}
                    </button>
                </div>

                <button onClick={onClose} className="w-full py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition shadow-[var(--shadow-m3-1)]">
                    {t('btn.ok')}
                </button>
            </div>
        </div>
    );
};

export default PasswordDisplayModal;
