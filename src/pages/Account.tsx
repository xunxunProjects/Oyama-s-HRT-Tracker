import React, { useState, useEffect, useMemo } from 'react';
import { UploadCloud, LogOut, BadgeCheck, Edit2, Loader2, Trash2, Cloud, HardDrive, DownloadCloud, Merge, ChevronDown, Plus, Minus, Fingerprint, Lock, MonitorSmartphone, CloudOff, CheckCircle2, AlertCircle } from 'lucide-react';
import ShieldIcon from '../components/ShieldIcon';
import { SettingsListItem } from '../components/SettingsListItem';

import { useAuth } from '../contexts/AuthContext';
import { cloudService, BackupMeta } from '../services/cloud';
import { readCloudBackup, unlockCloudBackup, normalizeBackupPayload, hasCloudKey, deriveAndCacheCloudKey } from '../utils/cloudBackup';
import { useDialog } from '../contexts/DialogContext';
import { authService, serializeAssertionCredential, b64url2ab, sessionIdFromToken } from '../services/auth';
import PasswordInputModal from '../components/PasswordInputModal';
import { SyncStatus } from '../hooks/useCloudSync';

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
    onLogout: () => void;
    onCloudSave: () => void;
    onCloudLoad: (backupId?: string) => void;
    onCloudMerge: (backupId: string) => void;
    localData: LocalData;
    onNavigate: (view: string) => void;
    twoFAEnabled: boolean;
    onTwoFAStatusChange: (enabled: boolean) => void;
    syncStatus: SyncStatus;
    lastSyncedAt: number | null;
}

const divider = "border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]";
const sectionLabel ="text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] mb-2 block";
const rowBase = `w-full flex items-center gap-3 py-4 ${divider} text-start`;
const iconCls = "text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0";
const statusMuted = "text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] shrink-0";

/**
 * Why the password prompt is open.
 *
 * `expand` is one encrypted backup in the list the user asked to look inside.
 * `sync` is the whole device having no key at all — the state that shows as
 * "cloud archive is encrypted, unlock it first" and, until it is cleared, stops
 * every backup this device would otherwise write.
 */
type UnlockTarget =
    | { purpose: 'expand'; rawData: any; backupId: string }
    | { purpose: 'sync' };

const SyncIcon: React.FC<{ status: SyncStatus; className?: string }> = ({ status, className }) => {
    switch (status) {
        case 'syncing': return <Loader2 size={18} className={`${className} animate-spin`} />;
        case 'synced': return <CheckCircle2 size={18} className={className} />;
        case 'locked': return <Lock size={18} className={className} />;
        case 'error': return <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0" />;
        case 'off': return <CloudOff size={18} className={className} />;
        default: return <Cloud size={18} className={className} />;
    }
};

const Account: React.FC<AccountProps> = ({
    t,
    user,
    token,
    onLogout,
    onCloudSave,
    onCloudLoad,
    onCloudMerge,
    localData,
    onNavigate,
    twoFAEnabled,
    onTwoFAStatusChange,
    syncStatus,
    lastSyncedAt,
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
    const [unlockTarget, setUnlockTarget] = useState<UnlockTarget | null>(null);
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

    // `silent` refreshes the list in place. Sync reports in on its own schedule
    // — including a poll every few minutes — and swapping the whole list for a
    // spinner each time it does would have the page blinking at someone who
    // never asked for anything.
    const fetchBackups = async (silent = false) => {
        if (!token) return;
        if (!silent) setBackupsLoading(true);
        try {
            const list = await cloudService.listMeta(token);
            setBackupList(list);
        } catch { if (!silent) setBackupList([]); }
        finally { if (!silent) setBackupsLoading(false); }
    };

    useEffect(() => {
        if (user && token) {
            fetchBackups();
            authService.get2FAStatus(token).then(s => onTwoFAStatusChange(s.enabled)).catch(() => {});
        }
    }, [user, token]);

    // A sync that uploaded leaves a new revision behind; refresh so the list
    // below isn't showing a version that has already been superseded.
    useEffect(() => {
        if (lastSyncedAt && user && token) fetchBackups(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastSyncedAt]);

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
                setUnlockTarget({ purpose: 'expand', rawData: backup.data, backupId: b.id });
            } else {
                showDialog('alert', t('account.load_backup_failed'));
                setExpandedId(null);
            }
        } catch {
            showDialog('alert', t('account.load_backup_failed'));
            setExpandedId(null);
        } finally { setExpandLoading(null); }
    };

    /**
     * Ask the server whether this is really the account password.
     *
     * Only needed where there is no ciphertext to try a derived key against. The
     * key derivation itself accepts anything — it is PBKDF2 over the password and
     * the user id, with nothing to check the result against — so without this a
     * typo would be cached as this device's key and every upload after it
     * encrypted under something no other device can derive.
     *
     * `/api/login` compares the password before it looks at second factors, so a
     * correct one comes back either as a 2FA challenge or as a session. The
     * session is revoked immediately: the user asked to unlock, not to sign in
     * again, and an extra row in their device list is not what they meant.
     */
    const passwordIsCurrent = async (password: string): Promise<boolean> => {
        try {
            const data = await authService.login(user.username, password);
            const sid = sessionIdFromToken(data.token);
            if (sid) {
                try { await authService.terminateSession(data.token, sid); } catch { /* revoke is best-effort */ }
            }
            return true;
        } catch (e: any) {
            // The password cleared the bcrypt check and the server moved on to
            // asking for a second factor — which is all this needed to know.
            return !!e?.needs2FA;
        }
    };

    /**
     * Give this device the cloud key, so sync can stop reporting `locked`.
     *
     * Prove the password against a real backup wherever there is one: the key is
     * only worth caching once it has actually decrypted something, and a wrong
     * one cached here would go on to encrypt uploads no other device can read.
     * An empty cloud, a plaintext backup from an older build, and a body that
     * will not parse all leave nothing to decrypt, so those fall back to asking
     * the server rather than trusting whatever was typed.
     */
    const unlockSync = async (password: string) => {
        if (!token || !user) return;
        const metas = backupList.length ? backupList : await cloudService.listMeta(token);
        const newest = metas.length
            ? metas.reduce((a, b) => (b.created_at > a.created_at ? b : a))
            : null;

        if (newest) {
            const backup = await cloudService.loadOne(token, newest.id);
            const res = await unlockCloudBackup(backup.data, password, user.id);
            // `locked` here means ciphertext that stayed shut — a wrong password,
            // or an origin where the key cannot be derived at all.
            if (res.status === 'locked') { setUnlockError(t('account.unlock_failed')); return; }
        }
        // Nothing decrypted, so nothing has vouched for the password yet.
        if (!hasCloudKey()) {
            if (!(await passwordIsCurrent(password))) {
                setUnlockError(t('account.unlock_failed'));
                return;
            }
            if (!(await deriveAndCacheCloudKey(password, user.id))) {
                setUnlockError(t('account.unlock_failed'));
                return;
            }
        }
        setUnlockTarget(null);
    };

    const handleUnlockSubmit = async (password: string) => {
        if (!unlockTarget || !user) return;
        setUnlockLoading(true);
        setUnlockError(null);
        try {
            if (unlockTarget.purpose === 'sync') {
                await unlockSync(password);
                return;
            }
            const res = await unlockCloudBackup(unlockTarget.rawData, password, user.id);
            if (res.status === 'ok') {
                setExpandedData(prev => ({ ...prev, [unlockTarget.backupId]: normalizeBackupPayload(res.data) }));
                setExpandedId(unlockTarget.backupId);
                setUnlockTarget(null);
            } else {
                // Wrong password, or the backup was encrypted under an old password.
                setUnlockError(t('account.unlock_failed'));
            }
        } catch {
            setUnlockError(t('account.unlock_failed'));
        } finally {
            setUnlockLoading(false);
        }
    };

    const cancelUnlock = () => {
        // Only the expand prompt owes the list a collapse — cancelling the sync
        // one must not close a backup the user opened separately.
        if (unlockTarget?.purpose === 'expand') setExpandedId(null);
        setUnlockTarget(null);
        setUnlockError(null);
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
                    setTimeout(() => handlePasskeyLogin(password), 100);
                }
            } else {
                setAuthError(err.message || t('error.generic'));
            }
        } finally {
            setAuthLoading(false);
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
            await loginWithToken(result, verified);
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

                        {/* Sync runs on its own — no prompts, no buttons. This line
                            is the only place it reports for duty, so a failure
                            (or a backup this device can't decrypt) is visible
                            somewhere rather than silently never happening.

                            `locked` is the exception that needs a hand: nothing
                            the app can do on its own gets the key back, and the
                            only way in used to be opening a backup in the list
                            below, which is not where anyone looks after reading
                            "unlock it first". So this line becomes the button. */}
                        {syncStatus === 'locked' ? (
                            <button
                                type="button"
                                onClick={() => { setUnlockError(null); setUnlockTarget({ purpose: 'sync' }); }}
                                className={`w-full flex items-center gap-2.5 py-3 ${divider} text-start hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] -mx-2 px-2 rounded`}
                            >
                                <SyncIcon status={syncStatus} className={iconCls} />
                                <p className="flex-1 min-w-0 text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                    {t('sync.status.locked')}
                                </p>
                                <span className="text-xs font-medium text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)] shrink-0">
                                    {t('sync.unlock_action')}
                                </span>
                            </button>
                        ) : (
                            <div className={`flex items-center gap-2.5 py-3 ${divider}`}>
                                <SyncIcon status={syncStatus} className={iconCls} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]">
                                        {t(`sync.status.${syncStatus}`)}
                                    </p>
                                    {lastSyncedAt !== null && syncStatus !== 'off' && (
                                        <p className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">
                                            {(t('sync.last_synced') as string).replace('{time}', new Date(lastSyncedAt).toLocaleTimeString())}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Disabled while locked: with no key on this device the
                            reconcile behind this button cannot read the cloud
                            copy and refuses to overwrite it, so pressing it only
                            ever produced "save failed". The row above is what
                            fixes that, so leave this one out of reach until it
                            has been. */}
                        <button
                            onClick={handleSave}
                            disabled={savingCloud || syncStatus === 'locked' || syncStatus === 'syncing'}
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
                                        <ChevronDown size={14} className={`chev ${iconCls} ${expandedId === b.id ? 'rotate-180' : ''}`} />
                                    </div>
                                    <div className="disclosure" data-open={expandedId === b.id}>
                                        <div className="disclosure-inner">
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
                                    <p className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium">{label}</p>
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
                                                                        <p className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] text-center py-1.5">
                                                                            +{(data.events || []).length - 3} …
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Merge diff panel */}
                                                            <div className={`grid ${showingDiff ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                                                <div className="overflow-hidden">
                                                                    <div className="space-y-2 pt-2">
                                    <p className="text-[0.625rem] font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('account.merge_preview')}</p>
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
                                                                    {diff.total > 0 && <span className="text-[0.625rem] text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)] font-medium">+{diff.total}</span>}
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
              <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.username')}</label>
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
              <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.password')}</label>
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
                    <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.backup_code_label')}</label>
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
                        <label className="block text-xs font-semibold text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('auth.totp_code')}</label>
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
                                                        <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('common.or')}</span>
                                                        <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                                    </div>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => handlePasskeyLogin()}
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
                                    <span className="text-xs text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]">{t('common.or')}</span>
                                    <div className="flex-1 h-px bg-[var(--color-m3-outline-variant)] dark:bg-[var(--color-m3-dark-outline-variant)]" />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handlePasskeyLogin()}
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
