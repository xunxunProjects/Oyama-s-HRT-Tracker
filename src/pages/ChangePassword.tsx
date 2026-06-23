import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

const ChangePassword: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { changePassword } = useAuth();
    const [current, setCurrent] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirm, setConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
    const inputCls = `w-full px-4 py-3 text-sm font-mono bg-white dark:bg-neutral-900 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg focus:border-[var(--color-m3-primary)] focus:ring-1 focus:ring-[var(--color-m3-primary)] outline-none transition-colors ${on} placeholder-[var(--color-m3-outline)] dark:placeholder-[var(--color-m3-dark-outline)]`;

    const handleSubmit = async () => {
        if (!current || !newPass || !confirm) return;
        if (newPass !== confirm) { setError('New passwords do not match'); return; }
        if (newPass.length < 8) { setError('Password must be at least 8 characters'); return; }

        setIsLoading(true);
        setError('');
        try {
            await changePassword(current, newPass);
            onBack();
        } catch (e: any) {
            setError(e.message);
        } finally {
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
                    <span className={`text-xl font-semibold ${on}`}>{t('account.change_password')}</span>
                </button>
            </div>

            <div className="px-6 md:px-8 mt-4 max-w-md space-y-5">
                <p className={`text-sm leading-relaxed ${muted}`}>{t('account.change_password_desc')}</p>

                {error && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.current_password')}</label>
                        <input type="password" value={current} onChange={e => setCurrent(e.target.value)} className={inputCls} autoFocus />
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.new_password')}</label>
                        <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} className={inputCls} />
                    </div>
                    <div>
                        <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.confirm_password')}</label>
                        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={!current || !newPass || !confirm || isLoading}
                    className="w-full py-3 text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isLoading ? '...' : t('btn.save')}
                </button>
            </div>
        </div>
    );
};

export default ChangePassword;
