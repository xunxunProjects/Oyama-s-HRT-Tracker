import React, { useState, useId } from 'react';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';
import { apiErrorCode } from '../services/apiClient';
import { settingsMuted } from '../components/SettingsListItem';
import { passwordStrength } from '../../passwordStrength';

const ChangePassword: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();
    const { changePassword } = useAuth();
    const [current, setCurrent] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirm, setConfirm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const id = useId();

    const muted = settingsMuted;
    const labelCls = `block text-xs font-medium mb-1.5 ${muted}`;

    // The server enforces the same rule; checking here keeps the feedback
    // local and worded in the reader's language.
    const strength = newPass.length >= 8 ? passwordStrength(newPass) : null;

    // A form, so Enter in the last field submits and password managers see
    // which field is which.
    const handleSubmit = async (ev: React.FormEvent) => {
        ev.preventDefault();
        if (!current || !newPass || !confirm) return;
        if (newPass !== confirm) {
            setError(t('pw.mismatch'));
            return;
        }
        if (newPass.length < 8) {
            setError(t('pw.too_short'));
            return;
        }
        if (strength === 'weak') {
            setError(t('pw.too_weak'));
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            await changePassword(current, newPass);
            onBack();
            // The page just closing said nothing about whether it worked, nor
            // that every other device had been signed out by it.
            showDialog('alert', t('account.change_password_done'), undefined, { title: t('account.change_password') });
        } catch (e: any) {
            // The worker's "Incorrect password" is English; say it in the
            // reader's language.
            setError(apiErrorCode(e) === 'INVALID_CREDENTIALS' ? t('account.current_password_wrong') : e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const errorId = `${id}-error`;

    return (
        <div className="relative pb-32">
            <PageHeader onBack={onBack} title={t('account.change_password')} />

            <div className={`${PAGE_COLUMN} mt-4 space-y-5 [&>*]:max-w-md`}>
                <div className="flex items-start gap-3">
                    <span className="icon-line text-sm leading-relaxed">
                        <Lock size={18} className={muted} />
                    </span>
                    <p className={`text-sm leading-relaxed ${muted}`}>{t('account.change_password_desc')}</p>
                </div>

                {/* Said before the change rather than discovered after it: the
                    cloud key comes from the password, so older backups stay
                    locked to the old one (AuthContext's changePassword), and
                    the worker signs out every other session. */}
                <p className="callout">{t('account.change_password_backups_note')}</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
                            {error}
                        </p>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label htmlFor={`${id}-current`} className={labelCls}>
                                {t('account.current_password')}
                            </label>
                            <input
                                id={`${id}-current`}
                                type="password"
                                value={current}
                                onChange={e => setCurrent(e.target.value)}
                                className="input-base"
                                autoComplete="current-password"
                                autoFocus
                                aria-describedby={error ? errorId : undefined}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${id}-new`} className={labelCls}>
                                {t('account.new_password')}
                            </label>
                            <input
                                id={`${id}-new`}
                                type="password"
                                value={newPass}
                                onChange={e => setNewPass(e.target.value)}
                                className="input-base"
                                autoComplete="new-password"
                                aria-describedby={[`${id}-rule`, error ? errorId : ''].filter(Boolean).join(' ')}
                            />
                            {/* The rule up front, not only as the error after Save. */}
                            <p id={`${id}-rule`} className={`mt-1.5 text-xs ${muted}`}>
                                {t('pw.too_short')}
                            </p>
                            {strength && (
                                <p
                                    className={`mt-1 text-xs ${
                                        strength === 'weak'
                                            ? 'text-[var(--danger)]'
                                            : strength === 'strong'
                                              ? 'text-[var(--accent-ink)]'
                                              : muted
                                    }`}
                                    aria-live="polite"
                                >
                                    {strength === 'weak'
                                        ? t('pw.strength_weak')
                                        : strength === 'strong'
                                          ? t('pw.strength_strong')
                                          : t('pw.strength_fair')}
                                </p>
                            )}
                        </div>
                        <div>
                            <label htmlFor={`${id}-confirm`} className={labelCls}>
                                {t('account.confirm_password')}
                            </label>
                            <input
                                id={`${id}-confirm`}
                                type="password"
                                value={confirm}
                                onChange={e => setConfirm(e.target.value)}
                                className="input-base"
                                autoComplete="new-password"
                                aria-describedby={error ? errorId : undefined}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={!current || !newPass || !confirm || isLoading || strength === 'weak'}
                        className="btn-primary w-full"
                    >
                        {isLoading && <Loader2 size={16} className="animate-spin" />}
                        {t('btn.save')}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChangePassword;
