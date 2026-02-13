import React, { useState, useEffect } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useEscape } from '../hooks/useEscape';

const PasswordInputModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: (pw: string) => void }) => {
    const { t } = useTranslation();
    const [password, setPassword] = useState("");

    useEscape(onClose, isOpen);

    useEffect(() => {
        if (isOpen) setPassword("");
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200 p-6">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm p-6 animate-m3-decelerate safe-area-pb transition-colors duration-300">
                <h3 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mb-2 text-center tracking-tight transition-colors">{t('import.password_title')}</h3>
                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-5 text-center transition-colors leading-relaxed">{t('import.password_desc')}</p>

                <input
                    type="text"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full p-3 text-sm bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-teal-400 outline-none font-mono text-center mb-5 text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] transition-all placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)]"
                    placeholder="Password"
                    autoFocus
                />

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-[var(--color-m3-primary)] dark:text-teal-400 rounded-[var(--radius-full)] hover:bg-[var(--color-m3-primary-container)]/40 dark:hover:bg-teal-900/20 transition-all">{t('btn.cancel')}</button>
                    <button
                        onClick={() => onConfirm(password)}
                        disabled={!password}
                        className="px-5 py-2.5 text-sm bg-[var(--color-m3-primary)] dark:bg-teal-600 text-[var(--color-m3-on-primary)] font-bold rounded-[var(--radius-full)] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow-m3-1)]"
                    >
                        {t('btn.ok')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PasswordInputModal;
