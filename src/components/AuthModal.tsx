import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Loader2, Fingerprint } from 'lucide-react';
import ShieldIcon from './ShieldIcon';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { authService, serializeAssertionCredential, b64url2ab } from '../services/auth';
import { apiErrorCode } from '../services/apiClient';
import { useEscape } from '../hooks/useEscape';
import { getShareCopy } from '../i18n/share';
import { passwordStrength } from '../../passwordStrength';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    /**
     * What asked for the sign-in, explained under the title. Opened from Share,
     * the modal used to say only "Sign In", which read as the app demanding an
     * account rather than as the one feature that needs one.
     */
    reason?: 'share';
    /**
     * Runs after a sign-in or sign-up has gone through and the modal has
     * closed, so whoever opened it can carry on with what the person was
     * doing instead of leaving them to find the button again.
     */
    onSuccess?: () => void;
}

/**
 * The words for a failed sign-in. The worker answers in English, and showing
 * its message as it came put "Invalid credentials" in front of every reader.
 * The two failures a person causes by typing get the translated line; anything
 * else keeps the server's message, which is at least specific.
 */
export const describeAuthError = (err: unknown, t: (key: string) => string): string => {
    const code = apiErrorCode(err);
    if (code === 'INVALID_CREDENTIALS') return t('auth.invalid_credentials');
    if (code === 'TWO_FACTOR_INVALID') return t('account.2fa_verify_failed');
    return (err instanceof Error && err.message) || t('error.generic');
};

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, reason, onSuccess }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [needsTOTP, setNeedsTOTP] = useState(false);
    const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'passkey' | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [backupCode, setBackupCode] = useState('');
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    // The password the server accepted before it asked for a second factor.
    // The passkey retry button needs it too, or that sign-in leaves this
    // device without a cloud key and sync stuck on locked.
    const acceptedPasswordRef = useRef<string | null>(null);
    const usernameRef = useRef<HTMLInputElement>(null);
    const id = useId();

    // Registering is when a weak password becomes permanent: no reset brings
    // back the backups it encrypts. The worker refuses the same passwords;
    // this hint says why before the round trip.
    const strength = !isLogin && password.length >= 8 ? passwordStrength(password) : null;

    const { login, register, loginWithToken } = useAuth();
    const { t, lang } = useTranslation();

    // Puts the form back as it starts, for whoever opens this next: signing
    // out and back in on a shared device must not find the last username,
    // password or error still there, whether the modal closed on a sign-in or
    // was dismissed after a wrong one.
    const reset = () => {
        setIsLogin(true);
        setUsername('');
        setPassword('');
        setError(null);
        setNeedsTOTP(false);
        setTwoFAMethod(null);
        setTotpCode('');
        setUseBackupCode(false);
        setBackupCode('');
        acceptedPasswordRef.current = null;
    };

    const close = () => {
        reset();
        onClose();
    };

    // Called before the early return below, so the hook order never changes.
    useEscape(close, isOpen);

    // aria-modal tells a screen reader the page behind is inert, so focus has
    // to come in with it: it starts on the username, the first thing to fill
    // in, and goes back to whatever opened the modal when it closes, as the
    // shared dialog does. The opener is read here, before the focus moves.
    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        usernameRef.current?.focus();
        return () => opener?.focus();
    }, [isOpen]);

    if (!isOpen) return null;

    const webauthn = typeof window !== 'undefined' && !!window.PublicKeyCredential;
    // What Share does, in Share's own words, then why it needs an account.
    // No space after a CJK full stop, which carries its own.
    const shareDesc = getShareCopy(lang).modalDescription;
    const reasonText =
        reason === 'share'
            ? `${shareDesc}${/[。！？]$/.test(shareDesc) ? '' : ' '}${t('auth.share_needs_account')}`
            : null;

    // Closes, clearing the form as any close does, and hands back to the
    // opener so it can carry on.
    const succeed = () => {
        close();
        onSuccess?.();
    };

    // Tab and Shift+Tab wrap around inside the card. Without this, three Tabs
    // from the submit button walked out into the page the scrim covers, which
    // aria-modal has just told a screen reader is not there.
    const keepFocusInside = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key !== 'Tab') return;
        const focusable = e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    // `verifiedPassword` is set only when the passkey is the second factor: the
    // server has already accepted that password, and passing it on lets the
    // cloud key be derived from it. A standalone passkey sign-in passes nothing.
    const handlePasskeyLogin = async (verifiedPassword?: string) => {
        // Never let anything but a real password through: wired straight to an
        // onClick this would receive the click event, and a key derived from
        // that stringified object encrypts uploads no other device can read.
        const verified = typeof verifiedPassword === 'string' ? verifiedPassword : undefined;
        if (!window.PublicKeyCredential) {
            setError(t('auth.passkey_unsupported'));
            return;
        }
        setPasskeyLoading(true);
        setError(null);
        try {
            const opts = await authService.passkeyAuthOptions(username || undefined);
            const credential = (await navigator.credentials.get({
                publicKey: {
                    rpId: window.location.hostname,
                    challenge: b64url2ab(opts.challenge),
                    allowCredentials: opts.credentialIds.map(id => ({
                        type: 'public-key' as const,
                        id: b64url2ab(id),
                    })),
                    timeout: 60000,
                    userVerification: 'preferred',
                },
            })) as PublicKeyCredential | null;
            if (!credential) return;
            const result = await authService.passkeyAuthVerify(
                opts.challengeToken,
                serializeAssertionCredential(credential),
            );
            await loginWithToken(result, verified);
            succeed();
        } catch (e: any) {
            if (e.name !== 'NotAllowedError') {
                setError(e.message || t('auth.passkey_failed'));
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isLogin) {
                await login(
                    username,
                    password,
                    needsTOTP && twoFAMethod === 'totp' && !useBackupCode ? totpCode : undefined,
                    needsTOTP && useBackupCode ? backupCode : undefined,
                );
            } else {
                if (strength === 'weak') {
                    setError(t('pw.too_weak'));
                    return;
                }
                await register(username, password);
            }
            succeed();
        } catch (err: any) {
            if (err.needs2FA) {
                const method: 'totp' | 'passkey' = err.method ?? 'totp';
                setNeedsTOTP(true);
                setTwoFAMethod(method);
                setError(null);
                acceptedPasswordRef.current = password;
                if (method === 'passkey') {
                    setTimeout(() => handlePasskeyLogin(password), 100);
                }
            } else {
                setError(describeAuthError(err, t));
            }
        } finally {
            setLoading(false);
        }
    };

    const errorId = `${id}-error`;
    // At the second-factor step the error goes under the code field, which is
    // where the eyes and, on a phone, the visible part of the screen are; at
    // the top of the form it sat behind the keyboard.
    const errorLine = error && (
        <p id={errorId} role="alert" className="text-sm text-[var(--danger)]">
            {error}
        </p>
    );
    const submitButton = (
        <button type="submit" disabled={loading || strength === 'weak'} className="btn-primary w-full mt-1">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {isLogin ? t('auth.sign_in') : t('auth.sign_up')}
        </button>
    );

    return (
        <div className="modal-overlay">
            <div className="modal-shell">
                <div
                    className="modal-card overflow-hidden p-0"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${id}-title`}
                    aria-describedby={reasonText ? `${id}-reason` : undefined}
                    onKeyDown={keepFocusInside}
                >
                    <div className="px-5 pt-5 pb-2">
                        <div className="flex items-center justify-between">
                            <h2 id={`${id}-title`} className="modal-title mb-0">
                                {isLogin ? t('auth.sign_in') : t('auth.sign_up')}
                            </h2>
                            <button
                                type="button"
                                onClick={close}
                                aria-label={t('btn.cancel')}
                                title={t('btn.cancel')}
                                className="tap-target p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        {reasonText && (
                            <p id={`${id}-reason`} className="mt-1.5 text-sm leading-relaxed text-muted">
                                {reasonText}
                            </p>
                        )}
                    </div>

                    <form onSubmit={handleSubmit} className="px-5 pb-5 pt-1 space-y-3">
                        {!needsTOTP && errorLine}

                        <div className="space-y-1.5">
                            <label htmlFor={`${id}-username`} className="text-sm text-muted">
                                {t('auth.username')}
                            </label>
                            <input
                                ref={usernameRef}
                                id={`${id}-username`}
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                className="input-base"
                                placeholder={t('auth.username_placeholder')}
                                autoComplete="username"
                                aria-describedby={error && !needsTOTP ? errorId : undefined}
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor={`${id}-password`} className="text-sm text-muted">
                                {t('auth.password')}
                            </label>
                            <input
                                id={`${id}-password`}
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                className="input-base"
                                placeholder={t('auth.password_placeholder')}
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                aria-describedby={
                                    [
                                        !isLogin ? `${id}-key-note` : '',
                                        strength ? `${id}-pw-strength` : '',
                                        error && !needsTOTP ? errorId : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ') || undefined
                                }
                                required
                            />
                            {strength && (
                                <p
                                    id={`${id}-pw-strength`}
                                    className={`text-xs ${
                                        strength === 'weak'
                                            ? 'text-[var(--danger)]'
                                            : strength === 'strong'
                                              ? 'text-[var(--accent-ink)]'
                                              : 'text-muted'
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

                        {/* Signing up is the moment to say it: the password is
                        what the backups are encrypted with, so there is no
                        reset that brings them back. */}
                        {!isLogin && (
                            <p id={`${id}-key-note`} className="callout">
                                {t('auth.password_is_key')}
                            </p>
                        )}

                        {needsTOTP && (
                            <div className="space-y-3">
                                <div className="callout flex items-center gap-2 text-xs">
                                    <ShieldIcon size={16} className="shrink-0 text-[var(--accent-ink)]" />
                                    {t('auth.needs_2fa')}
                                </div>
                                {useBackupCode ? (
                                    <div key="backup" className="space-y-2">
                                        <label htmlFor={`${id}-backup`} className="text-sm text-muted">
                                            {t('auth.backup_code_label')}
                                        </label>
                                        <input
                                            id={`${id}-backup`}
                                            type="text"
                                            value={backupCode}
                                            onChange={e => setBackupCode(e.target.value.toUpperCase())}
                                            className="input-base font-mono text-center tracking-widest"
                                            placeholder={t('auth.backup_code_placeholder')}
                                            autoComplete="off"
                                            aria-describedby={error ? errorId : undefined}
                                            autoFocus
                                            required={useBackupCode}
                                        />
                                    </div>
                                ) : (
                                    twoFAMethod !== 'passkey' && (
                                        <div key="totp" className="space-y-1.5">
                                            <label htmlFor={`${id}-totp`} className="text-sm text-muted">
                                                {t('auth.totp_code')}
                                            </label>
                                            <input
                                                id={`${id}-totp`}
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]{6}"
                                                maxLength={6}
                                                value={totpCode}
                                                onChange={e =>
                                                    setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                                }
                                                className="input-base font-mono text-center tracking-widest"
                                                placeholder={t('auth.totp_placeholder')}
                                                autoComplete="one-time-code"
                                                aria-describedby={error ? errorId : undefined}
                                                autoFocus
                                                required={needsTOTP && !useBackupCode}
                                            />
                                        </div>
                                    )
                                )}
                                {errorLine}
                                {/* The code's own button straight under it, and the
                                other ways in after: with the passkey button and
                                the backup-code link in between, the submit sat
                                below every alternative and, with a phone
                                keyboard up, off the screen. */}
                                {!(twoFAMethod === 'passkey' && !useBackupCode) && submitButton}
                                {useBackupCode ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUseBackupCode(false);
                                            setBackupCode('');
                                        }}
                                        className="text-xs text-[var(--accent-ink)] hover:underline"
                                    >
                                        ← {twoFAMethod === 'totp' ? t('auth.totp_code') : t('auth.passkey_as_2fa')}
                                    </button>
                                ) : (
                                    <>
                                        {twoFAMethod === 'passkey' && !webauthn && (
                                            <p className="text-xs text-[var(--danger)] text-center">
                                                {t('auth.passkey_unsupported')}
                                            </p>
                                        )}
                                        {webauthn && (
                                            <>
                                                {twoFAMethod !== 'passkey' && (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-px bg-[var(--border)]" />
                                                        <span className="text-xs text-muted">{t('common.or')}</span>
                                                        <div className="flex-1 h-px bg-[var(--border)]" />
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handlePasskeyLogin(acceptedPasswordRef.current ?? undefined)
                                                    }
                                                    disabled={passkeyLoading}
                                                    className="btn-secondary w-full"
                                                >
                                                    {passkeyLoading ? (
                                                        <Loader2 size={16} className="animate-spin" />
                                                    ) : (
                                                        <Fingerprint size={16} />
                                                    )}
                                                    {t('auth.passkey_as_2fa')}
                                                </button>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setUseBackupCode(true)}
                                            className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text)] text-center py-1"
                                        >
                                            {t('auth.use_backup_code')}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {!needsTOTP && submitButton}

                        {/* The Account page has always offered this; the modal
                        didn't, so someone whose account has only a passkey
                        had no way in from here. */}
                        {isLogin && !needsTOTP && webauthn && (
                            <>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-px bg-[var(--border)]" />
                                    <span className="text-xs text-muted">{t('common.or')}</span>
                                    <div className="flex-1 h-px bg-[var(--border)]" />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handlePasskeyLogin()}
                                    disabled={passkeyLoading}
                                    className="btn-secondary w-full"
                                >
                                    {passkeyLoading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <Fingerprint size={16} />
                                    )}
                                    {t('auth.passkey_login')}
                                </button>
                            </>
                        )}

                        <div className="pt-2 text-center text-sm text-muted">
                            {isLogin ? t('auth.no_account') : t('auth.has_account')}{' '}
                            <button
                                type="button"
                                onClick={() => {
                                    setIsLogin(!isLogin);
                                    setError(null);
                                    setNeedsTOTP(false);
                                }}
                                className="text-[var(--accent-ink)] hover:underline"
                            >
                                {isLogin ? t('auth.go_register') : t('auth.go_login')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AuthModal;
