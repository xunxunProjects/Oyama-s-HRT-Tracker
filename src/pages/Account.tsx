import React, { useState } from 'react';
import { UserCircle, UploadCloud, DownloadCloud, LogOut, User, BadgeCheck, ShieldCheck, ShieldOff, Merge, Lock, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { totpService, TOTPSetupResponse } from '../services/totp';
import { useAuth } from '../contexts/AuthContext';

interface AccountProps {
    t: (key: string) => string;
    user: any;
    token: string | null;
    onOpenAuth: () => void;
    onLogout: () => void;
    onCloudSave: (encryptionPassword?: string) => void;
    onCloudLoad: (encryptionPassword?: string) => void;
    onCloudMerge: (encryptionPassword?: string) => void;
}

const Account: React.FC<AccountProps> = ({
    t,
    user,
    token,
    onOpenAuth,
    onLogout,
    onCloudSave,
    onCloudLoad,
    onCloudMerge
}) => {
    const { updateUser } = useAuth();
    const [totpSetup, setTotpSetup] = useState<TOTPSetupResponse | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [totpLoading, setTotpLoading] = useState(false);
    const [totpError, setTotpError] = useState<string | null>(null);
    const [totpSuccess, setTotpSuccess] = useState<string | null>(null);
    const [showDisable2FA, setShowDisable2FA] = useState(false);
    const [disableCode, setDisableCode] = useState('');
    const [e2eeEnabled, setE2eeEnabled] = useState(false);
    const [e2eePassword, setE2eePassword] = useState('');

    const handleSetup2FA = async () => {
        if (!token) return;
        setTotpLoading(true);
        setTotpError(null);
        setTotpSuccess(null);
        try {
            const setup = await totpService.setup(token);
            setTotpSetup(setup);
        } catch (err: any) {
            if (err?.message === 'SESSION_EXPIRED') { onLogout(); return; }
            setTotpError(err.message || 'Failed to set up 2FA');
        } finally {
            setTotpLoading(false);
        }
    };

    const handleVerify2FA = async () => {
        if (!token) return;
        setTotpLoading(true);
        setTotpError(null);
        try {
            await totpService.verify(token, totpCode);
            setTotpSetup(null);
            setTotpCode('');
            setTotpSuccess('2FA enabled successfully!');
            updateUser({ totpEnabled: true });
        } catch (err: any) {
            if (err?.message === 'SESSION_EXPIRED') { onLogout(); return; }
            setTotpError(err.message || 'Invalid code');
        } finally {
            setTotpLoading(false);
        }
    };

    const handleDisable2FA = async () => {
        if (!token) return;
        setTotpLoading(true);
        setTotpError(null);
        try {
            await totpService.disable(token, disableCode);
            setShowDisable2FA(false);
            setDisableCode('');
            setTotpSuccess('2FA disabled successfully.');
            updateUser({ totpEnabled: false });
        } catch (err: any) {
            if (err?.message === 'SESSION_EXPIRED') { onLogout(); return; }
            setTotpError(err.message || 'Invalid code');
        } finally {
            setTotpLoading(false);
        }
    };

    const getE2eePassword = (): string | undefined => {
        return e2eeEnabled && e2eePassword.length > 0 ? e2eePassword : undefined;
    };

    return (
        <div className="relative space-y-5 pt-6 pb-24">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-[24px] bg-white dark:bg-zinc-900 flex items-center justify-between border border-zinc-200 dark:border-zinc-800 transition-colors duration-300">
                    <h2 className="text-xl font-semibold text-zinc-900 dark:text-white tracking-tight flex items-center gap-3">
                        <User size={22} className="text-indigo-400" /> Account
                    </h2>
                </div>
            </div>

            <div className="space-y-2">
                <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-100 dark:divide-zinc-800 overflow-hidden transition-colors duration-300">
                    {user ? (
                        <>
                            <div className="px-6 py-4 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/30">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold overflow-hidden">
                                        {user.isAdmin ? (
                                            <img src="/favicon.ico" alt="Admin Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            user.username.charAt(0).toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-zinc-900 dark:text-white text-sm">{user.username}</span>
                                        {user.isAdmin && (
                                            <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-500/10" strokeWidth={2.5} />
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={onLogout}
                                    className="flex items-center gap-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium"
                                >
                                    <LogOut size={14} />
                                    Sign Out
                                </button>
                            </div>
                            <button
                                onClick={() => onCloudSave(getE2eePassword())}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                            >
                                <UploadCloud className="text-indigo-500" size={20} />
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">Backup to Cloud</p>
                                    <p className="text-xs text-zinc-500">Save current data to your account{e2eeEnabled ? ' (E2EE)' : ''}</p>
                                </div>
                            </button>
                            <button
                                onClick={() => onCloudLoad(getE2eePassword())}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                            >
                                <DownloadCloud className="text-indigo-500" size={20} />
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">Restore from Cloud</p>
                                    <p className="text-xs text-zinc-500">Overwrite local data with cloud backup</p>
                                </div>
                            </button>
                            <button
                                onClick={() => onCloudMerge(getE2eePassword())}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition text-left"
                            >
                                <Merge className="text-emerald-500" size={20} />
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">Merge with Cloud</p>
                                    <p className="text-xs text-zinc-500">Combine local and cloud data without losing records</p>
                                </div>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={onOpenAuth}
                            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left"
                        >
                            <UserCircle className="text-indigo-500" size={20} />
                            <div className="text-left">
                                <p className="font-bold text-zinc-900 dark:text-white text-sm">Sign In / Register</p>
                                <p className="text-xs text-zinc-500">Sync your data across devices</p>
                            </div>
                        </button>
                    )}
                </div>
            </div>

            {/* E2EE Settings */}
            {user && (
                <div className="space-y-2">
                    <h3 className="px-10 text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">End-to-End Encryption</h3>
                    <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-colors duration-300 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Lock className="text-pink-500" size={20} />
                                <div>
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">E2EE Cloud Sync</p>
                                    <p className="text-xs text-zinc-500">Encrypt data before sending to cloud</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setE2eeEnabled(!e2eeEnabled)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${e2eeEnabled ? 'bg-pink-500' : 'bg-zinc-300 dark:bg-zinc-700'}`}
                            >
                                <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${e2eeEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        {e2eeEnabled && (
                            <div className="space-y-2 animate-in slide-in-from-top-2 fade-in duration-200">
                                <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Encryption Password</label>
                                <input
                                    type="password"
                                    value={e2eePassword}
                                    onChange={(e) => setE2eePassword(e.target.value)}
                                    placeholder="Enter a strong password for E2EE"
                                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500/20 focus:border-pink-500 transition-all text-sm"
                                />
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                    This password encrypts your data before it reaches the server. If you lose it, your cloud data cannot be recovered.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 2FA Settings */}
            {user && !user.isAdmin && (
                <div className="space-y-2">
                    <h3 className="px-10 text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Two-Factor Authentication</h3>
                    <div className="mx-6 md:mx-10 bg-white dark:bg-zinc-900 rounded-[24px] border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-colors duration-300">
                        {totpSuccess && (
                            <div className="px-6 py-3 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400">
                                {totpSuccess}
                            </div>
                        )}
                        {totpError && (
                            <div className="px-6 py-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400">
                                {totpError}
                            </div>
                        )}

                        {!user.totpEnabled && !totpSetup && (
                            <button
                                onClick={handleSetup2FA}
                                disabled={totpLoading}
                                className="w-full flex items-center gap-3 px-6 py-4 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 transition text-left disabled:opacity-50"
                            >
                                {totpLoading ? <Loader2 size={20} className="text-indigo-500 animate-spin" /> : <ShieldCheck className="text-indigo-500" size={20} />}
                                <div className="text-left">
                                    <p className="font-bold text-zinc-900 dark:text-white text-sm">Enable 2FA</p>
                                    <p className="text-xs text-zinc-500">Add an extra layer of security to your account</p>
                                </div>
                            </button>
                        )}

                        {totpSetup && (
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                    Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)
                                </p>
                                <div className="flex justify-center p-4 bg-white rounded-xl">
                                    <QRCodeSVG value={totpSetup.otpauthUrl} size={200} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Manual entry key:</p>
                                    <code className="block p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-xs font-mono text-zinc-700 dark:text-zinc-300 break-all select-all">
                                        {totpSetup.secret}
                                    </code>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Verify Code</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="\d{6}"
                                        maxLength={6}
                                        value={totpCode}
                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-center text-xl tracking-[0.3em] font-mono"
                                        placeholder="000000"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setTotpSetup(null); setTotpCode(''); }}
                                        className="flex-1 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleVerify2FA}
                                        disabled={totpCode.length !== 6 || totpLoading}
                                        className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {totpLoading && <Loader2 size={14} className="animate-spin" />}
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        )}

                        {user.totpEnabled && !showDisable2FA && (
                            <>
                                <div className="px-6 py-4 flex items-center gap-3 bg-emerald-50/50 dark:bg-emerald-900/10">
                                    <ShieldCheck className="text-emerald-500" size={20} />
                                    <div>
                                        <p className="font-bold text-zinc-900 dark:text-white text-sm">2FA is Active</p>
                                        <p className="text-xs text-zinc-500">Your account is protected with two-factor authentication</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setShowDisable2FA(true)}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 transition text-left"
                                >
                                    <ShieldOff className="text-red-400" size={20} />
                                    <div className="text-left">
                                        <p className="font-bold text-zinc-900 dark:text-white text-sm">Disable 2FA</p>
                                        <p className="text-xs text-zinc-500">Remove two-factor authentication</p>
                                    </div>
                                </button>
                            </>
                        )}

                        {showDisable2FA && (
                            <div className="p-6 space-y-4">
                                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                                    Enter your current 2FA code to disable two-factor authentication.
                                </p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all text-center text-xl tracking-[0.3em] font-mono"
                                    placeholder="000000"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { setShowDisable2FA(false); setDisableCode(''); }}
                                        className="flex-1 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDisable2FA}
                                        disabled={disableCode.length !== 6 || totpLoading}
                                        className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-500 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                    >
                                        {totpLoading && <Loader2 size={14} className="animate-spin" />}
                                        Disable
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Account;
