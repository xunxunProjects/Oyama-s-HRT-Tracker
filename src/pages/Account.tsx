import React, { useState, useEffect, useMemo } from 'react';
import { UploadCloud, LogOut, BadgeCheck, Edit2, Loader2, Trash2, Cloud, HardDrive, DownloadCloud, Merge, ChevronDown, Plus, Minus, Fingerprint, Lock, MonitorSmartphone } from 'lucide-react';
import ShieldIcon from '../components/ShieldIcon';
import { SettingsListItem } from '../components/SettingsListItem';

import { useAuth } from '../contexts/AuthContext';
import { cloudService, BackupMeta } from '../services/cloud';
import { readCloudBackup, unlockCloudBackup, normalizeBackupPayload } from '../utils/cloudBackup';
import { useDialog } from '../contexts/DialogContext';
import { authService, serializeAssertionCredential, b64url2ab } from '../services/auth';
import PasswordInputModal from '../components/PasswordInputModal';

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

const divider = "border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]";
const sectionLabel = "text-xs font-semibold uppercase tracking-wide text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-2 block";
const rowBase = `w-full flex items-center gap-3 py-4 ${divider} text-start`;
const iconCls = "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0";
const statusMuted = "text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0";

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
    const [avatarError, setAvatarError] = useState(false);
    // Bust the avatar cache once per mount so returning from the edit-avatar
    // page (which remounts Account) reflects a freshly uploaded image.
    const avatarCacheBuster = useMemo(() => Date.now(), []);
    const avatarUrl = `/api/user/avatar/${user?.username}?t=${avatarCacheBuster}`;
    const [backupList, setBackupList] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const [savingCloud, setSavingCloud] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedData, setExpandedData] = useState<Record<string, any>>({});
    const [expandLoading, setExpandLoading] = useState<string | null>(null);
    const [mergeDiffId, setMergeDiffId] = useState<string | null>(null);
    // Unlock prompt for end-to-end-encrypted backups when this device lacks the key.
    const [unlockTarget, setUnlockTarget] = useState<{ rawData: any; backupId: string } | null>(null);
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [unlockLoading, setUnlockLoading] = useState(false);
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
        if (expandedData[b.id]) return;
        setExpandLoading(b.id);
        try {
            const backup = await cloudService.loadOne(token!, b.id);
            const res = await readCloudBackup(backup.data);
            if (res.status === 'ok') {
                setExpandedData(prev => ({ ...prev, [b.id]: normalizeBackupPayload(res.data) }));
            } else if (res.status === 'locked') {
                // Encrypted but no key on this device — ask for the password.
                setExpandLoading(null);
                setUnlockError(null);
                setUnlockTarget({ rawData: backup.data, backupId: b.id });
            } else {
                showDialog('alert', t('account.load_backup_failed'));
                setExpandedId(null);
            }
        } catch {
            showDialog('alert', t('account.load_backup_failed'));
            setExpandedId(null);
        } finally { setExpandLoading(null); }
    };

    const handleUnlockSubmit = async (password: string) => {
        if (!unlockTarget || !user) return;
        setUnlockLoading(true);
        setUnlockError(null);
        try {
            const res = await unlockCloudBackup(unlockTarget.rawData, password, user.id);
            if (res.status === 'ok') {
                setExpandedData(prev => ({ ...prev, [unlockTarget.backupId]: normalizeBackupPayload(res.data) }));
                setExpandedId(unlockTarget.backupId);
                setUnlockTarget(null);
            } else {
                // Wrong password, or the backup was encrypted under an old password.
                setUnlockError(t('account.unlock_failed'));
            }
        } finally {
            setUnlockLoading(false);
        }
    };

    const cancelUnlock = () => {
        setUnlockTarget(null);
        setUnlockError(null);
        setExpandedId(null);
    };

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

    const inputCls = "w-full px-3 py-2.5 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--color-m3-primary)]/30 focus:border-[var(--color-m3-primary)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]";

    return (
        <div className="relative pb-32 px-6 md:px-10">
            <h1 className="sticky top-0 z-20 -mx-6 md:-mx-10 px-6 md:px-10 pt-8 pb-3 mb-3 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] text-xl font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                {t('account.title')}
            </h1>

            {user ? (
                <div className="max-w-2xl">
                    {/* Profile */}
                    <div className={`flex flex-col items-center py-6 gap-2 ${divider} mb-6`}>
                        <button
                            type="button"
                            onClick={() => onNavigate('edit-avatar')}
                            className="relative group w-28 h-28 rounded-full overflow-hidden cursor-pointer bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] focus:outline-none focus:ring-2 focus:ring-[var(--color-m3-primary)]/40 focus:ring-offset-2 focus:ring-offset-[var(--color-m3-surface)] dark:focus:ring-offset-[var(--color-m3-dark-surface)]"
                            aria-label={t('avatar.change')}
                        >
                            <img
                                src={avatarUrl}
                                alt={user.username}
                                className={`w-full h-full object-cover absolute inset-0 z-10 ${avatarError ? 'hidden' : 'block'}`}
                                onError={() => setAvatarError(true)}
                            />
                            <div className="w-full h-full flex items-center justify-center text-4xl font-light text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] absolute inset-0">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center z-20">
                                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity font-medium text-xs">
                                    {t('avatar.change')}
                                </span>
                            </div>
                        </button>
                        <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-lg">{user.username}</span>
                            {user.isAdmin && (
                                <BadgeCheck className="w-5 h-5 text-[var(--color-m3-primary)]" strokeWidth={2.5} />
                            )}
                        </div>
                        <button
                            onClick={() => onNavigate('edit-profile')}
                            className="text-xs text-[var(--color-m3-primary)] flex items-center gap-1"
                        >
                            <Edit2 size={12} />
                            {t('account.edit_profile')}
                        </button>
                    </div>

                    {/* Security */}
                    <div className="mb-6">
                        <span className={sectionLabel}>{t('account.security')}</span>
                        <SettingsListItem
                            icon={Lock}
                            title={t('account.change_password')}
                            description={t('account.change_password_desc')}
                            onClick={() => onNavigate('change-password')}
                        />
                        <SettingsListItem
                            icon={ShieldIcon}
                            title={t('account.2fa')}
                            description={t('account.2fa_desc')}
                            onClick={() => onNavigate('two-factor')}
                            trailing={
                                <span className={statusMuted}>
                                    {twoFAEnabled ? t('account.2fa_enabled') : t('account.2fa_disabled')}
                                </span>
                            }
                        />
                        <SettingsListItem
                            icon={MonitorSmartphone}
                            title={t('account.sessions')}
                            description={t('account.sessions_desc')}
                            onClick={() => onNavigate('sessions')}
                        />
                    </div>

                    {/* Data / Cloud */}
                    <div className="mb-6">
                        <span className={sectionLabel}>{t('settings.group.data')}</span>
                        <button
                            onClick={handleSave}
                            disabled={savingCloud}
                            className={`${rowBase} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] -mx-2 px-2 rounded disabled:opacity-50`}
                        >
                            {savingCloud
                                ? <Loader2 className={`${iconCls} animate-spin`} size={18} />
                                : <UploadCloud className={iconCls} size={18} />
                            }
                            <div className="flex-1 text-start">
                                <p className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] text-sm">{t('account.backup_cloud')}</p>
                                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.backup_cloud_desc')}</p>
                            </div>
                            {backupList.length > 0 && (
                                <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] tabular-nums shrink-0">{backupList.length}/10</span>
                            )}
                        </button>

                        {/* Backup list */}
                        {backupsLoading ? (
                            <div className="flex justify-center py-6">
                                <Loader2 className="animate-spin text-[var(--color-m3-on-surface-variant)]" size={20} />
                            </div>
                        ) : backupList.length === 0 ? (
                            <div className="py-6 flex flex-col items-center gap-2">
                                <Cloud size={28} className="text-[var(--color-m3-outline)] dark:text-[var(--color-m3-dark-outline)]" />
                                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.no_backups')}</p>
                            </div>
                        ) : (
                            backupList.map(b => (
                                <div key={b.id} className={divider}>
                                    <div
                                        className="flex items-center py-3 cursor-pointer hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] -mx-2 px-2 rounded"
                                        onClick={() => toggleExpand(b)}
                                    >
                                        <HardDrive size={14} className={`${iconCls} mr-3`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] truncate">
                                                {new Date(b.created_at * 1000).toLocaleString()}
                                            </p>
                                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{formatBytes(b.data_size)}</p>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteBackup(b.id); }}
                                            className="p-1.5 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-red-500 rounded shrink-0"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                        <ChevronDown size={14} className={`${iconCls} ${expandedId === b.id ? 'rotate-180' : ''}`} />
                                    </div>
                                    <div className={`grid ${expandedId === b.id ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                        <div className="overflow-hidden">
                                            <div className="pb-4 pt-1 space-y-3">
                                                {expandLoading === b.id ? (
                                                    <div className="flex justify-center py-6">
                                                        <Loader2 className="animate-spin text-[var(--color-m3-on-surface-variant)]" size={20} />
                                                    </div>
                                                ) : expandedData[b.id] ? (() => {
                                                    const data = expandedData[b.id];
                                                    const diff = computeDiff(data);
                                                    const showingDiff = mergeDiffId === b.id;
                                                    return (
                                                        <>
                                                            {/* Stats row */}
                                                            <div className="grid grid-cols-4 gap-3 py-2">
                                                                {[
                                                                    { label: t('account.backup_doses'), val: (data.events || []).length },
                                                                    { label: t('account.backup_weight'), val: data.weight ?? '—' },
                                                                    { label: t('account.backup_labs'), val: (data.labResults || []).length },
                                                                    { label: t('account.backup_templates'), val: (data.doseTemplates || []).length },
                                                                ].map(({ label, val }) => (
                                                                    <div key={label} className="text-center">
                                                                        <p className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider font-medium">{label}</p>
                                                                        <p className="text-sm font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] mt-0.5 tabular-nums">{val}</p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Recent doses preview */}
                                                            {(data.events || []).length > 0 && (
                                                                <div>
                                                                    {(data.events as any[]).slice(0, 3).map((ev: any, i: number) => (
                                                                        <div key={i} className={`flex items-center justify-between py-2 text-xs ${divider} last:border-b-0`}>
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-medium text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{ev.ester}</span>
                                                                                <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{ev.route}</span>
                                                                            </div>
                                                                            <span className="font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] tabular-nums">{ev.doseMG} mg</span>
                                                                        </div>
                                                                    ))}
                                                                    {(data.events || []).length > 3 && (
                                                                        <p className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] text-center py-1.5">
                                                                            +{(data.events || []).length - 3} …
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Merge diff panel */}
                                                            <div className={`grid ${showingDiff ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                                                <div className="overflow-hidden">
                                                                    <div className="space-y-2 pt-2">
                                                                        <p className="text-[10px] font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('account.merge_preview')}</p>
                                                                        {diff.totalDiff === 0 ? (
                                                                            <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] py-2 text-center">{t('account.nothing_to_merge')}</p>
                                                                        ) : (
                                                                            <div className="space-y-1.5">
                                                                                {diff.newEvents.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Plus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('account.new_doses')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-medium tabular-nums">+{diff.newEvents.length}</span>
                                                                                    </div>
                                                                                )}
                                                                                {diff.newLabs.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Plus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('account.new_labs')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-medium tabular-nums">+{diff.newLabs.length}</span>
                                                                                    </div>
                                                                                )}
                                                                                {diff.newTemplates.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Plus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">{t('account.new_templates')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] font-medium tabular-nums">+{diff.newTemplates.length}</span>
                                                                                    </div>
                                                                                )}
                                                                                {diff.localOnlyEvents.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Minus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.local_only_doses')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium tabular-nums">{diff.localOnlyEvents.length}</span>
                                                                                    </div>
                                                                                )}
                                                                                {diff.localOnlyLabs.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Minus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.local_only_labs')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium tabular-nums">{diff.localOnlyLabs.length}</span>
                                                                                    </div>
                                                                                )}
                                                                                {diff.localOnlyTemplates.length > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-xs">
                                                                                        <Minus size={12} strokeWidth={1.5} className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0" />
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.local_only_templates')}</span>
                                                                                        <span className="text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium tabular-nums">{diff.localOnlyTemplates.length}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                        {diff.total > 0 && (
                                                                            <button
                                                                                onClick={() => { onCloudMerge(b.id); setExpandedId(null); setMergeDiffId(null); }}
                                                                                className="w-full py-2 bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white text-xs font-medium rounded-md flex items-center justify-center gap-1.5 mt-1 transition-colors"
                                                                            >
                                                                                <Merge size={13} strokeWidth={1.5} />
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
                                                                    className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 border transition-colors ${showingDiff
                                                                        ? 'bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]'
                                                                        : 'border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container-low)] dark:hover:bg-[var(--color-m3-dark-surface-container-high)]'
                                                                    }`}
                                                                >
                                                                    <Merge size={13} strokeWidth={1.5} />
                                                                    {t('account.merge')}
                                                                    {diff.total > 0 && <span className="text-[10px] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium">+{diff.total}</span>}
                                                                </button>
                                                                <button
                                                                    onClick={() => { onCloudLoad(b.id); setExpandedId(null); }}
                                                                    className="flex-1 py-2 bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors"
                                                                >
                                                                    <DownloadCloud size={13} strokeWidth={1.5} />
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
                            ))
                        )}
                    </div>

                    {/* Danger Zone */}
                    <div className="mb-6">
                        <span className={`${sectionLabel} text-red-500`}>{t('account.danger_zone')}</span>
                        <button
                            onClick={() => onNavigate('delete-account')}
                            className={`${rowBase} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] -mx-2 px-2 rounded`}
                        >
                            <Trash2 className="text-red-500 shrink-0" size={18} />
                            <div className="text-start">
                                <p className="font-medium text-red-600 dark:text-red-400 text-sm">{t('account.delete_account')}</p>
                                <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.delete_account_desc')}</p>
                            </div>
                        </button>
                    </div>

                    {/* Sign out */}
                    <div className="flex justify-center pt-2">
                        <button
                            onClick={onLogout}
                            className="flex items-center gap-2 text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] px-6 py-2 rounded-md text-sm"
                        >
                            <LogOut size={16} />
                            {t('account.sign_out')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="max-w-sm">
                    {/* Login / Register tabs */}
                    <div className={`flex gap-5 ${divider} mb-5`}>
                        {[
                            { key: true, label: t('auth.sign_in') },
                            { key: false, label: t('auth.sign_up') },
                        ].map(({ key, label }) => (
                            <button
                                key={String(key)}
                                onClick={() => { setIsLogin(key); setAuthError(null); setNeedsTOTP(false); }}
                                className={`text-sm pb-2 -mb-px border-b-2 ${isLogin === key
                                    ? 'font-semibold text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] border-[var(--color-m3-primary)]'
                                    : 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] border-transparent'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleAuthSubmit} className="space-y-4">
                        {authError && (
                            <p className="text-sm text-red-500 dark:text-red-400">
                                {authError}
                            </p>
                        )}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('auth.username')}</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={inputCls}
                                style={{ fontSize: '16px' }}
                                placeholder={t('auth.username_placeholder')}
                                autoComplete="username"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('auth.password')}</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={inputCls}
                                style={{ fontSize: '16px' }}
                                placeholder={t('auth.password_placeholder')}
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                                required
                            />
                        </div>
                        {needsTOTP && isLogin && (
                            <div className="space-y-3">
                                <div className="p-2.5 text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] rounded-md flex items-center gap-2">
                                    <ShieldIcon size={16} className="shrink-0 text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]" />
                                    {t('auth.needs_2fa')}
                                </div>
                                {useBackupCode ? (
                                    <div className="space-y-1.5">
                                        <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('auth.backup_code_label')}</label>
                                        <input
                                            type="text"
                                            value={backupCode}
                                            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                                            className={`${inputCls} tracking-[0.1em] font-mono text-center`}
                                            style={{ fontSize: '16px' }}
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
                                                <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] uppercase tracking-wider">{t('auth.totp_code')}</label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]{6}"
                                                    maxLength={6}
                                                    value={totpCode}
                                                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    className={`${inputCls} tracking-[0.15em] font-mono text-center`}
                                                    style={{ fontSize: '16px' }}
                                                    placeholder={t('auth.totp_placeholder')}
                                                    autoComplete="one-time-code"
                                                    autoFocus
                                                    required={needsTOTP && !useBackupCode}
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
                                                        <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                                        <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">or</span>
                                                        <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={handlePasskeyLogin}
                                                    disabled={passkeyLoading}
                                                    className="w-full py-2.5 text-sm font-medium border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] disabled:opacity-50 flex items-center justify-center gap-2"
                                                >
                                                    {passkeyLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                                                    {t('auth.passkey_as_2fa')}
                                                </button>
                                            </>
                                        )}
                                        <button type="button" onClick={() => setUseBackupCode(true)}
                                            className="w-full text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] text-center py-1">
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
                                className="w-full py-2.5 text-sm font-medium bg-[var(--color-m3-primary)] hover:bg-[var(--color-m3-primary-light)] text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {authLoading && <Loader2 size={16} className="animate-spin" />}
                                {isLogin ? t('auth.sign_in') : t('auth.sign_up')}
                            </button>
                        )}
                        {isLogin && !needsTOTP && typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                            <>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                    <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">or</span>
                                    <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                </div>
                                <button
                                    type="button"
                                    onClick={handlePasskeyLogin}
                                    disabled={passkeyLoading}
                                    className="w-full py-2.5 text-sm font-medium border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {passkeyLoading ? <Loader2 size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                                    {t('auth.passkey_login')}
                                </button>
                            </>
                        )}
                    </form>
                </div>
            )}

            <PasswordInputModal
                isOpen={!!unlockTarget}
                onClose={cancelUnlock}
                onConfirm={handleUnlockSubmit}
                title={t('account.unlock_title')}
                description={t('account.unlock_desc')}
                error={unlockError}
                loading={unlockLoading}
                masked
            />
        </div>
    );
};

export default Account;
