import React, { useState, useEffect, useMemo } from 'react';
import { UploadCloud, LogOut, User, BadgeCheck, Edit2, Key, Loader2, Trash2, Cloud, HardDrive, DownloadCloud, Merge, ChevronDown, Plus, Minus, ShieldAlert, ShieldCheck, Shield, Fingerprint } from 'lucide-react';
import { AvatarUpload } from '../components/AvatarUpload';
import EditProfileModal from '../components/EditProfileModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import DeleteAccountModal from '../components/DeleteAccountModal';

import { useAuth } from '../contexts/AuthContext';
import { cloudService, BackupMeta } from '../services/cloud';
import { useDialog } from '../contexts/DialogContext';
import { authService, serializeAssertionCredential, b64url2ab } from '../services/auth';

interface LocalData {
    events: any[];
    labResults: any[];
    doseTemplates: any[];
    weight: number;
}

interface AccountProps {
    t: (key: string) => string;
    user: any;
    token: string | null;
    onOpenAuth: () => void;
    onLogout: () => void;
    onCloudSave: () => void;
    onCloudLoad: (backupId?: string) => void;
    onCloudMerge: (backupId: string) => void;
    localData: LocalData;
    onNavigate: (view: string) => void;
    twoFAEnabled: boolean;
    onTwoFAStatusChange: (enabled: boolean) => void;
}

const Account: React.FC<AccountProps> = ({
    t,
    user,
    token,
    onOpenAuth,
    onLogout,
    onCloudSave,
    onCloudLoad,
    onCloudMerge,
    localData,
    onNavigate,
    twoFAEnabled,
    onTwoFAStatusChange
}) => {
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
    const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false);
    const [backupList, setBackupList] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const [savingCloud, setSavingCloud] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedData, setExpandedData] = useState<Record<string, any>>({});
    const [expandLoading, setExpandLoading] = useState<string | null>(null);
    const [mergeDiffId, setMergeDiffId] = useState<string | null>(null);
    const { showDialog } = useDialog();

    // Inline auth form state
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [needsTOTP, setNeedsTOTP] = useState(false);
    const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'passkey' | null>(null);
    const [totpCode, setTotpCode] = useState('');
    const [useBackupCode, setUseBackupCode] = useState(false);
    const [backupCode, setBackupCode] = useState('');
    const [passkeyLoading, setPasskeyLoading] = useState(false);
    const { login, register, loginWithToken } = useAuth();

    const fetchBackups = async () => {
        if (!token) return;
        setBackupsLoading(true);
        try {
            const list = await cloudService.listMeta(token);
            setBackupList(list);
        } catch { setBackupList([]); }
        finally { setBackupsLoading(false); }
    };

    useEffect(() => {
        if (user && token) {
            fetchBackups();
            // Fetch 2FA status
            authService.get2FAStatus(token).then(s => onTwoFAStatusChange(s.enabled)).catch(() => {});
        }
    }, [user, token]);

    const handleSave = async () => {
        setSavingCloud(true);
        try {
            await onCloudSave();
            await fetchBackups();
        } finally { setSavingCloud(false); }
    };

    const handleDeleteBackup = async (id: string) => {
        if (!token) return;
        showDialog('confirm', t('account.delete_backup_confirm'), async () => {
            try {
                await cloudService.deleteBackup(token, id);
                setBackupList(prev => prev.filter(b => b.id !== id));
                setExpandedData(prev => { const n = { ...prev }; delete n[id]; return n; });
            } catch { showDialog('alert', t('account.delete_backup_failed')); }
        });
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const toggleExpand = async (b: BackupMeta) => {
        if (expandedId === b.id) { setExpandedId(null); return; }
        setExpandedId(b.id);
        if (expandedData[b.id]) return; // already loaded
        setExpandLoading(b.id);
        try {
            const backup = await cloudService.loadOne(token!, b.id);
            const parsed = JSON.parse(backup.data);
            setExpandedData(prev => ({ ...prev, [b.id]: parsed }));
        } catch {
            showDialog('alert', t('account.load_backup_failed'));
            setExpandedId(null);
        } finally { setExpandLoading(null); }
    };

    // Compute merge diff for a given backup
    const computeDiff = (backupData: any) => {
        const localEventIds = new Set(localData.events.map((e: any) => e.id));
        const localLabIds = new Set(localData.labResults.map((r: any) => r.id));
        const localTemplateIds = new Set(localData.doseTemplates.map((t: any) => t.id));
        const backupEventIds = new Set((backupData.events || []).map((e: any) => e.id));
        const backupLabIds = new Set((backupData.labResults || []).map((r: any) => r.id));
        const backupTemplateIds = new Set((backupData.doseTemplates || []).map((t: any) => t.id));

        const newEvents = (backupData.events || []).filter((e: any) => !localEventIds.has(e.id));
        const newLabs = (backupData.labResults || []).filter((r: any) => !localLabIds.has(r.id));
        const newTemplates = (backupData.doseTemplates || []).filter((t: any) => !localTemplateIds.has(t.id));

        const localOnlyEvents = localData.events.filter((e: any) => !backupEventIds.has(e.id));
        const localOnlyLabs = localData.labResults.filter((r: any) => !backupLabIds.has(r.id));
        const localOnlyTemplates = localData.doseTemplates.filter((t: any) => !backupTemplateIds.has(t.id));

        return {
            newEvents, newLabs, newTemplates,
            localOnlyEvents, localOnlyLabs, localOnlyTemplates,
            total: newEvents.length + newLabs.length + newTemplates.length,
            totalDiff: newEvents.length + newLabs.length + newTemplates.length + localOnlyEvents.length + localOnlyLabs.length + localOnlyTemplates.length
        };
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setAuthLoading(true);
        try {
            if (isLogin) {
                await login(
                    username, password,
                    needsTOTP && twoFAMethod === 'totp' && !useBackupCode ? totpCode : undefined,
                    needsTOTP && useBackupCode ? backupCode : undefined,
                );
            } else {
                await register(username, password);
                window.location.reload();
                return;
            }
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
                setAuthError(null);
                if (method === 'passkey') {
                    // Auto-trigger passkey verification
                    setTimeout(() => handlePasskeyLogin(), 100);
                }
            } else {
                setAuthError(err.message || 'An error occurred');
            }
        } finally {
            setAuthLoading(false);
        }
    };

    const handlePasskeyLogin = async () => {
        if (!window.PublicKeyCredential) {
            setAuthError(t('auth.passkey_unsupported'));
            return;
        }
        setPasskeyLoading(true);
        setAuthError(null);
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
        } catch (e: any) {
            if (e.name !== 'NotAllowedError') {
                setAuthError(e.message || t('auth.passkey_failed'));
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    return (
        <div className="relative space-y-5 pt-6 pb-32">
            <div className="px-6 md:px-10">
                <div className="w-full p-5 rounded-lg bg-white dark:bg-neutral-900 flex items-center justify-between border border-gray-200 dark:border-neutral-800 transition-all duration-300">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-pink-50 dark:bg-pink-900/20 rounded-md">
                            <User size={20} className="text-pink-600 dark:text-pink-400" />
                        </div>
                        {t('account.title')}
                    </h2>
                </div>
            </div>

            <div className="space-y-4 px-6 md:px-10">
                {user ? (
                    <>
                        {/* Profile Section */}
                        <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden transition-colors duration-300">
                            <div className="p-6 flex flex-col items-center justify-center gap-4 bg-gray-50/50 dark:bg-neutral-800/30">
                                {token && (
                                    <AvatarUpload
                                        username={user.username}
                                        token={token}
                                    />
                                )}
                                <div className="flex flex-col items-center gap-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-bold text-gray-900 dark:text-gray-100 text-xl">{user.username}</span>
                                        {user.isAdmin && (
                                            <BadgeCheck className="w-5 h-5 text-pink-600 fill-pink-100 dark:fill-pink-900/30" strokeWidth={2.5} />
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsEditProfileOpen(true)}
                                        className="text-xs font-medium text-pink-600 dark:text-pink-400 hover:underline flex items-center gap-1"
                                    >
                                        <Edit2 size={12} />
                                        {t('account.edit_profile')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Security Section */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('account.security')}</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 divide-y divide-gray-100 dark:divide-neutral-800 overflow-hidden">
                                <button
                                    onClick={() => setIsChangePasswordOpen(true)}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                                        <Key className="text-blue-600 dark:text-blue-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.change_password')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.change_password_desc')}</p>
                                    </div>
                                </button>
                                <button
                                    onClick={() => onNavigate('two-factor')}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className={`p-1.5 rounded-md ${twoFAEnabled ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-purple-50 dark:bg-purple-900/20'}`}>
                                        {twoFAEnabled
                                            ? <ShieldCheck className="text-emerald-600 dark:text-emerald-400" size={18} />
                                            : <Shield className="text-purple-600 dark:text-purple-400" size={18} />
                                        }
                                    </div>
                                    <div className="text-start flex-1">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.2fa')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.2fa_desc')}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${twoFAEnabled ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400'}`}>
                                        {twoFAEnabled ? t('account.2fa_enabled') : t('account.2fa_disabled')}
                                    </span>
                                </button>
                                <button
                                    onClick={() => onNavigate('sessions')}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start"
                                >
                                    <div className="p-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-md">
                                        <ShieldAlert className="text-orange-600 dark:text-orange-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.sessions')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.sessions_desc')}</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Data Section */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('settings.group.data')}</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden">
                                {/* Save button */}
                                <button
                                    onClick={handleSave}
                                    disabled={savingCloud}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition text-start border-b border-gray-100 dark:border-neutral-800 disabled:opacity-50"
                                >
                                    <div className="p-1.5 bg-pink-50 dark:bg-pink-900/20 rounded-md">
                                        {savingCloud ? <Loader2 className="text-pink-600 dark:text-pink-400 animate-spin" size={18} /> : <UploadCloud className="text-pink-600 dark:text-pink-400" size={18} />}
                                    </div>
                                    <div className="text-start flex-1">
                                        <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t('account.backup_cloud')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.backup_cloud_desc')}</p>
                                    </div>
                                    {backupList.length > 0 && (
                                        <span className="text-xs text-gray-400 tabular-nums">{backupList.length}/10</span>
                                    )}
                                </button>

                                {/* Backup list */}
                                {backupsLoading ? (
                                    <div className="flex justify-center py-6">
                                        <Loader2 className="animate-spin text-gray-300" size={20} />
                                    </div>
                                ) : backupList.length === 0 ? (
                                    <div className="px-6 py-5 flex flex-col items-center gap-2">
                                        <Cloud size={28} className="text-gray-300 dark:text-neutral-600" />
                                        <p className="text-xs text-gray-400 dark:text-neutral-500">{t('account.no_backups')}</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                                        {backupList.map(b => (
                                            <div key={b.id}>
                                                <div className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 dark:hover:bg-neutral-800/30 transition-colors cursor-pointer" onClick={() => toggleExpand(b)}>
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className="p-1 bg-gray-100 dark:bg-neutral-800 rounded">
                                                            <HardDrive size={14} className="text-gray-400" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                                                                {new Date(b.created_at * 1000).toLocaleString()}
                                                            </p>
                                                            <p className="text-xs text-gray-400">{formatBytes(b.data_size)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteBackup(b.id); }}
                                                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ${expandedId === b.id ? 'rotate-180' : 'rotate-0'}`} />
                                                    </div>
                                                </div>
                                                {/* Inline dropdown */}
                                                <div className={`grid transition-all duration-300 ease-in-out ${expandedId === b.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                                    <div className="overflow-hidden">
                                                        <div className="px-6 pb-4 pt-1 space-y-3">
                                                            {expandLoading === b.id ? (
                                                                <div className="flex justify-center py-6">
                                                                    <Loader2 className="animate-spin text-gray-300" size={20} />
                                                                </div>
                                                            ) : expandedData[b.id] ? (() => {
                                                                const data = expandedData[b.id];
                                                                const diff = computeDiff(data);
                                                                const showingDiff = mergeDiffId === b.id;
                                                                return (
                                                                <>
                                                                    {/* Stats grid */}
                                                                    <div className="grid grid-cols-4 gap-2">
                                                                        <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-lg p-2.5 text-center">
                                                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t('account.backup_doses')}</p>
                                                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{(data.events || []).length}</p>
                                                                        </div>
                                                                        <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-lg p-2.5 text-center">
                                                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t('account.backup_weight')}</p>
                                                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{data.weight ? `${data.weight}` : '\u2014'}</p>
                                                                        </div>
                                                                        <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-lg p-2.5 text-center">
                                                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t('account.backup_labs')}</p>
                                                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{(data.labResults || []).length}</p>
                                                                        </div>
                                                                        <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-lg p-2.5 text-center">
                                                                            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{t('account.backup_templates')}</p>
                                                                            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">{(data.doseTemplates || []).length}</p>
                                                                        </div>
                                                                    </div>

                                                                    {/* Recent doses */}
                                                                    {(data.events || []).length > 0 && (
                                                                        <div className="border border-gray-200 dark:border-neutral-800 rounded-lg overflow-hidden">
                                                                            <div className="divide-y divide-gray-100 dark:divide-neutral-800">
                                                                                {(data.events as any[]).slice(0, 3).map((ev: any, i: number) => (
                                                                                    <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <span className="px-1.5 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 rounded font-medium">{ev.ester}</span>
                                                                                            <span className="text-gray-500">{ev.route}</span>
                                                                                        </div>
                                                                                        <span className="font-semibold text-gray-900 dark:text-gray-100 tabular-nums">{ev.doseMG} mg</span>
                                                                                    </div>
                                                                                ))}
                                                                                {(data.events || []).length > 3 && (
                                                                                    <div className="px-3 py-1.5 text-[10px] text-gray-400 text-center bg-gray-50 dark:bg-neutral-800/50">
                                                                                        +{(data.events || []).length - 3} ...
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Merge diff panel */}
                                                                    <div className={`grid transition-all duration-300 ease-in-out ${showingDiff ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                                                        <div className="overflow-hidden">
                                                                            <div className="space-y-2 pt-1">
                                                                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t('account.merge_preview')}</p>
                                                                                {diff.totalDiff === 0 ? (
                                                                                    <p className="text-xs text-gray-400 py-2 text-center">{t('account.nothing_to_merge')}</p>
                                                                                ) : (
                                                                                    <div className="space-y-1.5">
                                                                                        {/* Cloud → Local (mergeable) */}
                                                                                        {diff.newEvents.length > 0 && (
                                                                                            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5 mb-1">
                                                                                                    <Plus size={12} className="text-emerald-600" />
                                                                                                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">{t('account.new_doses')} ({diff.newEvents.length})</span>
                                                                                                </div>
                                                                                                <div className="space-y-0.5">
                                                                                                    {diff.newEvents.slice(0, 3).map((ev: any, i: number) => (
                                                                                                        <div key={i} className="text-[11px] text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                                                                                            <span className="font-medium">{ev.ester}</span>
                                                                                                            <span className="text-emerald-600/70 dark:text-emerald-400/70">{ev.route}</span>
                                                                                                            <span className="ml-auto font-semibold tabular-nums">{ev.doseMG} mg</span>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                    {diff.newEvents.length > 3 && (
                                                                                                        <p className="text-[10px] text-emerald-600/60">+{diff.newEvents.length - 3} ...</p>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.newLabs.length > 0 && (
                                                                                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <Plus size={12} className="text-blue-600" />
                                                                                                    <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">{t('account.new_labs')} ({diff.newLabs.length})</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.newTemplates.length > 0 && (
                                                                                            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <Plus size={12} className="text-violet-600" />
                                                                                                    <span className="text-[10px] font-bold text-violet-700 dark:text-violet-400 uppercase">{t('account.new_templates')} ({diff.newTemplates.length})</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {/* Local → Cloud (local-only, info) */}
                                                                                        {diff.localOnlyEvents.length > 0 && (
                                                                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5 mb-1">
                                                                                                    <Minus size={12} className="text-amber-600" />
                                                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">{t('account.local_only_doses')} ({diff.localOnlyEvents.length})</span>
                                                                                                </div>
                                                                                                <div className="space-y-0.5">
                                                                                                    {diff.localOnlyEvents.slice(0, 3).map((ev: any, i: number) => (
                                                                                                        <div key={i} className="text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                                                                                                            <span className="font-medium">{ev.ester}</span>
                                                                                                            <span className="text-amber-600/70 dark:text-amber-400/70">{ev.route}</span>
                                                                                                            <span className="ml-auto font-semibold tabular-nums">{ev.doseMG} mg</span>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                    {diff.localOnlyEvents.length > 3 && (
                                                                                                        <p className="text-[10px] text-amber-600/60">+{diff.localOnlyEvents.length - 3} ...</p>
                                                                                                    )}
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.localOnlyLabs.length > 0 && (
                                                                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <Minus size={12} className="text-amber-600" />
                                                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">{t('account.local_only_labs')} ({diff.localOnlyLabs.length})</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.localOnlyTemplates.length > 0 && (
                                                                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-2.5">
                                                                                                <div className="flex items-center gap-1.5">
                                                                                                    <Minus size={12} className="text-amber-600" />
                                                                                                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">{t('account.local_only_templates')} ({diff.localOnlyTemplates.length})</span>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                {diff.total > 0 && (
                                                                                    <button
                                                                                        onClick={() => { onCloudMerge(b.id); setExpandedId(null); setMergeDiffId(null); }}
                                                                                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                                                                    >
                                                                                        <Merge size={13} />
                                                                                        {t('account.confirm_merge')} (+{diff.total})
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Action buttons */}
                                                                    <div className="flex gap-2 pt-1">
                                                                        <button
                                                                            onClick={() => setMergeDiffId(showingDiff ? null : b.id)}
                                                                            className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${showingDiff ? 'bg-gray-200 dark:bg-neutral-700 text-gray-900 dark:text-gray-100' : 'bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-gray-900 dark:text-gray-100'}`}
                                                                        >
                                                                            <Merge size={14} />
                                                                            {t('account.merge')}
                                                                            {diff.total > 0 && <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">+{diff.total}</span>}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => { onCloudLoad(b.id); setExpandedId(null); }}
                                                                            className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                                                                        >
                                                                            <DownloadCloud size={14} />
                                                                            {t('account.restore')}
                                                                        </button>
                                                                    </div>
                                                                </>
                                                                );
                                                            })() : null}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Danger Zone */}
                        <div className="space-y-2">
                            <h3 className="px-4 text-xs font-bold text-red-500 uppercase tracking-wider">{t('account.danger_zone')}</h3>
                            <div className="bg-white dark:bg-neutral-900 rounded-lg border border-red-200 dark:border-red-900/30 overflow-hidden">
                                <button
                                    onClick={() => setIsDeleteAccountOpen(true)}
                                    className="w-full flex items-center gap-3 px-6 py-4 hover:bg-red-50 dark:hover:bg-red-900/10 transition text-start"
                                >
                                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-md">
                                        <Trash2 className="text-red-600 dark:text-red-400" size={18} />
                                    </div>
                                    <div className="text-start">
                                        <p className="font-medium text-red-600 dark:text-red-400 text-sm">{t('account.delete_account')}</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('account.delete_account_desc')}</p>
                                    </div>
                                </button>
                            </div>
                        </div>

                        {/* Logout */}
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 px-6 py-2 rounded-md transition-colors text-sm font-medium"
                            >
                                <LogOut size={16} />
                                {t('account.sign_out')}
                            </button>
                        </div>

                        <EditProfileModal
                            isOpen={isEditProfileOpen}
                            onClose={() => setIsEditProfileOpen(false)}
                        />
                        <ChangePasswordModal
                            isOpen={isChangePasswordOpen}
                            onClose={() => setIsChangePasswordOpen(false)}
                        />
                        <DeleteAccountModal
                            isOpen={isDeleteAccountOpen}
                            onClose={() => setIsDeleteAccountOpen(false)}
                        />



                    </>
                ) : (
                    <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 overflow-hidden transition-colors duration-300">
                        <form onSubmit={handleAuthSubmit} className="px-6 py-5 space-y-4">
                            {authError && (
                                <div className="p-2.5 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md border border-red-200 dark:border-red-900/30">
                                    {authError}
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.username')}</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-m3-primary)] focus:border-[var(--color-m3-primary)] transition-all text-gray-900 dark:text-gray-100"
                                    placeholder={t('auth.username_placeholder')}
                                    autoComplete="username"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.password')}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-m3-primary)] focus:border-[var(--color-m3-primary)] transition-all text-gray-900 dark:text-gray-100"
                                    placeholder={t('auth.password_placeholder')}
                                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    required
                                />
                            </div>
                            {needsTOTP && isLogin && (
                                <div className="space-y-3">
                                    <div className="p-2.5 text-xs text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 rounded-md border border-blue-200 dark:border-blue-800/40 flex items-center gap-2">
                                        <Shield size={14} className="shrink-0" />
                                        {t('auth.needs_2fa')}
                                    </div>
                                    {useBackupCode ? (
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.backup_code_label')}</label>
                                            <input
                                                type="text"
                                                value={backupCode}
                                                onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                                className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-m3-primary)] focus:border-[var(--color-m3-primary)] transition-all text-gray-900 dark:text-gray-100 tracking-[0.1em] font-mono text-center"
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
                                                <div className="space-y-1.5">
                                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('auth.totp_code')}</label>
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        pattern="[0-9]{6}"
                                                        maxLength={6}
                                                        value={totpCode}
                                                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                        className="w-full px-3 py-2.5 text-sm bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-m3-primary)] focus:border-[var(--color-m3-primary)] transition-all text-gray-900 dark:text-gray-100 tracking-[0.15em] font-mono text-center"
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
                                                            <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
                                                            <span className="text-xs text-gray-400 dark:text-neutral-500">or</span>
                                                            <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handlePasskeyLogin}
                                                        disabled={passkeyLoading}
                                                        className="w-full py-2.5 text-sm font-medium border border-gray-200 dark:border-neutral-700 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800 transition text-gray-700 dark:text-gray-300 disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {passkeyLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                                                        {t('auth.passkey_as_2fa')}
                                                    </button>
                                                </>
                                            )}
                                            <button type="button" onClick={() => setUseBackupCode(true)}
                                                className="w-full text-xs text-gray-400 dark:text-neutral-500 hover:text-gray-600 dark:hover:text-gray-300 text-center py-1 transition-colors">
                                                {t('auth.use_backup_code')}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                            {!(needsTOTP && twoFAMethod === 'passkey' && !useBackupCode) && (
                            <button
                                type="submit"
                                disabled={authLoading}
                                className="w-full py-2.5 text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {authLoading && <Loader2 size={16} className="animate-spin" />}
                                {isLogin ? t('auth.sign_in') : t('auth.sign_up')}
                            </button>
                            )}
                            {isLogin && !needsTOTP && typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
                                        <span className="text-xs text-gray-400 dark:text-neutral-500">or</span>
                                        <div className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handlePasskeyLogin}
                                        disabled={passkeyLoading}
                                        className="w-full py-2.5 text-sm font-medium border border-gray-200 dark:border-neutral-700 rounded-md hover:bg-gray-50 dark:hover:bg-neutral-800 transition text-gray-700 dark:text-gray-300 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {passkeyLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                                        {t('auth.passkey_login')}
                                    </button>
                                </>
                            )}
                            <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                                {isLogin ? t('auth.no_account') : t('auth.has_account')}
                                <button
                                    type="button"
                                    onClick={() => { setIsLogin(!isLogin); setAuthError(null); }}
                                    className="text-[var(--color-m3-primary)] font-medium hover:underline ml-1"
                                >
                                    {isLogin ? t('auth.go_register') : t('auth.go_login')}
                                </button>
                            </p>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Account;
