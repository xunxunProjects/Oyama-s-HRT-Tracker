import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import {
    CloudUp,
    Logout,
    CheckCircle,
    Pencil,
    Busy,
    Trash,
    Cloud,
    Drive,
    CloudDown,
    Merge,
    ChevronDown,
    Plus,
    Minus,
    Monitor,
    Users,
    Lock,
    Devices,
    CloudOff,
    Alert,
    Retry,
    Shield,
} from '../components/icons';
import { SettingsListItem, settingsSection } from '../components/SettingsListItem';
import PageHeader, { PAGE_COLUMN } from '../components/PageHeader';
import Tabs, { useSwitchAnimation } from '../components/Tabs';
import Point from '../components/Point';
import PasswordStrengthHint from '../components/PasswordStrengthHint';
import { newPasswordLevel } from '../../passwordStrength';
import { describeAuthError } from '../utils/authError';
import { getShareCopy } from '../i18n/share';

import { useAuth } from '../contexts/AuthContext';
import { cloudService, BackupMeta } from '../services/cloud';
import {
    readCloudBackup,
    unlockCloudBackup,
    normalizeBackupPayload,
    hasCloudKey,
    deriveAndCacheCloudKey,
} from '../utils/cloudBackup';
import { useDialog } from '../contexts/DialogContext';
import { authService, serializeAssertionCredential, b64url2ab, sessionIdFromToken } from '../services/auth';
import { hrtService } from '../services/hrt';
import { apiEndpoint } from '../services/apiClient';
import PasswordPrompt from '../components/PasswordPrompt';
import { describeSyncError, SyncStatus } from '../hooks/useCloudSync';
import { formatBytes, formatRelative, LOCALE_MAP } from '../utils/helpers';
import { useTranslation } from '../contexts/LanguageContext';
import { MAX_CLOUD_BACKUPS } from '../../backupPolicy';
import { BusyLabel } from '../components/StableLabel';

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
    /** Why `syncStatus` is `error`, when it is — see CloudSyncState.errorCode. */
    syncErrorCode: string | null;
    lastSyncedAt: number | null;
    /** Signed out, and sent here by a feature that needs an account: the form
     *  says which, and why, above itself. */
    signInReason?: 'share' | 'vote';
}

const divider = 'border-b-(length:--hairline) border-[var(--border)]';
const sectionLabelBase = 'text-xs font-semibold mb-2 block';
const sectionLabel = `${sectionLabelBase} text-[var(--text-muted)]`;
const iconCls = 'text-[var(--text-muted)] shrink-0';
const statusMuted = 'text-xs text-[var(--text-muted)] shrink-0';

const AUTH_TABS = ['sign-in', 'sign-up'] as const;

/**
 * Why the password prompt is open.
 *
 * `expand` is one encrypted backup in the list the user asked to look inside.
 * `sync` is the whole device having no key at all — the state that shows as
 * "cloud archive is encrypted, unlock it first" and, until it is cleared, stops
 * every backup this device would otherwise write.
 */
type UnlockTarget = { purpose: 'expand'; rawData: any; backupId: string } | { purpose: 'sync' };

const SyncIcon: React.FC<{ status: SyncStatus; className?: string }> = ({ status, className }) => {
    switch (status) {
        case 'syncing':
            return <Busy size={18} className={`${className} animate-spin`} />;
        case 'synced':
            return <CheckCircle size={18} className={className} />;
        case 'locked':
            return <Lock size={18} className={className} />;
        case 'error':
            return <Alert size={18} className="text-[var(--warning)] shrink-0" />;
        case 'off':
            return <CloudOff size={18} className={className} />;
        default:
            return <Cloud size={18} className={className} />;
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
    syncErrorCode,
    lastSyncedAt,
    signInReason,
}) => {
    const [avatarError, setAvatarError] = useState(false);
    // The hrt-tool page only exists when the Worker has HRT_RAW_ENABLED and a
    // service token. Hiding the entry otherwise keeps a deployment without
    // those variables from offering a page that answers 404 to every call.
    const [hrtToolSupported, setHrtToolSupported] = useState(false);
    // Bust the avatar cache once per mount so returning from the edit-avatar
    // page (which remounts Account) reflects a freshly uploaded image.
    const avatarCacheBuster = useMemo(() => Date.now(), []);
    const avatarUrl = apiEndpoint(`/api/user/avatar/${user?.username}?t=${avatarCacheBuster}`);
    const [backupList, setBackupList] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    // The list could not be fetched. Kept apart from an empty list, which is
    // how it used to show: "No cloud backups yet" to someone whose backups
    // might be the only copy they have.
    const [backupsFailed, setBackupsFailed] = useState(false);
    // When the list was last fetched: the instant its "2h ago" labels count
    // from, so every row measures against the same clock.
    const [listedAt, setListedAt] = useState(() => Math.floor(Date.now() / 1000));
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
    const { lang } = useTranslation();
    const locale = LOCALE_MAP[lang] || 'en-US';

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
    // The password the server accepted before it asked for a second factor.
    // The passkey retry button needs it too, or that sign-in leaves this
    // device without a cloud key and sync stuck on locked.
    const acceptedPasswordRef = useRef<string | null>(null);
    const formId = useId();
    const { login, register, loginWithToken, weakPassword } = useAuth();
    // The worker refuses the same passwords on register; this says why before
    // the round trip, in the reader's language.
    const newPassword = isLogin ? null : newPasswordLevel(password);
    const newPasswordBlocked = newPassword === 'weak' || newPassword === 'tooLong';

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
            setBackupsFailed(false);
            setListedAt(Math.floor(Date.now() / 1000));
        } catch {
            // A silent refresh that fails keeps the rows it already shows:
            // they were real a moment ago, and an error line in their place
            // would be the blinking the comment above rules out.
            if (!silent) {
                setBackupList([]);
                setBackupsFailed(true);
            }
        } finally {
            if (!silent) setBackupsLoading(false);
        }
    };

    useEffect(() => {
        if (user && token) {
            fetchBackups();
            authService
                .get2FAStatus(token)
                .then(s => onTwoFAStatusChange(s.enabled))
                .catch(() => {});
        }
    }, [user, token]);

    useEffect(() => {
        if (!user || !token) return;
        let cancelled = false;
        void hrtService.capability().then(supported => {
            if (!cancelled) setHrtToolSupported(supported);
        });
        return () => {
            cancelled = true;
        };
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
        } finally {
            setSavingCloud(false);
        }
    };

    const handleDeleteBackup = async (id: string) => {
        if (!token) return;
        showDialog(
            'confirm',
            t('account.delete_backup_confirm'),
            async () => {
                try {
                    await cloudService.deleteBackup(token, id);
                    setBackupList(prev => prev.filter(b => b.id !== id));
                    setExpandedData(prev => {
                        const n = { ...prev };
                        delete n[id];
                        return n;
                    });
                } catch {
                    showDialog('alert', t('account.delete_backup_failed'));
                }
            },
            { danger: true, confirmLabel: t('btn.delete') },
        );
    };

    // Signing out hides every record made under this account: they stay on
    // this device, filed under it, for when it signs back in. Nothing said so,
    // and the empty History that followed read as the records being wiped. A
    // plain confirm rather than a red one, since nothing is destroyed.
    const confirmSignOut = () => {
        showDialog('confirm', t('account.sign_out_confirm'), onLogout, {
            title: t('account.sign_out'),
            confirmLabel: t('account.sign_out'),
        });
    };

    const toggleExpand = async (b: BackupMeta) => {
        if (expandedId === b.id) {
            setExpandedId(null);
            return;
        }
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
        } finally {
            setExpandLoading(null);
        }
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
                try {
                    await authService.terminateSession(data.token, sid);
                } catch {
                    /* revoke is best-effort */
                }
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
        const newest = metas.length ? metas.reduce((a, b) => (b.created_at > a.created_at ? b : a)) : null;

        if (newest) {
            const backup = await cloudService.loadOne(token, newest.id);
            const res = await unlockCloudBackup(backup.data, password, user.id);
            // `locked` here means ciphertext that stayed shut — a wrong password,
            // or an origin where the key cannot be derived at all.
            if (res.status === 'locked') {
                setUnlockError(t('account.unlock_failed'));
                return;
            }
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
            newEvents,
            newLabs,
            newTemplates,
            localOnlyEvents,
            localOnlyLabs,
            localOnlyTemplates,
            total: newEvents.length + newLabs.length + newTemplates.length,
            totalDiff:
                newEvents.length +
                newLabs.length +
                newTemplates.length +
                localOnlyEvents.length +
                localOnlyLabs.length +
                localOnlyTemplates.length,
        };
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError(null);
        setAuthLoading(true);
        try {
            if (isLogin) {
                await login(
                    username,
                    password,
                    needsTOTP && twoFAMethod === 'totp' && !useBackupCode ? totpCode : undefined,
                    needsTOTP && useBackupCode ? backupCode : undefined,
                );
            } else {
                if (newPasswordBlocked) {
                    setAuthError(t(newPassword === 'tooLong' ? 'pw.too_long' : 'pw.too_weak'));
                    return;
                }
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
                acceptedPasswordRef.current = password;
                if (method === 'passkey') {
                    setTimeout(() => handlePasskeyLogin(password), 100);
                }
            } else {
                setAuthError(describeAuthError(err, t, lang));
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
        } catch (e: any) {
            if (e.name !== 'NotAllowedError') {
                setAuthError(e.message || t('auth.passkey_failed'));
            }
        } finally {
            setPasskeyLoading(false);
        }
    };

    const inputCls = 'input-base text-sm';

    const authErrorId = `${formId}-error`;
    const authErrorLine = authError && (
        <p id={authErrorId} role="alert" className="text-sm text-[var(--danger)]">
            {authError}
        </p>
    );
    const authSubmit = (
        <button type="submit" disabled={authLoading || newPasswordBlocked} className="btn-primary w-full">
            <BusyLabel busy={authLoading}>{isLogin ? t('auth.sign_in') : t('auth.sign_up')}</BusyLabel>
        </button>
    );

    const showLastSynced = lastSyncedAt !== null && syncStatus !== 'off';
    const backupsKept = t('account.backups_kept')
        .replace('{n}', String(backupList.length))
        .replace('{max}', String(MAX_CLOUD_BACKUPS));
    const authAnim = useSwitchAnimation(isLogin ? 'sign-in' : 'sign-up', AUTH_TABS);

    return (
        <div className="relative md:pb-32">
            <PageHeader title={t('account.title')} />

            {user ? (
                <div className={`${PAGE_COLUMN} mt-3 space-y-8`}>
                    {/* Profile. A row on the same left edge as every section
                        below it, rather than a centred block above a
                        left-aligned list. */}
                    <div className="flex items-center gap-4 pt-2">
                        <button
                            type="button"
                            onClick={() => onNavigate('edit-avatar')}
                            className="relative group w-16 h-16 shrink-0 rounded-full overflow-hidden cursor-pointer bg-[var(--surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:ring-offset-2 focus:ring-offset-[var(--bg)]"
                            aria-label={t('avatar.change')}
                        >
                            <img
                                src={avatarUrl}
                                alt={user.username}
                                className={`w-full h-full object-cover absolute inset-0 z-10 ${avatarError ? 'hidden' : 'block'}`}
                                onError={() => setAvatarError(true)}
                            />
                            <div className="w-full h-full flex items-center justify-center text-[1.625rem] font-light text-[var(--text-muted)] absolute inset-0">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center z-20">
                                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity font-medium text-xs text-center leading-tight px-1">
                                    {t('avatar.change')}
                                </span>
                            </div>
                        </button>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[var(--text)] text-sm truncate">
                                    {user.username}
                                </span>
                                {user.isAdmin && (
                                    <CheckCircle
                                        className="w-5 h-5 shrink-0 text-[var(--accent-ink)]"
                                        strokeWidth={2.5}
                                    />
                                )}
                            </div>
                            <button
                                onClick={() => onNavigate('edit-profile')}
                                className="mt-0.5 text-xs text-[var(--accent-ink)] flex items-center gap-1"
                            >
                                <Pencil size={12} />
                                {t('account.edit_profile')}
                            </button>
                        </div>
                    </div>

                    {/* Security */}
                    <section>
                        <span className={sectionLabel}>{t('account.security')}</span>
                        <div className={settingsSection}>
                            <SettingsListItem
                                icon={Lock}
                                title={t('account.change_password')}
                                description={
                                    weakPassword ? (
                                        <span className="text-[var(--warning)]">{t('account.weak_password_hint')}</span>
                                    ) : (
                                        t('account.change_password_desc')
                                    )
                                }
                                onClick={() => onNavigate('change-password')}
                            />
                            <SettingsListItem
                                icon={Shield}
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
                                icon={Devices}
                                title={t('account.sessions')}
                                description={t('account.sessions_desc')}
                                onClick={() => onNavigate('sessions')}
                            />
                            {hrtToolSupported && (
                                <SettingsListItem
                                    icon={Monitor}
                                    title={t('hrt.title')}
                                    description={t('hrt.subtitle')}
                                    onClick={() => onNavigate('hrt-security')}
                                />
                            )}
                            <SettingsListItem
                                icon={Users}
                                title={t('f2f.title')}
                                description={t('f2f.subtitle')}
                                onClick={() => onNavigate('f2f')}
                            />
                        </div>
                    </section>

                    {/* Data / Cloud */}
                    <section>
                        <span className={sectionLabel}>{t('settings.group.data')}</span>
                        <div className={settingsSection}>
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
                                <SettingsListItem
                                    icon={<SyncIcon status={syncStatus} className={iconCls} />}
                                    title={t('sync.status.locked')}
                                    onClick={() => {
                                        setUnlockError(null);
                                        setUnlockTarget({ purpose: 'sync' });
                                    }}
                                    showChevron={false}
                                    trailing={
                                        <span className="text-xs font-medium text-[var(--accent-ink)] shrink-0">
                                            {t('sync.unlock_action')}
                                        </span>
                                    }
                                />
                            ) : (
                                <SettingsListItem
                                    icon={<SyncIcon status={syncStatus} className={iconCls} />}
                                    title={t(`sync.status.${syncStatus}`)}
                                    description={
                                        syncStatus === 'error' || syncStatus === 'off' || showLastSynced ? (
                                            <>
                                                {/* The reason, not just the fact. Without this line a full
                                            database, an oversized payload and a dead network were
                                            all the same word. */}
                                                {syncStatus === 'error' && (
                                                    <p className="text-[var(--danger)]">
                                                        {describeSyncError(syncErrorCode, t)}
                                                    </p>
                                                )}
                                                {/* Off is a choice made in Settings, and this line is the
                                            only place sync reports; without saying where the
                                            switch is, "Sync off" was a dead end. The names come
                                            from Settings' own keys, as on the delete page, so a
                                            rename there can't leave this pointing nowhere. */}
                                                {syncStatus === 'off' && (
                                                    <p>
                                                        {t('account.sync_off_desc')
                                                            .replace(
                                                                '{path}',
                                                                [t('nav.settings'), t('settings.group.data')].join(
                                                                    ' › ',
                                                                ),
                                                            )
                                                            .replace('{setting}', t('settings.auto_sync'))}
                                                    </p>
                                                )}
                                                {/* To the minute and in the app's language, like the
                                            backup rows below. */}
                                                {showLastSynced && (
                                                    <p className="tabular-nums">
                                                        {(t('sync.last_synced') as string).replace(
                                                            '{time}',
                                                            new Date(lastSyncedAt!).toLocaleTimeString(locale, {
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            }),
                                                        )}
                                                    </p>
                                                )}
                                            </>
                                        ) : undefined
                                    }
                                />
                            )}

                            {/* Disabled while locked: with no key on this device the
                            reconcile behind this button cannot read the cloud
                            copy and refuses to overwrite it, so pressing it only
                            ever produced "save failed". The row above is what
                            fixes that, so leave this one out of reach until it
                            has been. */}
                            <SettingsListItem
                                icon={savingCloud ? <Busy className={`${iconCls} animate-spin`} size={18} /> : CloudUp}
                                title={t('account.backup_cloud')}
                                description={t('account.backup_cloud_desc')}
                                onClick={handleSave}
                                disabled={savingCloud || syncStatus === 'locked' || syncStatus === 'syncing'}
                                showChevron={false}
                                trailing={
                                    backupList.length > 0 && (
                                        // The bare "3/5" stays, as backupPolicy.ts promises, but
                                        // says what it counts to anyone who hovers or listens.
                                        <span className={`${statusMuted} tabular-nums`} title={backupsKept}>
                                            <span aria-hidden="true">
                                                {backupList.length}/{MAX_CLOUD_BACKUPS}
                                            </span>
                                            <span className="sr-only">{backupsKept}</span>
                                        </span>
                                    )
                                }
                            />

                            {/* Backup list */}
                            {backupsLoading ? (
                                <div className="flex justify-center py-6">
                                    <Busy className="animate-spin text-[var(--text-muted)]" size={20} />
                                </div>
                            ) : backupsFailed ? (
                                <div className="py-6 flex flex-col items-center gap-2 text-center">
                                    <p
                                        role="alert"
                                        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]"
                                    >
                                        <Alert size={14} className="shrink-0 text-[var(--warning)]" />
                                        {t('account.backups_list_failed')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => fetchBackups()}
                                        className="btn-ghost btn-ghost-accent tap-target"
                                    >
                                        <Retry size={14} />
                                        {t('account.retry')}
                                    </button>
                                </div>
                            ) : backupList.length === 0 ? (
                                <div className="py-6 flex flex-col items-center gap-2">
                                    <Cloud size={28} className="text-[var(--text-disabled)]" />
                                    <p className="text-xs text-[var(--text-muted)]">{t('account.no_backups')}</p>
                                </div>
                            ) : (
                                backupList.map(b => (
                                    <div key={b.id}>
                                        {/* Laid out as a SettingsListItem (20px icon, gap-3)
                                        so its text starts on the same line as every row
                                        above; not one, because it holds its own delete
                                        button. Named by how long ago, which is what
                                        "restore from before the mistake" needs, with the
                                        stamp to the minute underneath: seconds made every
                                        row read the same. */}
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            aria-expanded={expandedId === b.id}
                                            className="flex items-center gap-3 py-4 cursor-pointer"
                                            onClick={() => toggleExpand(b)}
                                            onKeyDown={e => {
                                                if (e.target !== e.currentTarget) return;
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    toggleExpand(b);
                                                }
                                            }}
                                        >
                                            <Drive size={20} className={iconCls} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-[var(--text)] truncate">
                                                    {formatRelative(b.created_at, listedAt, t)}
                                                </p>
                                                <p className="text-xs tabular-nums text-[var(--text-muted)] mt-0.5 leading-relaxed">
                                                    {new Date(b.created_at * 1000).toLocaleString(locale, {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                    , {formatBytes(b.data_size)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    handleDeleteBackup(b.id);
                                                }}
                                                aria-label={t('btn.delete')}
                                                title={t('btn.delete')}
                                                className="-my-1.5 p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)] rounded shrink-0"
                                            >
                                                <Trash size={16} />
                                            </button>
                                            <ChevronDown
                                                size={16}
                                                className={`chev ${iconCls} ${expandedId === b.id ? 'rotate-180' : ''}`}
                                            />
                                        </div>
                                        <div className="disclosure" data-open={expandedId === b.id}>
                                            <div className="disclosure-inner">
                                                <div className="pb-4 pt-1 space-y-3">
                                                    {expandLoading === b.id ? (
                                                        <div className="flex justify-center py-6">
                                                            <Busy
                                                                className="animate-spin text-[var(--text-muted)]"
                                                                size={20}
                                                            />
                                                        </div>
                                                    ) : expandedData[b.id] ? (
                                                        (() => {
                                                            const data = expandedData[b.id];
                                                            const diff = computeDiff(data);
                                                            const showingDiff = mergeDiffId === b.id;
                                                            return (
                                                                <>
                                                                    {/* Stats row */}
                                                                    <div className="grid grid-cols-4 gap-3 py-2">
                                                                        {[
                                                                            {
                                                                                label: t('account.backup_doses'),
                                                                                val: (data.events || []).length,
                                                                            },
                                                                            {
                                                                                label: t('account.backup_weight'),
                                                                                val: data.weight ?? '—',
                                                                            },
                                                                            {
                                                                                label: t('account.backup_labs'),
                                                                                val: (data.labResults || []).length,
                                                                            },
                                                                            {
                                                                                label: t('account.backup_templates'),
                                                                                val: (data.doseTemplates || []).length,
                                                                            },
                                                                        ].map(({ label, val }) => (
                                                                            <div key={label} className="text-center">
                                                                                <p className="text-xs text-[var(--text-muted)] font-medium">
                                                                                    {label}
                                                                                </p>
                                                                                <p className="text-sm font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                                                                                    {val}
                                                                                </p>
                                                                            </div>
                                                                        ))}
                                                                    </div>

                                                                    {/* Recent doses preview */}
                                                                    {(data.events || []).length > 0 && (
                                                                        <div>
                                                                            {(data.events as any[])
                                                                                .slice(0, 3)
                                                                                .map((ev: any, i: number) => (
                                                                                    <div
                                                                                        key={i}
                                                                                        className={`flex items-center justify-between py-2 text-xs ${divider} last:border-b-0`}
                                                                                    >
                                                                                        <div className="flex items-center gap-2">
                                                                                            <span className="font-medium text-[var(--text)]">
                                                                                                {ev.ester}
                                                                                            </span>
                                                                                            <span className="text-[var(--text-muted)]">
                                                                                                {ev.route}
                                                                                            </span>
                                                                                        </div>
                                                                                        <span className="font-semibold text-[var(--text)] tabular-nums">
                                                                                            {ev.doseMG} mg
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            {(data.events || []).length > 3 && (
                                                                                <p className="text-xs text-[var(--text-muted)] text-center py-1.5">
                                                                                    +{(data.events || []).length - 3} …
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* Merge diff panel */}
                                                                    <div
                                                                        className={`grid ${showingDiff ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                                                                    >
                                                                        <div className="overflow-hidden">
                                                                            <div className="space-y-2 pt-2">
                                                                                <p className="text-xs font-semibold text-[var(--text-muted)]">
                                                                                    {t('account.merge_preview')}
                                                                                </p>
                                                                                {diff.totalDiff === 0 ? (
                                                                                    <p className="text-xs text-[var(--text-muted)] py-2 text-center">
                                                                                        {t('account.nothing_to_merge')}
                                                                                    </p>
                                                                                ) : (
                                                                                    <div className="space-y-1.5">
                                                                                        {diff.newEvents.length > 0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Plus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text)]">
                                                                                                    {t(
                                                                                                        'account.new_doses',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text)] font-medium tabular-nums">
                                                                                                    +
                                                                                                    {
                                                                                                        diff.newEvents
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.newLabs.length > 0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Plus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text)]">
                                                                                                    {t(
                                                                                                        'account.new_labs',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text)] font-medium tabular-nums">
                                                                                                    +
                                                                                                    {
                                                                                                        diff.newLabs
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.newTemplates.length >
                                                                                            0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Plus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text)]">
                                                                                                    {t(
                                                                                                        'account.new_templates',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text)] font-medium tabular-nums">
                                                                                                    +
                                                                                                    {
                                                                                                        diff
                                                                                                            .newTemplates
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.localOnlyEvents.length >
                                                                                            0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Minus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text-muted)]">
                                                                                                    {t(
                                                                                                        'account.local_only_doses',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text-muted)] font-medium tabular-nums">
                                                                                                    {
                                                                                                        diff
                                                                                                            .localOnlyEvents
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.localOnlyLabs.length >
                                                                                            0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Minus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text-muted)]">
                                                                                                    {t(
                                                                                                        'account.local_only_labs',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text-muted)] font-medium tabular-nums">
                                                                                                    {
                                                                                                        diff
                                                                                                            .localOnlyLabs
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                        {diff.localOnlyTemplates
                                                                                            .length > 0 && (
                                                                                            <div className="flex items-center gap-1.5 text-xs">
                                                                                                <Minus
                                                                                                    size={12}
                                                                                                    strokeWidth={1.5}
                                                                                                    className="text-[var(--text-muted)] shrink-0"
                                                                                                />
                                                                                                <span className="text-[var(--text-muted)]">
                                                                                                    {t(
                                                                                                        'account.local_only_templates',
                                                                                                    )}
                                                                                                </span>
                                                                                                <span className="text-[var(--text-muted)] font-medium tabular-nums">
                                                                                                    {
                                                                                                        diff
                                                                                                            .localOnlyTemplates
                                                                                                            .length
                                                                                                    }
                                                                                                </span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                                {diff.total > 0 && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            onCloudMerge(b.id);
                                                                                            setExpandedId(null);
                                                                                            setMergeDiffId(null);
                                                                                        }}
                                                                                        className="btn-primary w-full mt-1"
                                                                                    >
                                                                                        <Merge
                                                                                            size={13}
                                                                                            strokeWidth={1.5}
                                                                                        />
                                                                                        {t('account.confirm_merge')} (+
                                                                                        {diff.total})
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* Action buttons */}
                                                                    <div className="flex gap-2 pt-1">
                                                                        <button
                                                                            onClick={() =>
                                                                                setMergeDiffId(
                                                                                    showingDiff ? null : b.id,
                                                                                )
                                                                            }
                                                                            className={`flex-1 py-2 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 border transition-colors ${
                                                                                showingDiff
                                                                                    ? 'bg-[var(--surface-hover)] border-[var(--border)] text-[var(--text)]'
                                                                                    : 'border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-muted)]'
                                                                            }`}
                                                                        >
                                                                            <Merge size={13} strokeWidth={1.5} />
                                                                            {t('account.merge')}
                                                                            {diff.total > 0 && (
                                                                                <span className="text-xs text-[var(--text-muted)] font-medium">
                                                                                    +{diff.total}
                                                                                </span>
                                                                            )}
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                onCloudLoad(b.id);
                                                                                setExpandedId(null);
                                                                            }}
                                                                            className="btn-primary flex-1"
                                                                        >
                                                                            <CloudDown size={13} strokeWidth={1.5} />
                                                                            {t('account.restore')}
                                                                        </button>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>

                    {/* Sign out: a row like the rest, not a centred link, and
                        above the danger zone so deleting the account is the
                        last thing on the page. */}
                    <div className={settingsSection}>
                        <SettingsListItem
                            icon={Logout}
                            title={t('account.sign_out')}
                            onClick={confirmSignOut}
                            showChevron={false}
                        />
                    </div>

                    {/* Danger Zone */}
                    <section>
                        <span className={`${sectionLabelBase} text-[var(--danger)]`}>{t('account.danger_zone')}</span>
                        <div className={settingsSection}>
                            <SettingsListItem
                                icon={Trash}
                                title={t('account.delete_account')}
                                description={t('account.delete_account_desc')}
                                onClick={() => onNavigate('delete-account')}
                                danger
                            />
                        </div>
                    </section>
                </div>
            ) : (
                <div className={`${PAGE_COLUMN} mt-3 [&>*]:max-w-sm [&>*]:mx-auto`}>
                    {/* Sent here by Share: what Share does, in its own words,
                        then why it needs an account. No space after a CJK full
                        stop, which carries its own. */}
                    {signInReason === 'share' &&
                        (() => {
                            const shareDesc = getShareCopy(lang).modalDescription;
                            return (
                                <p className="mb-5 text-sm leading-relaxed text-[var(--text)]">
                                    {shareDesc}
                                    {/[。！？]$/.test(shareDesc) ? '' : ' '}
                                    {t('auth.share_needs_account')}
                                </p>
                            );
                        })()}
                    {signInReason === 'vote' && (
                        <p className="mb-5 text-sm leading-relaxed text-[var(--text)]">{t('vote.signin.reason')}</p>
                    )}
                    {/* What an account is for, before the form asks for one.
                        Bare, the form read as the app requiring it, and said
                        nothing about what it would do with medical records.
                        The intro's own rows and words, so the promise reads
                        as the one made on the first day. */}
                    <div className="mb-4">
                        <Point
                            mark="lock"
                            title={t('onboarding.privacy_local')}
                            desc={t('onboarding.privacy_local_desc')}
                        />
                        <Point
                            mark="cloud"
                            title={t('onboarding.privacy_cloud')}
                            desc={t('onboarding.privacy_cloud_desc')}
                        />
                    </div>

                    {/* Login / Register tabs */}
                    <Tabs
                        tabs={[
                            { id: 'sign-in', label: t('auth.sign_in') },
                            { id: 'sign-up', label: t('auth.sign_up') },
                        ]}
                        value={isLogin ? 'sign-in' : 'sign-up'}
                        onChange={id => {
                            setIsLogin(id === 'sign-in');
                            setAuthError(null);
                            setNeedsTOTP(false);
                        }}
                        className="mb-5"
                    />

                    <div key={isLogin ? 'sign-in' : 'sign-up'} className={authAnim}>
                        <form onSubmit={handleAuthSubmit} className="space-y-4">
                            {!needsTOTP && authErrorLine}
                            <div className="space-y-1.5">
                                <label
                                    htmlFor={`${formId}-username`}
                                    className="block text-xs font-semibold text-[var(--text-muted)]"
                                >
                                    {t('auth.username')}
                                </label>
                                <input
                                    id={`${formId}-username`}
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className={inputCls}
                                    style={{ fontSize: '16px' }}
                                    placeholder={t('auth.username_placeholder')}
                                    autoComplete="username"
                                    aria-describedby={authError && !needsTOTP ? authErrorId : undefined}
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label
                                    htmlFor={`${formId}-password`}
                                    className="block text-xs font-semibold text-[var(--text-muted)]"
                                >
                                    {t('auth.password')}
                                </label>
                                <input
                                    id={`${formId}-password`}
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className={inputCls}
                                    style={{ fontSize: '16px' }}
                                    placeholder={t('auth.password_placeholder')}
                                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    aria-describedby={
                                        [
                                            !isLogin ? `${formId}-key-note` : '',
                                            newPassword ? `${formId}-pw-strength` : '',
                                            authError && !needsTOTP ? authErrorId : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' ') || undefined
                                    }
                                    required
                                />
                                {!isLogin && <PasswordStrengthHint id={`${formId}-pw-strength`} level={newPassword} />}
                            </div>
                            {/* Signing up is the moment to say it: the password is
                            what the backups are encrypted with, so no reset
                            brings them back (see changePassword in
                            AuthContext). */}
                            {!isLogin && (
                                <p id={`${formId}-key-note`} className="callout">
                                    {t('auth.password_is_key')}
                                </p>
                            )}
                            {/* Only sign-in ever asks for a second factor, and
                            switching tabs clears it, so this is the sign-in
                            form's. */}
                            {needsTOTP && (
                                <div className="space-y-3">
                                    <div className="p-2.5 text-xs text-[var(--text-muted)] bg-[var(--surface-hover)] rounded-md flex items-center gap-2">
                                        <Shield size={16} className="shrink-0 text-[var(--accent-ink)]" />
                                        {t('auth.needs_2fa')}
                                    </div>
                                    {useBackupCode ? (
                                        <div key="backup" className="space-y-1.5">
                                            <label
                                                htmlFor={`${formId}-backup`}
                                                className="block text-xs font-semibold text-[var(--text-muted)]"
                                            >
                                                {t('auth.backup_code_label')}
                                            </label>
                                            <input
                                                id={`${formId}-backup`}
                                                type="text"
                                                value={backupCode}
                                                onChange={e => setBackupCode(e.target.value.toUpperCase())}
                                                className={`${inputCls} tracking-[0.1em] font-mono text-center`}
                                                style={{ fontSize: '16px' }}
                                                placeholder={t('auth.backup_code_placeholder')}
                                                autoComplete="off"
                                                aria-describedby={authError ? authErrorId : undefined}
                                                autoFocus
                                                required={useBackupCode}
                                            />
                                        </div>
                                    ) : (
                                        twoFAMethod !== 'passkey' && (
                                            <div key="totp" className="space-y-1.5">
                                                <label
                                                    htmlFor={`${formId}-totp`}
                                                    className="block text-xs font-semibold text-[var(--text-muted)]"
                                                >
                                                    {t('auth.totp_code')}
                                                </label>
                                                <input
                                                    id={`${formId}-totp`}
                                                    type="text"
                                                    inputMode="numeric"
                                                    pattern="[0-9]{6}"
                                                    maxLength={6}
                                                    value={totpCode}
                                                    onChange={e =>
                                                        setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                                    }
                                                    className={`${inputCls} tracking-[0.15em] font-mono text-center`}
                                                    style={{ fontSize: '16px' }}
                                                    placeholder={t('auth.totp_placeholder')}
                                                    autoComplete="one-time-code"
                                                    aria-describedby={authError ? authErrorId : undefined}
                                                    autoFocus
                                                    required={needsTOTP && !useBackupCode}
                                                />
                                            </div>
                                        )
                                    )}
                                    {/* The error and the code's own button straight
                                    under the field the person just typed into.
                                    The error used to sit above Username and the
                                    button below the passkey and backup-code
                                    alternatives, both off screen once a phone
                                    keyboard was up. */}
                                    {authErrorLine}
                                    {!(twoFAMethod === 'passkey' && !useBackupCode) && authSubmit}
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
                                            {twoFAMethod === 'passkey' &&
                                                typeof window !== 'undefined' &&
                                                !window.PublicKeyCredential && (
                                                    <p className="text-xs text-[var(--danger)] text-center">
                                                        {t('auth.passkey_unsupported')}
                                                    </p>
                                                )}
                                            {typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                                                <>
                                                    {twoFAMethod !== 'passkey' && (
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-px bg-[var(--border)]" />
                                                            <span className="text-xs text-[var(--text-muted)]">
                                                                {t('common.or')}
                                                            </span>
                                                            <div className="flex-1 h-px bg-[var(--border)]" />
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            handlePasskeyLogin(acceptedPasswordRef.current ?? undefined)
                                                        }
                                                        disabled={passkeyLoading}
                                                        className="w-full py-2.5 text-sm font-medium border-(length:--hairline) border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        <BusyLabel busy={passkeyLoading}>
                                                            {t('auth.passkey_as_2fa')}
                                                        </BusyLabel>
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
                            {!needsTOTP && authSubmit}
                            {isLogin && !needsTOTP && typeof window !== 'undefined' && !!window.PublicKeyCredential && (
                                <>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1 h-px bg-[var(--border)]" />
                                        <span className="text-xs text-[var(--text-muted)]">{t('common.or')}</span>
                                        <div className="flex-1 h-px bg-[var(--border)]" />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handlePasskeyLogin()}
                                        disabled={passkeyLoading}
                                        className="w-full py-2.5 text-sm font-medium border-(length:--hairline) border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] text-[var(--text)] disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        <BusyLabel busy={passkeyLoading}>{t('auth.passkey_login')}</BusyLabel>
                                    </button>
                                </>
                            )}
                        </form>
                    </div>
                </div>
            )}

            <PasswordPrompt
                isOpen={!!unlockTarget}
                anchorKey={unlockTarget?.purpose === 'expand' ? unlockTarget.backupId : unlockTarget?.purpose}
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
