import React, { useState, useEffect } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { apiErrorCode } from '../services/apiClient';
import { AlertTriangle, Loader2 } from 'lucide-react';
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

    const on = 'text-[var(--text)]';
    const muted = 'text-[var(--text-muted)]';
    const inputCls = `w-full px-4 py-3 text-sm bg-[var(--field)] border border-[var(--border)] rounded-md focus:border-[var(--danger)] outline-none ${on} placeholder:text-[var(--text-muted)]`;

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
            const code = apiErrorCode(e);
            if (code === 'TWO_FACTOR_REQUIRED' || code === 'TWO_FACTOR_INVALID') {
                // Surface the 2FA field even if the status probe failed earlier.
                setTotpEnabled(true);
                setError(t('account.2fa_verify_failed'));
            } else {
                setError(e?.message || t('error.generic'));
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('account.delete_account')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                <div className="flex items-start gap-3">
                    <span className="icon-line text-sm leading-relaxed"><AlertTriangle size={18} className="text-[var(--danger)]" /></span>
                    <div className="space-y-1">
                        <p className={`text-sm leading-relaxed ${muted}`}>{t('account.delete_account_desc')}</p>
                        <p className="text-sm font-medium text-[var(--danger)] leading-relaxed">{t('account.delete_warning')}</p>
                    </div>
                </div>

                {error && (
                    <p className="text-sm text-[var(--danger)]">{error}</p>
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
                                className={`mt-2 text-xs ${muted} hover:text-[var(--text)] transition-colors`}>
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
                                className={`mt-2 text-xs ${muted} hover:text-[var(--text)] transition-colors`}>
                                {t('auth.use_backup_code')}
                            </button>
                        </div>
                    )
                )}

                <button
                    onClick={handleSubmit}
                    disabled={!password || !twoFAReady || isLoading}
                    className="btn-danger w-full"
                >
                    {isLoading && <Loader2 size={15} className="animate-spin" />}
                    {t('account.delete_account')}
                </button>
            </div>
        </div>
    );
};

export default DeleteAccount;
