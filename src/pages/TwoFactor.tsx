import React, { useState, useEffect } from 'react';
import { ArrowLeft, Shield, ShieldCheck, QrCode, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authService } from '../services/auth';
import { useTranslation } from '../contexts/LanguageContext';
import { useDialog } from '../contexts/DialogContext';

interface TwoFactorPageProps {
    token: string;
    enabled: boolean;
    onStatusChange: (enabled: boolean) => void;
    onBack: () => void;
}

type SetupStep = 'scan' | 'verify';

const TwoFactorPage: React.FC<TwoFactorPageProps> = ({ token, enabled, onStatusChange, onBack }) => {
    const { t } = useTranslation();
    const { showDialog } = useDialog();

    const [step, setStep] = useState<SetupStep>('scan');
    const [secret, setSecret] = useState('');
    const [uri, setUri] = useState('');
    const [code, setCode] = useState('');
    const [secretVisible, setSecretVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const [disablePassword, setDisablePassword] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [disableLoading, setDisableLoading] = useState(false);
    const [disableError, setDisableError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) {
            initSetup();
        }
    }, []);

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
            await authService.enable2FA(token, secret, code);
            setSuccess(true);
            onStatusChange(true);
        } catch (e: any) {
            const msg = e.message || '';
            setError(msg.includes('Invalid') ? t('account.2fa_verify_failed') : t('account.2fa_setup_failed'));
        } finally {
            setLoading(false);
        }
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
            if (msg.includes('Incorrect password')) {
                setDisableError(t('account.2fa_verify_failed'));
            } else if (msg.includes('Invalid 2FA')) {
                setDisableError(t('account.2fa_verify_failed'));
            } else {
                setDisableError(t('account.2fa_disable_failed'));
            }
        } finally {
            setDisableLoading(false);
        }
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

            <div className="px-6 md:px-10">
                {/* ---- Manage/Disable 2FA (already enabled) ---- */}
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
                                        <AlertCircle size={14} className="shrink-0" />
                                        {disableError}
                                    </div>
                                )}
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.current_password')}</label>
                                    <input
                                        type="password"
                                        value={disablePassword}
                                        onChange={e => setDisablePassword(e.target.value)}
                                        className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100"
                                        required
                                        autoComplete="current-password"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.2fa_code')}</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        value={disableCode}
                                        onChange={e => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100 tracking-[0.4em] font-mono"
                                        placeholder="000000"
                                        required
                                        autoComplete="one-time-code"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={disableLoading || disablePassword.length < 1 || disableCode.length !== 6}
                                    className="w-full py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {disableLoading && <Loader2 size={14} className="animate-spin" />}
                                    {t('account.2fa_disable')}
                                </button>
                            </form>
                        </div>
                    </div>
                )}

                {/* ---- Setup 2FA (not yet enabled) ---- */}
                {!enabled && (
                    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                        {/* Steps indicator */}
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
                            {/* Step 1: Scan QR */}
                            {step === 'scan' && (
                                <>
                                    {error && (
                                        <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                            <AlertCircle size={14} className="shrink-0" />
                                            {error}
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.2fa_scan_qr')}</p>
                                    <p className="text-xs text-gray-400 dark:text-neutral-500">{t('account.2fa_recommended_apps')}</p>

                                    {setupLoading ? (
                                        <div className="flex justify-center py-10">
                                            <Loader2 className="animate-spin text-gray-300" size={28} />
                                        </div>
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
                                                <code className={`flex-1 text-xs font-mono text-gray-800 dark:text-gray-200 tracking-widest break-all ${!secretVisible ? 'select-none blur-sm' : ''}`}>
                                                    {secret}
                                                </code>
                                                <button onClick={() => setSecretVisible(v => !v)} className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                                    {secretVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setStep('verify')}
                                        disabled={!secret || setupLoading}
                                        className="w-full py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <QrCode size={15} />
                                        {t('account.2fa_next')}
                                    </button>
                                </>
                            )}

                            {/* Step 2: Verify code */}
                            {step === 'verify' && !success && (
                                <form onSubmit={handleEnable} className="space-y-4">
                                    <p className="text-sm text-gray-600 dark:text-gray-400">{t('account.2fa_verify')}</p>

                                    {error && (
                                        <div className="flex items-center gap-2 p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-900/30">
                                            <AlertCircle size={14} className="shrink-0" />
                                            {error}
                                        </div>
                                    )}

                                    <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.2fa_code')}</label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            value={code}
                                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            className="w-full px-4 py-3 text-center text-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-pink-500 transition-all text-gray-900 dark:text-gray-100 tracking-[0.6em] font-mono"
                                            placeholder="000000"
                                            autoComplete="one-time-code"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep('scan')}
                                            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-neutral-700 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                                        >
                                            ← {t('account.2fa_step_scan')}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={loading || code.length !== 6}
                                            className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {loading && <Loader2 size={14} className="animate-spin" />}
                                            {t('account.2fa_enable_btn')}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* Success state */}
                            {success && (
                                <div className="flex flex-col items-center gap-3 py-6">
                                    <CheckCircle2 size={48} className="text-emerald-500" />
                                    <p className="font-semibold text-gray-900 dark:text-gray-100">{t('account.2fa_enabled_success')}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{t('account.2fa_success_hint')}</p>
                                    <button
                                        onClick={onBack}
                                        className="mt-2 px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold rounded-xl transition-colors"
                                    >
                                        {t('btn.ok')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TwoFactorPage;
