import React, { useState } from 'react';
import { X, Loader2, Shield, Fingerprint } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { authService, serializeAssertionCredential, b64url2ab } from '../services/auth';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
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

    const { login, register, loginWithToken } = useAuth();
    const { t } = useTranslation();

    if (!isOpen) return null;

    const handlePasskeyLogin = async () => {
        if (!window.PublicKeyCredential) {
            setError(t('auth.passkey_unsupported'));
            return;
        }
        setPasskeyLoading(true);
        setError(null);
        try {
            const opts = await authService.passkeyAuthOptions(username || undefined);
            const credential = await navigator.credentials.get({
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
            }) as PublicKeyCredential | null;
            if (!credential) return;
            const result = await authService.passkeyAuthVerify(opts.challengeToken, serializeAssertionCredential(credential));
            loginWithToken(result);
            onClose();
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
                    username, password,
                    needsTOTP && twoFAMethod === 'totp' && !useBackupCode ? totpCode : undefined,
                    needsTOTP && useBackupCode ? backupCode : undefined,
                );
            } else {
                await register(username, password);
                onClose();
                // needsSetup2FA redirect is handled by App.tsx
                return;
            }
            onClose();
            setUsername('');
            setPassword('');
            setNeedsTOTP(false);
            setTwoFAMethod(null);
            setTotpCode('');
            setUseBackupCode(false);
            setBackupCode('');
        } catch (err: any) {
            if (err.needs2FA) {
                const method: 'totp' | 'passkey' = err.method ?? 'totp';
                setNeedsTOTP(true);
                setTwoFAMethod(method);
                setError(null);
                if (method === 'passkey') {
                    setTimeout(() => handlePasskeyLogin(), 100);
                }
            } else {
                setError(err.message || 'An error occurred');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-[var(--color-m3-surface-container-high)] dark:bg-[var(--color-m3-dark-surface-container-high)] rounded-[var(--radius-xl)] shadow-[var(--shadow-m3-3)] w-full max-w-sm overflow-hidden animate-m3-decelerate">
                <div className="flex items-center justify-between px-6 pt-6 pb-3">
                    <h2 className="font-display text-base font-bold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                        {isLogin ? 'Sign In' : 'Create Account'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 -mr-1 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] rounded-[var(--radius-full)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 pb-6 pt-2 space-y-3">
                    {error && (
                        <div className="p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-[var(--radius-sm)] border border-red-200 dark:border-red-900/30">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-pink-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
                            placeholder="Enter username"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-pink-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]"
                            placeholder="Enter password"
                            required
                        />
                    </div>

                    {needsTOTP && isLogin && (
                        <div className="space-y-3">
                            <div className="p-2.5 text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 rounded-[var(--radius-sm)] border border-blue-200 dark:border-blue-800/40 flex items-center gap-2">
                                <Shield size={14} className="shrink-0" />
                                {t('auth.needs_2fa')}
                            </div>
                            {useBackupCode ? (
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.backup_code_label')}</label>
                                    <input
                                        type="text"
                                        value={backupCode}
                                        onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                        className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-pink-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-[0.1em] font-mono text-center"
                                        placeholder={t('auth.backup_code_placeholder')}
                                        autoComplete="off"
                                        autoFocus
                                        required={useBackupCode}
                                    />
                                    <button type="button" onClick={() => { setUseBackupCode(false); setBackupCode(''); }}
                                        className="text-xs text-[var(--color-m3-primary)] hover:underline">
                                        ← {twoFAMethod === 'totp' ? t('auth.totp_code') : t('auth.passkey_as_2fa')}
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {twoFAMethod !== 'passkey' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.totp_code')}</label>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]{6}"
                                                maxLength={6}
                                                value={totpCode}
                                                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                className="w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary-container)] focus:border-[var(--color-m3-primary)] dark:focus:border-pink-400 transition-all text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tracking-[0.15em] font-mono text-center"
                                                placeholder={t('auth.totp_placeholder')}
                                                autoComplete="one-time-code"
                                                autoFocus
                                                required={needsTOTP && twoFAMethod !== 'passkey' && !useBackupCode}
                                            />
                                        </div>
                                    )}
                                    {twoFAMethod === 'passkey' && typeof window !== 'undefined' && !window.PublicKeyCredential && (
                                        <p className="text-xs text-red-500 text-center">{t('auth.passkey_unsupported')}</p>
                                    )}
                                    {typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                                        <>
                                            {twoFAMethod !== 'passkey' && (
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)]" />
                                                    <span className="text-xs text-[var(--color-m3-on-surface-variant)]">or</span>
                                                    <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)]" />
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                onClick={handlePasskeyLogin}
                                                disabled={passkeyLoading}
                                                className="w-full py-2.5 text-sm font-medium border border-[var(--color-m3-outline)] dark:border-[var(--color-m3-dark-outline)] rounded-[var(--radius-md)] hover:bg-[var(--color-m3-surface-container-highest)] dark:hover:bg-[var(--color-m3-dark-surface-container-highest)] transition text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] disabled:opacity-50 flex items-center justify-center gap-2"
                                            >
                                                {passkeyLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                                                {t('auth.passkey_as_2fa')}
                                            </button>
                                        </>
                                    )}
                                    <button type="button" onClick={() => setUseBackupCode(true)}
                                        className="w-full text-xs text-[var(--color-m3-on-surface-variant)] hover:text-[var(--color-m3-on-surface)] text-center py-1 transition-colors">
                                        {t('auth.use_backup_code')}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {!(needsTOTP && twoFAMethod === 'passkey' && !useBackupCode) && (
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 md:py-2 mt-1 text-base md:text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-xl md:rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {isLogin ? 'Sign In' : 'Sign Up'}
                    </button>
                    )}

                    <div className="pt-2 text-center text-sm text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button
                            type="button"
                            onClick={() => { setIsLogin(!isLogin); setError(null); }}
                            className="text-[var(--color-m3-primary)] dark:text-pink-400 font-bold hover:underline"
                        >
                            {isLogin ? 'Sign up' : 'Sign in'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AuthModal;
