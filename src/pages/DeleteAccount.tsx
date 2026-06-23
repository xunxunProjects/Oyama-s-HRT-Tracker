import React, { useState } from 'react';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

const DeleteAccount: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { deleteAccount } = useAuth();
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

    const handleSubmit = async () => {
        if (!password) return;
        setIsLoading(true);
        setError('');
        try {
            await deleteAccount(password);
            // Account is gone and the auth context logs out; leave this view so
            // we don't linger on a delete page for a now-signed-out user.
            onBack();
        } catch (e: any) {
            setError(e.message);
            setIsLoading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-8 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                >
                    <ArrowLeft size={18} className={`${muted} shrink-0`} />
                    <span className="text-xl font-semibold text-red-600 dark:text-red-400">{t('account.delete_account')}</span>
                </button>
            </div>

            <div className="px-6 md:px-8 mt-4 max-w-md space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-900/30">
                    <AlertTriangle size={18} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className={`text-sm leading-relaxed ${muted}`}>{t('account.delete_account_desc')}</p>
                        <p className="text-sm font-semibold text-red-600 dark:text-red-400 leading-relaxed">{t('account.delete_warning')}</p>
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div>
                    <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.enter_password_confirm')}</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={`w-full px-4 py-3 text-sm font-mono bg-white dark:bg-neutral-900 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-colors ${on} placeholder-[var(--color-m3-outline)] dark:placeholder-[var(--color-m3-dark-outline)]`}
                        autoFocus
                    />
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!password || isLoading}
                    className="w-full py-3 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? '...' : t('account.delete_account')}
                </button>
            </div>
        </div>
    );
};

export default DeleteAccount;
