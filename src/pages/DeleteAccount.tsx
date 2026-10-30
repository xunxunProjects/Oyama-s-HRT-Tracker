import React, { useState, useEffect, useId } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { apiErrorCode } from '../services/apiClient';
import { Warning } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { authService } from '../services/auth';
import { BusyLabel } from '../components/StableLabel';

const DeleteAccount: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const { deleteAccount, token } = useAuth();
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [backupCode, setBackupCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [totpEnabled, setTotpEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const id = useId();

    const muted = 'text-[var(--text-muted)]';
    const labelCls = `block text-xs font-medium mb-1.5 ${muted}`;

    useEffect(() => {
        if (!token) return;
        authService
            .get2FAStatus(token)
            .then(s => setTotpEnabled(!!s.totp))
            .catch(() => {});
    }, [token]);

    const twoFAReady = !totpEnabled || (useBackup ? !!backupCode.trim() : code.length === 6);

    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
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
            // we don't linger on a delete page for a now-signed-out user, and
            // say it happened: the page simply vanishing left people unsure
            // whether it had.
            onBack();
            showDialog('alert', t('account.delete_done'), undefined, { title: t('account.delete_account') });
        } catch (e: any) {
            const code = apiErrorCode(e);
            if (code === 'TWO_FACTOR_REQUIRED' || code === 'TWO_FACTOR_INVALID') {
                // Surface the 2FA field even if the status probe failed earlier.
                setTotpEnabled(true);
                setError(t('account.2fa_verify_failed'));
            } else if (code === 'INVALID_CREDENTIALS') {
                setError(t('account.current_password_wrong'));
            } else {
                setError(e?.message || t('error.generic'));
            }
            setIsLoading(false);
        }
    };

    const errorId = `${id}-error`;
    const exportPath = [t('nav.settings'), t('settings.group.data'), t('export.title')].join(' › ');

    return (
        <div className="relative md:pb-32">
            <PageHeader onBack={onBack} title={t('account.delete_account')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                {/* What goes and what stays, said plainly before the password
                    is asked for. "All your data will be lost" was true of the
                    server and wrong about this device, where the records stay
                    filed under the account but are no longer shown once it is
                    gone, so the one way to keep them is to export first. */}
                <div className="flex items-start gap-3">
                    <span className="icon-line text-sm leading-relaxed">
                        <Warning size={18} className="text-[var(--danger)]" />
                    </span>
                    <div className="space-y-4 min-w-0">
                        <div className="space-y-1">
                            <p className={`text-sm leading-relaxed ${muted}`}>{t('account.delete_account_desc')}</p>
                            <p className="text-sm font-medium text-[var(--danger)] leading-relaxed">
                                {t('account.delete_warning')}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-[var(--text)]">{t('account.delete_server_title')}</p>
                            <ul className={`mt-1 list-disc ps-5 space-y-0.5 text-sm leading-relaxed ${muted}`}>
                                <li>{t('account.delete_server_backups')}</li>
                                <li>{t('account.delete_server_shares')}</li>
                                <li>{t('account.delete_server_avatar')}</li>
                                <li>{t('account.delete_server_signin')}</li>
                            </ul>
                        </div>
                        <div>
                            <p className="text-sm font-medium text-[var(--text)]">{t('account.delete_device_title')}</p>
                            <p className={`mt-1 text-sm leading-relaxed ${muted}`}>
                                {t('account.delete_device_desc').replace('{path}', exportPath)}
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
                            {error}
                        </p>
                    )}

                    <div>
                        <label htmlFor={`${id}-password`} className={labelCls}>
                            {t('account.enter_password_confirm')}
                        </label>
                        <input
                            id={`${id}-password`}
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="input-base"
                            autoComplete="current-password"
                            aria-describedby={error ? errorId : undefined}
                            autoFocus
                            style={{ fontSize: '16px' }}
                        />
                    </div>

                    {totpEnabled &&
                        (useBackup ? (
                            <div>
                                <label htmlFor={`${id}-backup`} className={labelCls}>
                                    {t('auth.backup_code_label')}
                                </label>
                                <input
                                    id={`${id}-backup`}
                                    type="text"
                                    value={backupCode}
                                    onChange={e => setBackupCode(e.target.value.toUpperCase())}
                                    className="input-base font-mono tracking-[0.1em] text-center"
                                    placeholder={t('auth.backup_code_placeholder')}
                                    autoComplete="off"
                                    aria-describedby={error ? errorId : undefined}
                                    style={{ fontSize: '16px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUseBackup(false);
                                        setBackupCode('');
                                    }}
                                    className={`mt-2 text-xs ${muted} hover:text-[var(--text)] transition-colors`}
                                >
                                    ← {t('account.2fa_code')}
                                </button>
                            </div>
                        ) : (
                            <div>
                                <label htmlFor={`${id}-code`} className={labelCls}>
                                    {t('account.2fa_code')}
                                </label>
                                <input
                                    id={`${id}-code`}
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]{6}"
                                    maxLength={6}
                                    value={code}
                                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="input-base font-mono tracking-[0.4em] text-center"
                                    placeholder="000000"
                                    autoComplete="one-time-code"
                                    aria-describedby={error ? errorId : undefined}
                                    style={{ fontSize: '16px' }}
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUseBackup(true);
                                        setCode('');
                                    }}
                                    className={`mt-2 text-xs ${muted} hover:text-[var(--text)] transition-colors`}
                                >
                                    {t('auth.use_backup_code')}
                                </button>
                            </div>
                        ))}

                    <button
                        type="submit"
                        disabled={!password || !twoFAReady || isLoading}
                        className="btn-danger w-full"
                    >
                        <BusyLabel busy={isLoading} size={15}>
                            {t('account.delete_account')}
                        </BusyLabel>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DeleteAccount;
