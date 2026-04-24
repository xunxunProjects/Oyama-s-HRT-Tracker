import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft, Shield, ShieldCheck, QrCode, Loader2, CheckCircle2,
    AlertCircle, Eye, EyeOff, Copy, Check, Fingerprint, Key, Trash2, Plus,
    KeyRound, Download, RefreshCw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
    authService, Passkey,
    serializeAttestationCredential, b64url2ab,
} from '../services/auth';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';

interface TwoFactorPageProps {
    token: string;
    enabled: boolean;
    onStatusChange: (enabled: boolean) => void;
    onBack: () => void;
}

type SetupStep = 'scan' | 'verify';
type ActiveTab = 'totp' | 'passkey';

function detectDeviceName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (/Android/.test(ua)) return 'Android';
    if (ua.includes('Mac OS X')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown device';
}

const TwoFactorPage: React.FC<TwoFactorPageProps> = ({ token, enabled, onStatusChange, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();

    // ---- Tab ----
    const [activeTab, setActiveTab] = useState<ActiveTab>('totp');

    // ---- TOTP state ----
    const [step, setStep] = useState<SetupStep>('scan');
    const [secret, setSecret] = useState('');
    const [uri, setUri] = useState('');
    const [code, setCode] = useState('');
    const [secretVisible, setSecretVisible] = useState(false);
    const [secretCopied, setSecretCopied] = useState(false);
    const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [loading, setLoading] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [disableLoading, setDisableLoading] = useState(false);
    const [disableError, setDisableError] = useState<string | null>(null);

    // ---- Passkey state ----
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const [passkeyError, setPasskeyError] = useState<string | null>(null);
    const [registerLoading, setRegisterLoading] = useState(false);
    const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
    const [passkeySuccess, setPasskeySuccess] = useState(false);
    const webauthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential;

    // ---- Backup codes state ----
    const [backupCodes, setBackupCodes] = useState<string[]>([]);
    const [backupRemaining, setBackupRemaining] = useState<number | null>(null);
    const [backupLoading, setBackupLoading] = useState(false);
    const [backupError, setBackupError] = useState<string | null>(null);
    const [backupCopied, setBackupCopied] = useState(false);
    const backupCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) initSetup();
        fetchPasskeys();
        if (enabled) fetchBackupRemaining();
        return () => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            if (backupCopyTimerRef.current) clearTimeout(backupCopyTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- TOTP helpers ----
    const handleCopySecret = () => {
        navigator.clipboard.writeText(secret).then(() => {
            if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
            setSecretCopied(true);
            copyTimerRef.current = setTimeout(() => setSecretCopied(false), 2000);
        });
    };

    const initSetup = async () => {
        setSetupLoading(true);
        setError(null);
        try {
            const data = await authService.setup2FA(token);
            setSecret(data.secret);
            setUri(data.uri);
        } catch (e: any) {
            setError(e.message || t('account.2fa_setup_failed'));
        } finally {
            setSetupLoading(false);
        }
    };

    const handleEnable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code || code.length !== 6) return;
        setLoading(true);
        setError(null);
        try {
            const result = await authService.enable2FA(token, secret, code);
            setBackupCodes(result.backupCodes ?? []);
            setBackupRemaining(result.backupCodes?.length ?? 0);
            setSuccess(true);
            onStatusChange(true);
        } catch (e: any) {
            const msg = e.message || '';
            setError(msg.includes('Invalid') ? t('account.2fa_verify_failed') : t('account.2fa_setup_failed'));
        } finally {
            setLoading(false);
        }
    };

    // ---- Backup code helpers ----
    const fetchBackupRemaining = async () => {
        try {
            const data = await authService.getBackupCodesStatus(token);
            setBackupRemaining(data.remaining);
        } catch { /* best-effort */ }
    };

    const handleGenerateBackupCodes = async () => {
        setBackupLoading(true);
        setBackupError(null);
        try {
            const codes = await authService.generateBackupCodes(token);
            setBackupCodes(codes);
            setBackupRemaining(codes.length);
        } catch (e: any) {
            setBackupError(e.message || t('account.backup_codes_generate'));
        } finally {
            setBackupLoading(false);
        }
    };

    const handleCopyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
            if (backupCopyTimerRef.current) clearTimeout(backupCopyTimerRef.current);
            setBackupCopied(true);
            backupCopyTimerRef.current = setTimeout(() => setBackupCopied(false), 2000);
        });
    };

    const handleDownloadBackupCodes = () => {
        const text = `HRT Tracker - Backup Codes\nGenerated: ${new Date().toISOString()}\n\n${backupCodes.join('\n')}\n\nEach code can only be used once. Store these securely.`;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hrt-tracker-backup-codes.txt';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDisable = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!disablePassword || !disableCode) return;
        setDisableLoading(true);
        setDisableError(null);
        try {
            await authService.disable2FA(token, disablePassword, disableCode);
            onStatusChange(false);
            showDialog('alert', t('account.2fa_disabled_success'));
            onBack();
        } catch (e: any) {
            const msg = e.message || '';
            if (msg.includes('Incorrect password') || msg.includes('Invalid 2FA')) {
                setDisableError(t('account.2fa_verify_failed'));
            } else {
                setDisableError(t('account.2fa_disable_failed'));
            }
        } finally {
            setDisableLoading(false);
        }
    };

    // ---- Passkey helpers ----
    const fetchPasskeys = async () => {
        setPasskeyLoading(true);
        setPasskeyError(null);
        try {
            const list = await authService.listPasskeys(token);
            setPasskeys(list);
        } catch {
            setPasskeyError(t('account.passkey_fetch_failed'));
        } finally {
            setPasskeyLoading(false);
        }
    };

    const handleRegisterPasskey = async () => {
        if (!webauthnSupported) {
            setPasskeyError(t('auth.passkey_unsupported'));
            return;
        }
        setRegisterLoading(true);
        setPasskeyError(null);
        setPasskeySuccess(false);
        try {
            const opts = await authService.registerPasskeyOptions(token);
            const credential = await navigator.credentials.create({
                publicKey: {
                    rp: opts.rp,
                    user: {
                        id: b64url2ab(opts.user.id),
                        name: opts.user.name,
                        displayName: opts.user.displayName,
                    },
                    challenge: b64url2ab(opts.challenge),
                    pubKeyCredParams: opts.pubKeyCredParams,
                    timeout: opts.timeout,
                    authenticatorSelection: opts.authenticatorSelection,
                    attestation: opts.attestation,
                },
            }) as PublicKeyCredential | null;
            if (!credential) throw new Error('Cancelled');
            const result = await authService.registerPasskey(
                token,
                opts.challengeToken,
                serializeAttestationCredential(credential),
                detectDeviceName(),
            );
            if (result.backupCodes && result.backupCodes.length > 0) {
                setBackupCodes(result.backupCodes);
                setBackupRemaining(result.backupCodes.length);
            }
            setPasskeySuccess(true);
            await fetchPasskeys();
        } catch (e: any) {
            if (e.name !== 'NotAllowedError' && e.message !== 'Cancelled') {
                setPasskeyError(e.message || t('account.passkey_register_failed'));
            }
        } finally {
            setRegisterLoading(false);
        }
    };

    const handleDeletePasskey = (pk: Passkey) => {
        showDialog('confirm', t('account.passkey_delete_confirm'), async () => {
            setDeleteLoadingId(pk.id);
            try {
                await authService.deletePasskey(token, pk.id);
                setPasskeys(prev => prev.filter(p => p.id !== pk.id));
            } catch {
                setPasskeyError(t('account.passkey_delete_failed'));
            } finally {
                setDeleteLoadingId(null);
            }
        });
    };

    const relativeTime = (ts: number) => {
        const diff = Math.floor(Date.now() / 1000) - ts;
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return new Date(ts * 1000).toLocaleDateString();
    };

    return (
        <div className="relative pt-6 pb-32">
            {/* Header */}
            <div className="px-6 md:px-10 mb-5">
                <div className="w-full p-4 rounded-lg bg-white dark:bg-neutral-900 flex items-center gap-3 border border-gray-200 dark:border-neutral-800 transition-all duration-300">
                    <button
                        onClick={onBack}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-md ${enabled ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-purple-50 dark:bg-purple-900/20'}`}>
                            {enabled
                                ? <ShieldCheck size={18} className="text-emerald-600 dark:text-emerald-400" />
                                : <Shield size={18} className="text-purple-600 dark:text-purple-400" />
                            }
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 leading-tight">{t('account.2fa')}</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.2fa_desc')}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-6 md:px-10 space-y-4">
                {/* Tab switcher */}
                <div className="flex rounded-lg border border-gray-200 dark:border-neutral-700 overflow-hidden">
                    {(['totp', 'passkey'] as ActiveTab[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-colors ${
                                activeTab === tab
                                    ? 'bg-pink-600 text-white'
                                    : 'bg-white dark:bg-neutral-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-neutral-800'
                            }`}
                        >
                            {tab === 'totp' ? <Key size={14} /> : <Fingerprint size={14} />}
                            {tab === 'totp' ? 'TOTP' : 'Passkey'}
                        </button>
                    ))}
                </div>

                {/* ===== TOTP TAB ===== */}
                {activeTab === 'totp' && (
                    <>
                        {enabled && (
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                                <div className="px-6 py-5 space-y-4">
                                    <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                                        <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">{t('account.2fa_is_active')}</p>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.2fa_disable_hint')}</p>
                                    <form onSubmit={handleDisable} className="space-y-3">
                                        {disableError && (
                                            <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                                <AlertCircle size={14} className="shrink-0" />{disableError}
                                            </div>
                                        )}
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.current_password')}</label>
                                            <input type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)}
                                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100"
                                                required autoComplete="current-password" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.2fa_code')}</label>
                                            <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                                                value={disableCode} onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100 tracking-[0.4em] font-mono"
                                                placeholder="000000" required autoComplete="one-time-code" />
                                        </div>
                                        <button type="submit" disabled={disableLoading || !disablePassword || disableCode.length !== 6}
                                            className="w-full py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                            {disableLoading && <Loader2 size={14} className="animate-spin" />}
                                            {t('account.2fa_disable')}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}

                        {!enabled && (
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                                <div className="flex items-center gap-0 px-6 pt-5 pb-2">
                                    {(['scan', 'verify'] as SetupStep[]).map((s, i) => (
                                        <React.Fragment key={s}>
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s || (success && s === 'verify') ? 'bg-pink-600 text-white' : 'bg-gray-200 dark:bg-neutral-700 text-gray-500 dark:text-gray-400'}`}>
                                                    {success && s === 'verify' ? <CheckCircle2 size={14} /> : i + 1}
                                                </div>
                                                <span className={`text-xs font-medium ${step === s ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-neutral-500'}`}>
                                                    {s === 'scan' ? t('account.2fa_step_scan') : t('account.2fa_step_verify')}
                                                </span>
                                            </div>
                                            {i < 1 && <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-700 mx-3" />}
                                        </React.Fragment>
                                    ))}
                                </div>

                                <div className="px-6 pb-6 pt-4 space-y-4">
                                    {step === 'scan' && (
                                        <>
                                            {error && (
                                                <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                                    <AlertCircle size={14} className="shrink-0" />{error}
                                                </div>
                                            )}
                                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.2fa_scan_qr')}</p>
                                            <p className="text-xs text-gray-400 dark:text-neutral-500">{t('account.2fa_recommended_apps')}</p>
                                            {setupLoading ? (
                                                <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" size={28} /></div>
                                            ) : uri ? (
                                                <div className="flex justify-center">
                                                    <div className="p-3 bg-white rounded-xl border border-gray-200 dark:border-neutral-700 inline-block">
                                                        <QRCodeSVG value={uri} size={180} />
                                                    </div>
                                                </div>
                                            ) : null}
                                            {secret && (
                                                <div className="space-y-1">
                                                    <p className="text-xs text-gray-400 dark:text-neutral-500">{t('account.2fa_secret')}</p>
                                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 px-3 py-2">
                                                        <code className={`flex-1 text-xs font-mono text-gray-800 dark:text-gray-200 tracking-widest break-all ${!secretVisible ? 'select-none blur-sm' : ''}`}>{secret}</code>
                                                        <button onClick={() => setSecretVisible(v => !v)} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                                            {secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                        </button>
                                                        <button onClick={handleCopySecret} className={`shrink-0 transition-colors ${secretCopied ? 'text-emerald-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
                                                            {secretCopied ? <Check size={14} /> : <Copy size={14} />}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            <button onClick={() => setStep('verify')} disabled={!secret || setupLoading}
                                                className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                                <QrCode size={15} />{t('account.2fa_next')}
                                            </button>
                                        </>
                                    )}

                                    {step === 'verify' && !success && (
                                        <form onSubmit={handleEnable} className="space-y-4">
                                            <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.2fa_verify')}</p>
                                            {error && (
                                                <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                                    <AlertCircle size={14} className="shrink-0" />{error}
                                                </div>
                                            )}
                                            <div className="space-y-1">
                                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.2fa_code')}</label>
                                                <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                                                    value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className="w-full px-4 py-3 text-center text-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100 tracking-[0.6em] font-mono"
                                                    placeholder="000000" autoComplete="one-time-code" autoFocus />
                                            </div>
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => setStep('scan')}
                                                    className="flex-1 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-neutral-700 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                                                    ← {t('account.2fa_step_scan')}
                                                </button>
                                                <button type="submit" disabled={loading || code.length !== 6}
                                                    className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                                                    {loading && <Loader2 size={14} className="animate-spin" />}
                                                    {t('account.2fa_enable_btn')}
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {success && (
                                        <div className="flex flex-col items-center gap-3 py-4">
                                            <CheckCircle2 size={48} className="text-emerald-500" />
                                            <p className="font-semibold text-gray-900 dark:text-gray-100">{t('account.2fa_enabled_success')}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{t('account.2fa_success_hint')}</p>
                                            {backupCodes.length > 0 && (
                                                <div className="w-full mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{t('account.backup_codes_warning')}</p>
                                                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                                                        {backupCodes.map((c, i) => (
                                                            <code key={i} className="text-center text-xs font-mono bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800/40 rounded px-2 py-1 text-gray-800 dark:text-gray-200">{c}</code>
                                                        ))}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button onClick={handleCopyBackupCodes}
                                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                                            {backupCopied ? <Check size={12} /> : <Copy size={12} />}
                                                            {backupCopied ? t('account.backup_codes_copied') : t('account.backup_codes_copy_all')}
                                                        </button>
                                                        <button onClick={handleDownloadBackupCodes}
                                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                                            <Download size={12} />{t('account.backup_codes_download')}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            <button onClick={onBack}
                                                className="mt-2 px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors">
                                                {t('btn.ok')}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ===== PASSKEY TAB ===== */}
                {activeTab === 'passkey' && (
                    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                        <div className="px-6 py-5 space-y-4">
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.passkey_desc')}</p>

                            {passkeyError && (
                                <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                    <AlertCircle size={14} className="shrink-0" />{passkeyError}
                                </div>
                            )}

                            {passkeySuccess && (
                                <div className="flex items-center gap-2 p-2.5 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-900/30">
                                    <CheckCircle2 size={14} className="shrink-0" />{t('account.passkey_registered')}
                                </div>
                            )}

                            {backupCodes.length > 0 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{t('account.backup_codes_warning')}</p>
                                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                                        {backupCodes.map((c, i) => (
                                            <code key={i} className="text-center text-xs font-mono bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800/40 rounded px-2 py-1 text-gray-800 dark:text-gray-200">{c}</code>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleCopyBackupCodes}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                            {backupCopied ? <Check size={12} /> : <Copy size={12} />}
                                            {backupCopied ? t('account.backup_codes_copied') : t('account.backup_codes_copy_all')}
                                        </button>
                                        <button onClick={handleDownloadBackupCodes}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                            <Download size={12} />{t('account.backup_codes_download')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {passkeyLoading ? (
                                <div className="flex justify-center py-6"><Loader2 className="animate-spin text-gray-300" size={22} /></div>
                            ) : passkeys.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-8 text-center">
                                    <div className="p-3 bg-gray-100 dark:bg-neutral-800 rounded-full">
                                        <Fingerprint size={24} className="text-gray-400 dark:text-neutral-500" />
                                    </div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('account.passkey_empty')}</p>
                                    <p className="text-xs text-gray-400 dark:text-neutral-500 max-w-xs">{t('account.passkey_empty_hint')}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {passkeys.map(pk => (
                                        <div key={pk.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-neutral-800 rounded-xl border border-gray-200 dark:border-neutral-700">
                                            <div className="p-2 bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-700 shrink-0">
                                                <Fingerprint size={16} className="text-pink-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {pk.device_name || 'Unknown device'}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-neutral-500">{relativeTime(pk.created_at)}</p>
                                            </div>
                                            <button
                                                onClick={() => handleDeletePasskey(pk)}
                                                disabled={deleteLoadingId === pk.id}
                                                className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50"
                                            >
                                                {deleteLoadingId === pk.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!webauthnSupported ? (
                                <p className="text-xs text-center text-amber-600 dark:text-amber-400">{t('auth.passkey_unsupported')}</p>
                            ) : (
                                <button
                                    onClick={handleRegisterPasskey}
                                    disabled={registerLoading}
                                    className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {registerLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                    {passkeys.length === 0 ? t('account.passkey_add') : t('account.passkey_add_another')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {/* ===== BACKUP CODES SECTION (shown when 2FA enabled) ===== */}
                {enabled && (
                    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                        <div className="px-6 py-5 space-y-4">
                            <div className="flex items-center gap-2">
                                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                                    <KeyRound size={16} className="text-amber-600 dark:text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('account.backup_codes')}</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {backupRemaining !== null
                                            ? t('account.backup_codes_remaining').replace('{n}', String(backupRemaining))
                                            : t('account.backup_codes_none')}
                                    </p>
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.backup_codes_generate_hint')}</p>

                            {backupError && (
                                <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                    <AlertCircle size={14} className="shrink-0" />{backupError}
                                </div>
                            )}

                            {backupCodes.length > 0 && (
                                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/40">
                                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">{t('account.backup_codes_warning')}</p>
                                    <div className="grid grid-cols-2 gap-1.5 mb-3">
                                        {backupCodes.map((c, i) => (
                                            <code key={i} className="text-center text-xs font-mono bg-white dark:bg-neutral-900 border border-amber-200 dark:border-amber-800/40 rounded px-2 py-1 text-gray-800 dark:text-gray-200">{c}</code>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={handleCopyBackupCodes}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                            {backupCopied ? <Check size={12} /> : <Copy size={12} />}
                                            {backupCopied ? t('account.backup_codes_copied') : t('account.backup_codes_copy_all')}
                                        </button>
                                        <button onClick={handleDownloadBackupCodes}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                                            <Download size={12} />{t('account.backup_codes_download')}
                                        </button>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={handleGenerateBackupCodes}
                                disabled={backupLoading}
                                className="w-full py-2.5 text-sm font-semibold text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {backupLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                {backupRemaining !== null && backupRemaining > 0
                                    ? t('account.backup_codes_regenerate')
                                    : t('account.backup_codes_generate')}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TwoFactorPage;
