import React, { useState, useEffect } from 'react';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { authService } from '../services/auth';

const DeleteAccount: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { deleteAccount, token } = useAuth();
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [backupCode, setBackupCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
    const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';
    const inputCls = `w-full px-4 py-3 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md focus:border-red-500 dark:focus:border-red-500 outline-none ${on} placeholder:text-[var(--color-m3-outline)] dark:placeholder:text-[var(--color-m3-dark-outline)]`;

    useEffect(() => {
        if (!token) return;
        authService.get2FAStatus(token)
            .then(s => setTotpEnabled(!!s.totp))
            .catch(() => {});
    }, [token]);

    const twoFAReady = !totpEnabled || (useBackup ? !!backupCode.trim() : code.length === 6);

    const handleSubmit = async () => {
        if (!password || !twoFAReady) return;
        setIsLoading(true);
        setError('');
        try {
            await deleteAccount(
                password,
                totpEnabled && !useBackup ? code : undefined,
                totpEnabled && useBackup ? backupCode.trim() : undefined,
            );
            // Account is gone and the auth context logs out; leave this view so
            // we don't linger on a delete page for a now-signed-out user.
            onBack();
        } catch (e: any) {
            const msg = e?.message || '';
            if (msg.includes('2FA')) {
                // Surface the 2FA field even if the status probe failed earlier.
                setTotpEnabled(true);
                setError(t('account.2fa_verify_failed'));
            } else {
                setError(msg);
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] px-6 md:px-10 pt-8 pb-3">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 -ml-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-low)] transition-colors"
                >
                    <ArrowLeft size={18} strokeWidth={1.5} className={`${muted} shrink-0`} />
                    <span className={`text-xl font-semibold ${on}`}>{t('account.delete_account')}</span>
                </button>
            </div>

            <div className="px-6 md:px-10 mt-2 max-w-md space-y-5">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className={`text-sm leading-relaxed ${muted}`}>{t('account.delete_account_desc')}</p>
                        <p className="text-sm font-medium text-red-600 dark:text-red-400 leading-relaxed">{t('account.delete_warning')}</p>
                    </div>
                </div>

                {error && (
                    <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
                )}

                <div>
                    <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.enter_password_confirm')}</label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className={inputCls}
                        autoFocus
                        style={{ fontSize: '16px' }}
                    />
                </div>

                {totpEnabled && (
                    useBackup ? (
                        <div>
                            <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('auth.backup_code_label')}</label>
                            <input
                                type="text"
                                value={backupCode}
                                onChange={e => setBackupCode(e.target.value.toUpperCase())}
                                className={`${inputCls} font-mono tracking-[0.1em] text-center`}
                                placeholder={t('auth.backup_code_placeholder')}
                                autoComplete="off"
                                style={{ fontSize: '16px' }}
                            />
                            <button type="button" onClick={() => { setUseBackup(false); setBackupCode(''); }}
                                className={`mt-2 text-xs ${muted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] transition-colors`}>
                                ← {t('account.2fa_code')}
                            </button>
                        </div>
                    ) : (
                        <div>
                            <label className={`block text-xs font-medium mb-1.5 ${muted}`}>{t('account.2fa_code')}</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                value={code}
                                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className={`${inputCls} font-mono tracking-[0.4em] text-center`}
                                placeholder="000000"
                                autoComplete="one-time-code"
                                style={{ fontSize: '16px' }}
                            />
                            <button type="button" onClick={() => { setUseBackup(true); setCode(''); }}
                                className={`mt-2 text-xs ${muted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] transition-colors`}>
                                {t('auth.use_backup_code')}
                            </button>
                        </div>
                    )
                )}

                <button
                    onClick={handleSubmit}
                    disabled={!password || !twoFAReady || isLoading}
                    className="w-full py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isLoading && <Loader2 size={15} className="animate-spin" />}
                    {t('account.delete_account')}
                </button>
            </div>
        </div>
    );
};

export default DeleteAccount;
