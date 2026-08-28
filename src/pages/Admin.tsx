import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, Loader2, AlertCircle, Server, Search, KeyRound, PenLine, ImageOff, X, ChevronLeft, ChevronRight, Cloud, Trash, Users, ArrowLeft, ShieldCheck, ShieldOff, Megaphone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminService, AdminUser, AdminUser2FA, BackupMeta, TwoFactorScope } from '../services/admin';
import { useDialog } from '../contexts/DialogContext';
import { settingsMuted, settingsOn } from '../components/SettingsListItem';
import { noticeService, NoticeLevel, SiteNotice } from '../services/notice';
import { Lang } from '../i18n/translations';

type AdminCat = 'users' | 'notice' | 'system';
type MobileView = 'list' | AdminCat;
type UserPanel = null | { type: 'password'; user: AdminUser } | { type: 'edit'; user: AdminUser } | { type: 'backups'; user: AdminUser } | { type: '2fa'; user: AdminUser };

const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';
const rowBase = `w-full flex items-center justify-between py-[18px] ${divider} text-start`;
const rowLabel = 'text-[0.9375rem] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const rowValue = `flex items-center gap-1 text-[0.9375rem] ${settingsMuted}`;
const iconBtn = `p-2 rounded-lg ${settingsMuted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;
const dangerIconBtn = `p-2 rounded-lg ${settingsMuted} hover:text-red-500 dark:hover:text-red-400 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;
const dangerTextBtn = 'shrink-0 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors disabled:opacity-40 disabled:pointer-events-none';

let _savedCat: AdminCat = 'users';
let _savedMobileView: MobileView = 'list';

function formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function timeAgo(ts: number | null | undefined): string {
    if (!ts) return '—';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

const Admin: React.FC = () => {
    const { token } = useAuth();
    const { showDialog } = useDialog();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cat, setCat] = useState<AdminCat>(_savedCat);
    const [mobileView, setMobileView] = useState<MobileView>(_savedMobileView);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDebounce, setSearchDebounce] = useState('');
    const [panel, setPanel] = useState<UserPanel>(null);

    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const PAGE_SIZE = 20;
    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    const [newPassword, setNewPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [backups, setBackups] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const [twoFA, setTwoFA] = useState<AdminUser2FA | null>(null);
    const [twoFALoading, setTwoFALoading] = useState(false);

    // --- Site notice ---
    // `noticeLang` is which text the textarea is editing: the default body, or
    // one per-locale override. The overrides are optional everywhere — a notice
    // with only a default is shown in that wording to everyone.
    const [notice, setNotice] = useState<SiteNotice | null>(null);
    const [noticeLoading, setNoticeLoading] = useState(false);
    const [noticeSaving, setNoticeSaving] = useState(false);
    const [noticeBody, setNoticeBody] = useState('');
    const [noticeI18n, setNoticeI18n] = useState<Partial<Record<Lang, string>>>({});
    const [noticeLevel, setNoticeLevel] = useState<NoticeLevel>('info');
    const [noticeStart, setNoticeStart] = useState('');
    const [noticeEnd, setNoticeEnd] = useState('');
    const [noticeLang, setNoticeLang] = useState<'default' | Lang>('default');

    const cats: { id: AdminCat; label: string; Icon: React.ElementType; hint: string }[] = [
        { id: 'users', label: 'Users', Icon: Users, hint: 'Accounts · Passwords · 2FA · Cloud backups' },
        { id: 'notice', label: 'Notice', Icon: Megaphone, hint: 'Site-wide banner · Per-language text · Schedule' },
        { id: 'system', label: 'System', Icon: Server, hint: 'Status · Environment' },
    ];

    const selectCat = (c: AdminCat) => {
        _savedCat = c;
        setCat(c);
    };

    const enterMobileCat = (c: AdminCat) => {
        _savedCat = c;
        _savedMobileView = c;
        setCat(c);
        setMobileView(c);
    };

    const exitMobileCat = () => {
        _savedMobileView = 'list';
        setMobileView('list');
    };

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => setSearchDebounce(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchUsers = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminService.getUsers(token, searchDebounce || undefined, page, PAGE_SIZE);
            setUsers(data.users);
            setTotalUsers(data.total);
        } catch {
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [token, searchDebounce, page]);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    // Reset to page 1 when search changes
    useEffect(() => { setPage(1); }, [searchDebounce]);

    const handleDeleteUser = (user: AdminUser) => {
        if (!token) return;
        showDialog('confirm', `Delete user "${user.username}"? This cannot be undone.`, async () => {
            try {
                await adminService.deleteUser(token, user.id);
                setUsers(prev => prev.filter(u => u.id !== user.id));
                if (panel && 'user' in panel && panel.user.id === user.id) setPanel(null);
                showDialog('alert', 'User deleted.');
            } catch { showDialog('alert', 'Failed to delete user.'); }
        });
    };

    const openPasswordPanel = (user: AdminUser) => {
        setNewPassword('');
        setPanel({ type: 'password', user });
    };

    const openEditPanel = (user: AdminUser) => {
        setNewUsername(user.username);
        setPanel({ type: 'edit', user });
    };

    const submitPassword = async () => {
        if (!token || !panel || panel.type !== 'password') return;
        try {
            const { sessionsRevoked } = await adminService.changeUserPassword(token, panel.user.id, newPassword);
            showDialog('alert', sessionsRevoked > 0
                ? `Password updated. Signed out ${sessionsRevoked} active session${sessionsRevoked === 1 ? '' : 's'}.`
                : 'Password updated.');
            setPanel(null);
        } catch (e: any) { showDialog('alert', e.message || 'Failed to update password.'); }
    };

    const submitUsername = async () => {
        if (!token || !panel || panel.type !== 'edit') return;
        try {
            await adminService.changeUsername(token, panel.user.id, newUsername);
            setUsers(prev => prev.map(u => u.id === panel.user.id ? { ...u, username: newUsername.trim() } : u));
            showDialog('alert', 'Username updated.');
            setPanel(null);
        } catch (e: any) { showDialog('alert', e.message || 'Failed to update username.'); }
    };

    const handleResetAvatar = async (user: AdminUser) => {
        if (!token) return;
        showDialog('confirm', `Reset avatar for "${user.username}"?`, async () => {
            try {
                await adminService.resetAvatar(token, user.id);
                showDialog('alert', 'Avatar reset.');
            } catch { showDialog('alert', 'Failed to reset avatar.'); }
        });
    };

    const openTwoFAPanel = async (user: AdminUser) => {
        if (!token) return;
        setTwoFA(null);
        setPanel({ type: '2fa', user });
        setTwoFALoading(true);
        try {
            setTwoFA(await adminService.getUser2FA(token, user.id));
        } catch { setTwoFA(null); }
        finally { setTwoFALoading(false); }
    };

    const clearTwoFA = (user: AdminUser, scope: TwoFactorScope, confirmText: string) => {
        if (!token) return;
        showDialog('confirm', confirmText, async () => {
            try {
                const cleared = await adminService.clearUser2FA(token, user.id, scope);
                setTwoFA(await adminService.getUser2FA(token, user.id));
                setUsers(prev => prev.map(u => u.id === user.id ? {
                    ...u,
                    has_totp: cleared.totp ? 0 : u.has_totp,
                    passkey_count: cleared.passkeys > 0 ? 0 : u.passkey_count,
                } : u));
                const parts = [
                    cleared.totp && 'authenticator app',
                    cleared.passkeys > 0 && `${cleared.passkeys} passkey${cleared.passkeys === 1 ? '' : 's'}`,
                    cleared.backupCodes > 0 && `${cleared.backupCodes} backup code${cleared.backupCodes === 1 ? '' : 's'}`,
                ].filter(Boolean) as string[];
                const sessions = cleared.sessions > 0
                    ? ` ${cleared.sessions} session${cleared.sessions === 1 ? '' : 's'} signed out.`
                    : '';
                showDialog('alert', parts.length
                    ? `Removed ${parts.join(', ')}.${sessions}`
                    : `Nothing to remove — ${user.username} had no 2FA enrolled.`);
            } catch (e: any) { showDialog('alert', e.message || 'Failed to reset 2FA.'); }
        });
    };

    const openBackupsPanel = async (user: AdminUser) => {
        if (!token) return;
        setPanel({ type: 'backups', user });
        setBackupsLoading(true);
        try {
            const data = await adminService.getUserBackups(token, user.id);
            setBackups(data);
        } catch { setBackups([]); }
        finally { setBackupsLoading(false); }
    };

    const handleDeleteBackup = async (backupId: string) => {
        if (!token || !panel || panel.type !== 'backups') return;
        try {
            await adminService.deleteBackup(token, panel.user.id, backupId);
            setBackups(prev => prev.filter(b => b.id !== backupId));
            setUsers(prev => prev.map(u => u.id === panel.user.id ? { ...u, backup_count: Math.max(0, (u.backup_count || 1) - 1) } : u));
        } catch { showDialog('alert', 'Failed to delete backup.'); }
    };

    const handlePurgeBackups = async () => {
        if (!token || !panel || panel.type !== 'backups') return;
        showDialog('confirm', `Purge ALL backups for "${panel.user.username}"?`, async () => {
            try {
                await adminService.purgeBackups(token, panel.user.id);
                setBackups([]);
                setUsers(prev => prev.map(u => u.id === panel.user.id ? { ...u, backup_count: 0, last_backup_at: null, total_backup_size: 0 } : u));
                showDialog('alert', 'All backups purged.');
            } catch { showDialog('alert', 'Failed to purge backups.'); }
        });
    };

    const renderPanel = () => {
        if (!panel) return null;

        return (
            <div className="modal-overlay" onClick={() => setPanel(null)}>
                <div className="modal-shell-wide" onClick={e => e.stopPropagation()}>
                    <div className="modal-card">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className={`text-[0.9375rem] font-semibold ${settingsOn}`}>{panel.user.username}</h3>
                                <p className={`text-xs ${settingsMuted} mt-0.5`}>{panel.type === 'password' ? 'Change Password' : panel.type === 'edit' ? 'Edit Profile' : panel.type === '2fa' ? 'Two-Factor Authentication' : 'Cloud Backups'}</p>
                            </div>
                            <button onClick={() => setPanel(null)} className={`${iconBtn} -mr-1 -mt-1`} aria-label="Close">
                                <X size={16} strokeWidth={1.5} />
                            </button>
                        </div>

                        {panel.type === 'password' && (
                            <div className="space-y-4">
                                <p className={`text-sm ${settingsMuted}`}>Set a new password for <span className={`font-medium ${settingsOn}`}>{panel.user.username}</span>.</p>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="New password (min 8 chars)"
                                    className="input-base"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setPanel(null)} className="btn-secondary">Cancel</button>
                                    <button
                                        onClick={submitPassword}
                                        disabled={newPassword.length < 8}
                                        className="btn-primary"
                                    >
                                        Update Password
                                    </button>
                                </div>
                            </div>
                        )}

                        {panel.type === 'edit' && (
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <label className={`block text-xs font-medium ${settingsMuted}`}>Username</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="New username"
                                        className="input-base"
                                        autoFocus
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={submitUsername}
                                            disabled={!newUsername.trim() || newUsername.trim() === panel.user.username}
                                            className="btn-primary"
                                        >
                                            Save Username
                                        </button>
                                    </div>
                                </div>
                                <div className={`border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] pt-4 space-y-2`}>
                                    <label className={`block text-xs font-medium ${settingsMuted}`}>Avatar</label>
                                    <button
                                        onClick={() => handleResetAvatar(panel.user)}
                                        className="btn-secondary text-red-500 dark:text-red-400"
                                    >
                                        <ImageOff size={15} strokeWidth={1.5} /> Reset Avatar
                                    </button>
                                </div>
                            </div>
                        )}

                        {panel.type === '2fa' && (
                            twoFALoading ? (
                                <div className="flex justify-center py-12"><Loader2 className={`animate-spin ${settingsMuted}`} size={20} /></div>
                            ) : !twoFA ? (
                                <p className={`text-sm ${settingsMuted} text-center py-8`}>Could not load 2FA status.</p>
                            ) : (
                                <div>
                                    <div className={`flex items-center justify-between gap-3 py-3.5 ${divider}`}>
                                        <div className="min-w-0">
                                            <p className={`text-sm ${settingsOn}`}>Authenticator app</p>
                                            <p className={`text-xs ${settingsMuted} mt-0.5`}>{twoFA.totp ? 'A TOTP secret is enrolled.' : 'Not set up.'}</p>
                                        </div>
                                        <button
                                            onClick={() => clearTwoFA(panel.user, 'totp', `Disable the authenticator app for "${panel.user.username}"? They will sign in with their password alone, and every active session is signed out.`)}
                                            disabled={!twoFA.totp}
                                            className={dangerTextBtn}
                                        >
                                            Disable
                                        </button>
                                    </div>

                                    <div className={`flex items-center justify-between gap-3 py-3.5 ${divider}`}>
                                        <div className="min-w-0">
                                            <p className={`text-sm ${settingsOn}`}>Passkeys</p>
                                            <p className={`text-xs ${settingsMuted} mt-0.5`}>{twoFA.passkeys === 0 ? 'None registered.' : `${twoFA.passkeys} registered.`}</p>
                                        </div>
                                        <button
                                            onClick={() => clearTwoFA(panel.user, 'passkeys', `Remove all ${twoFA.passkeys} passkey(s) for "${panel.user.username}"? Every active session is signed out.`)}
                                            disabled={twoFA.passkeys === 0}
                                            className={dangerTextBtn}
                                        >
                                            Remove All
                                        </button>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 py-3.5">
                                        <div className="min-w-0">
                                            <p className={`text-sm ${settingsOn}`}>Backup codes</p>
                                            <p className={`text-xs ${settingsMuted} mt-0.5`}>{twoFA.backupCodes === 0 ? 'None left.' : `${twoFA.backupCodes} unused.`}</p>
                                        </div>
                                        <button
                                            onClick={() => clearTwoFA(panel.user, 'backup_codes', `Erase the remaining backup codes for "${panel.user.username}"? Their sessions stay signed in.`)}
                                            disabled={twoFA.backupCodes === 0}
                                            className={dangerTextBtn}
                                        >
                                            Erase
                                        </button>
                                    </div>

                                    <div className="flex items-end justify-between gap-4 pt-4 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                                        <p className="text-xs text-red-500 dark:text-red-400 leading-relaxed">
                                            Erasing a factor drops this account back to its password alone. Confirm who is asking before you do it.
                                        </p>
                                        <button
                                            onClick={() => clearTwoFA(panel.user, 'all', `Erase ALL two-factor authentication for "${panel.user.username}"? This removes the authenticator secret, every passkey and every backup code, and signs out all of their sessions.`)}
                                            disabled={!twoFA.enabled && twoFA.backupCodes === 0}
                                            className="btn-secondary text-red-500 dark:text-red-400 shrink-0 disabled:opacity-40 disabled:pointer-events-none"
                                        >
                                            <ShieldOff size={15} strokeWidth={1.5} /> Erase All
                                        </button>
                                    </div>
                                </div>
                            )
                        )}

                        {panel.type === 'backups' && (
                            backupsLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className={`animate-spin ${settingsMuted}`} size={20} /></div>
                            ) : backups.length === 0 ? (
                                <p className={`text-sm ${settingsMuted} text-center py-8`}>No backups found.</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-xs ${settingsMuted}`}>{backups.length} backup(s) · {formatBytes(backups.reduce((s, b) => s + b.data_size, 0))} total</span>
                                        <button
                                            onClick={handlePurgeBackups}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors"
                                        >
                                            <Trash size={13} strokeWidth={1.5} /> Purge All
                                        </button>
                                    </div>
                                    <div>
                                        {backups.map(b => (
                                            <div key={b.id} className={`flex items-center justify-between py-3 ${divider}`}>
                                                <div>
                                                    <p className={`text-sm ${settingsOn}`}>{new Date(b.created_at * 1000).toLocaleString()}</p>
                                                    <p className={`text-xs ${settingsMuted} mt-0.5`}>{formatBytes(b.data_size)} · <span className="font-mono">{b.id.slice(0, 8)}</span></p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteBackup(b.id)}
                                                    className={dangerIconBtn}
                                                    title="Delete backup"
                                                >
                                                    <Trash2 size={15} strokeWidth={1.5} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Rendered as plain elements (not a nested component) so typing in the search
    // field doesn't remount the subtree and drop focus on every keystroke.
    const renderUsers = () => (
        <div>
            <div className="relative mb-5">
                <Search size={15} strokeWidth={1.5} className={`absolute left-3 top-1/2 -translate-y-1/2 ${settingsMuted}`} />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="w-full py-2.5 pr-3 pl-9 text-[0.9375rem] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg outline-none focus:border-[var(--color-m3-primary)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] placeholder:text-[var(--color-m3-on-surface-variant)]"
                />
            </div>

            {loading && users.length === 0 ? (
                <div className="flex justify-center py-16">
                    <Loader2 className={`animate-spin ${settingsMuted}`} size={20} />
                </div>
            ) : error ? (
                <p className="flex items-center gap-2 text-sm text-red-500 dark:text-red-400 py-4">
                    <AlertCircle size={16} strokeWidth={1.5} /> {error}
                </p>
            ) : users.length === 0 ? (
                <p className={`text-sm ${settingsMuted} text-center py-14`}>No users found{searchDebounce ? ` for "${searchDebounce}"` : ''}.</p>
            ) : (
                <div>
                    {users.map(u => (
                        <div
                            key={u.id}
                            className={`flex items-center justify-between gap-3 py-4 ${divider}`}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)] flex items-center justify-center overflow-hidden shrink-0">
                                    <img
                                        src={`/api/user/avatar/${u.username}`}
                                        alt={u.username}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                        }}
                                    />
                                    <div className={`hidden w-full h-full flex items-center justify-center ${settingsMuted} font-medium text-xs`}>
                                        {u.username.substring(0, 2).toUpperCase()}
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <h3 className={`text-sm font-medium ${settingsOn} truncate`}>{u.username}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className={`text-xs ${settingsMuted} font-mono`}>{u.id.slice(0, 8)}</p>
                                        {(u.backup_count ?? 0) > 0 && (
                                            <span className={`inline-flex items-center gap-1 text-xs ${settingsMuted}`}>
                                                <Cloud size={11} strokeWidth={1.5} />
                                                {u.backup_count} · {formatBytes(u.total_backup_size || 0)} · {timeAgo(u.last_backup_at)}
                                            </span>
                                        )}
                                        {((u.has_totp ?? 0) > 0 || (u.passkey_count ?? 0) > 0) && (
                                            <span className={`inline-flex items-center gap-1 text-xs ${settingsMuted}`} title="Two-factor authentication enabled">
                                                <ShieldCheck size={11} strokeWidth={1.5} />
                                                {[
                                                    (u.has_totp ?? 0) > 0 && 'TOTP',
                                                    (u.passkey_count ?? 0) > 0 && `${u.passkey_count} passkey${u.passkey_count === 1 ? '' : 's'}`,
                                                ].filter(Boolean).join(' · ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                                <button onClick={() => openBackupsPanel(u)} className={iconBtn} title="Cloud Backups">
                                    <Cloud size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => openTwoFAPanel(u)} className={iconBtn} title="Reset 2FA">
                                    <ShieldOff size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => openPasswordPanel(u)} className={iconBtn} title="Change Password">
                                    <KeyRound size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => openEditPanel(u)} className={iconBtn} title="Edit Profile">
                                    <PenLine size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => handleDeleteUser(u)} className={dangerIconBtn} title="Delete User">
                                    <Trash2 size={15} strokeWidth={1.5} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-4">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className={`${iconBtn} disabled:opacity-40 disabled:pointer-events-none`}
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={15} strokeWidth={1.5} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                        .reduce<(number | '...')[]>((acc, p, i, arr) => {
                            if (i > 0 && p - (arr[i - 1]) > 1) acc.push('...');
                            acc.push(p);
                            return acc;
                        }, [])
                        .map((item, i) =>
                            item === '...' ? (
                                <span key={`dot-${i}`} className={`px-1 text-sm ${settingsMuted}`}>...</span>
                            ) : (
                                <button
                                    key={item}
                                    onClick={() => setPage(item as number)}
                                    className={`min-w-[32px] h-8 rounded-lg text-sm transition-colors ${
                                        page === item
                                            ? `font-medium ${settingsOn} bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]`
                                            : `${settingsMuted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]`
                                    }`}
                                >
                                    {item}
                                </button>
                            )
                        )}
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        className={`${iconBtn} disabled:opacity-40 disabled:pointer-events-none`}
                        aria-label="Next page"
                    >
                        <ChevronRight size={15} strokeWidth={1.5} />
                    </button>
                </div>
            )}

            <p className={`mt-6 text-xs ${settingsMuted}`}>
                {totalUsers.toLocaleString()} registered account{totalUsers === 1 ? '' : 's'}
            </p>
        </div>
    );

    // datetime-local <-> unix seconds. The input speaks the operator's local
    // time; everything stored and compared server-side is UTC seconds.
    const toLocalInput = (ts: number | null): string => {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const fromLocalInput = (value: string): number | null => {
        if (!value) return null;
        const ms = new Date(value).getTime();
        return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
    };

    const applyNotice = (n: SiteNotice | null) => {
        setNotice(n);
        setNoticeBody(n?.body ?? '');
        setNoticeI18n(n?.i18n ?? {});
        setNoticeLevel(n?.level ?? 'info');
        setNoticeStart(toLocalInput(n?.startsAt ?? null));
        setNoticeEnd(toLocalInput(n?.expiresAt ?? null));
    };

    const fetchNotice = useCallback(async () => {
        if (!token) return;
        setNoticeLoading(true);
        try {
            applyNotice(await noticeService.getStored(token));
        } catch {
            showDialog('alert', 'Failed to load the site notice.');
        } finally {
            setNoticeLoading(false);
        }
    }, [token, showDialog]);

    // Loaded on entering the tab rather than on mount: the users list is what
    // the page opens on, and this is one request nobody asked for until then.
    useEffect(() => {
        if (cat === 'notice' || mobileView === 'notice') void fetchNotice();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cat, mobileView]);

    const noticeLangs: { id: 'default' | Lang; label: string }[] = [
        { id: 'default', label: 'Default' },
        { id: 'zh', label: '简体' },
        { id: 'zh-TW', label: '繁體' },
        { id: 'yue', label: '粵語' },
        { id: 'en', label: 'EN' },
        { id: 'ja', label: '日本語' },
        { id: 'ko', label: '한국어' },
        { id: 'tr', label: 'TR' },
    ];

    const noticeTextFor = (id: 'default' | Lang): string =>
        id === 'default' ? noticeBody : (noticeI18n[id] ?? '');

    const setNoticeTextFor = (id: 'default' | Lang, value: string) => {
        if (id === 'default') setNoticeBody(value);
        else setNoticeI18n(prev => ({ ...prev, [id]: value }));
    };

    const saveNotice = async () => {
        if (!token) return;
        const body = noticeBody.trim();
        if (!body) {
            showDialog('alert', 'The default text is what every locale without its own wording falls back to, so it cannot be empty.');
            return;
        }
        const startsAt = fromLocalInput(noticeStart);
        const expiresAt = fromLocalInput(noticeEnd);
        if (startsAt != null && expiresAt != null && expiresAt <= startsAt) {
            showDialog('alert', 'The end time has to be after the start time.');
            return;
        }
        setNoticeSaving(true);
        try {
            applyNotice(await noticeService.save(token, { body, i18n: noticeI18n, level: noticeLevel, startsAt, expiresAt }));
            showDialog('alert', 'Notice published. New visits see it right away; tabs already open pick it up within ten minutes.');
        } catch (e: any) {
            showDialog('alert', e?.message || 'Failed to save the notice.');
        } finally {
            setNoticeSaving(false);
        }
    };

    const clearNotice = () => {
        if (!token) return;
        showDialog('confirm', 'Take the banner down for everyone?', async () => {
            try {
                await noticeService.clear(token);
                applyNotice(null);
                setNoticeLang('default');
            } catch { showDialog('alert', 'Failed to clear the notice.'); }
        });
    };

    // Same wording the banner uses: the locale's override when it has one, the
    // default otherwise. Lets the operator see what a given locale will read.
    const noticePreview = noticeLang === 'default'
        ? noticeBody
        : (noticeI18n[noticeLang]?.trim() || noticeBody);

    const noticeWindowLabel = (): string => {
        if (!notice) return 'Nothing is being shown.';
        const now = Math.floor(Date.now() / 1000);
        if (notice.startsAt != null && now < notice.startsAt) return `Scheduled for ${new Date(notice.startsAt * 1000).toLocaleString()}`;
        if (notice.expiresAt != null && now >= notice.expiresAt) return `Expired ${new Date(notice.expiresAt * 1000).toLocaleString()}`;
        if (notice.expiresAt != null) return `Live until ${new Date(notice.expiresAt * 1000).toLocaleString()}`;
        return 'Live now, until you clear it';
    };

    const renderNotice = () => (
        noticeLoading ? (
            <div className="flex justify-center py-16"><Loader2 className={`animate-spin ${settingsMuted}`} size={20} /></div>
        ) : (
            <div className="space-y-5">
                <p className={`text-xs ${settingsMuted} leading-relaxed`}>
                    One banner, shown at the top of the app to everyone including signed-out visitors.
                    Editing it brings it back for people who had already dismissed the previous wording.
                </p>

                {/* Language strip. A dot marks a locale that has its own wording. */}
                <div className="flex flex-wrap gap-1">
                    {noticeLangs.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => setNoticeLang(id)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                noticeLang === id
                                    ? `bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] ${settingsOn} font-medium`
                                    : `${settingsMuted} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]`
                            }`}
                        >
                            {label}
                            {id !== 'default' && noticeTextFor(id).trim() && (
                                <span className="w-1 h-1 rounded-full bg-[var(--color-m3-primary)]" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="space-y-2">
                    <label className={`block text-xs font-medium ${settingsMuted}`}>
                        {noticeLang === 'default' ? 'Default text (required)' : `Override for ${noticeLangs.find(l => l.id === noticeLang)?.label}`}
                    </label>
                    <textarea
                        value={noticeTextFor(noticeLang)}
                        onChange={e => setNoticeTextFor(noticeLang, e.target.value)}
                        rows={4}
                        maxLength={2000}
                        placeholder={noticeLang === 'default' ? 'What everyone should know…' : 'Leave empty to use the default text'}
                        className="input-base resize-y"
                    />
                    <p className={`text-xs ${settingsMuted}`}>
                        {noticeTextFor(noticeLang).length}/2000 · bare https:// links become clickable
                    </p>
                </div>

                <div className="space-y-2">
                    <label className={`block text-xs font-medium ${settingsMuted}`}>Tone</label>
                    <div className="flex gap-1">
                        {(['info', 'warn'] as NoticeLevel[]).map(level => (
                            <button
                                key={level}
                                onClick={() => setNoticeLevel(level)}
                                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                    noticeLevel === level
                                        ? `bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] ${settingsOn} font-medium`
                                        : `${settingsMuted} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]`
                                }`}
                            >
                                {level === 'info' ? 'Info' : 'Warning'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label className={`block text-xs font-medium ${settingsMuted}`}>Show from (optional)</label>
                        <input type="datetime-local" value={noticeStart} onChange={e => setNoticeStart(e.target.value)} className="input-base" />
                    </div>
                    <div className="space-y-2">
                        <label className={`block text-xs font-medium ${settingsMuted}`}>Hide after (optional)</label>
                        <input type="datetime-local" value={noticeEnd} onChange={e => setNoticeEnd(e.target.value)} className="input-base" />
                    </div>
                </div>

                {noticePreview.trim() && (
                    <div className="space-y-2">
                        <label className={`block text-xs font-medium ${settingsMuted}`}>Preview</label>
                        <p className={`flex items-start gap-1.5 text-[0.8125rem] leading-snug whitespace-pre-wrap break-words ${
                            noticeLevel === 'warn'
                                ? 'text-amber-700/90 dark:text-amber-400/85'
                                : 'text-[var(--color-m3-primary)] dark:text-[var(--color-m3-primary-light)]'
                        }`}>
                            {noticeLevel === 'warn'
                                ? <AlertCircle size={14} strokeWidth={1.75} className="mt-[3px] shrink-0" />
                                : <Megaphone size={14} strokeWidth={1.75} className="mt-[3px] shrink-0" />}
                            <span>{noticePreview}</span>
                        </p>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                    <span className={`text-xs ${settingsMuted}`}>
                        {noticeWindowLabel()}{notice ? ` · rev ${notice.revision}` : ''}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={clearNotice} disabled={!notice} className={dangerTextBtn}>Clear</button>
                        <button onClick={saveNotice} disabled={noticeSaving || !noticeBody.trim()} className="btn-primary disabled:opacity-40 disabled:pointer-events-none">
                            {noticeSaving ? <Loader2 size={15} className="animate-spin" /> : <Megaphone size={15} strokeWidth={1.5} />}
                            {notice ? 'Update Notice' : 'Publish Notice'}
                        </button>
                    </div>
                </div>
            </div>
        )
    );

    const renderSystem = () => (
        <div>
            <div className={`${rowBase} cursor-default`}>
                <div>
                    <p className={rowLabel}>Status</p>
                    <p className={`text-xs ${settingsMuted} mt-0.5 leading-relaxed`}>All systems are running smoothly.</p>
                </div>
                <span className={rowValue}>Operational</span>
            </div>

            <div className={`${rowBase} border-b-0 cursor-default`}>
                <div>
                    <p className={rowLabel}>Environment</p>
                    <p className={`text-xs ${settingsMuted} mt-0.5 leading-relaxed`}>Where the backend is connected.</p>
                </div>
                <span className={rowValue}>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]">
                        {window.location.hostname === 'localhost' ? 'Local' : 'Remote'}
                    </span>
                </span>
            </div>
        </div>
    );

    const catContent = (id: AdminCat) => (id === 'users' ? renderUsers() : id === 'notice' ? renderNotice() : renderSystem());

    return (
        <div className="flex pt-8 pb-32 min-h-full">

            {/* ── Left category nav (desktop) ─────────────────────────── */}
            <nav className="hidden md:flex flex-col w-52 shrink-0 px-3 gap-0.5 border-r border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]">
                <p className={`px-3 py-1.5 mb-3 text-xl font-semibold ${settingsOn}`}>
                    Admin
                </p>
                {cats.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => selectCat(id)}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[0.9375rem] text-start
                            ${cat === id
                                ? `bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container-high)] ${settingsOn} font-medium`
                                : `${settingsMuted} hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]`
                            }`}
                    >
                        <Icon size={16} strokeWidth={1.75} />
                        {label}
                    </button>
                ))}
            </nav>

            {/* ── Desktop content ─────────────────────────────────────── */}
            <div className="hidden md:block flex-1 px-10 max-w-2xl">
                <h2 className={`text-xl font-semibold ${settingsOn} mb-6`}>
                    {cats.find(c => c.id === cat)?.label}
                </h2>
                {catContent(cat)}
            </div>

            {/* ── Mobile ──────────────────────────────────────────────── */}
            {/* self-start + own bottom padding: the shell's `min-h-full` makes its
                height definite, so a stretched `flex-1` child never reports its own
                overflow to the scroller and the last rows hide under the nav island. */}
            <div className="md:hidden flex-1 self-start px-6 pb-32">
                {mobileView === 'list' ? (
                    <>
                        <h1 className={`sticky top-0 z-20 -mx-6 px-6 pt-2 pb-3 mb-3 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)] text-xl font-semibold ${settingsOn}`}>Admin</h1>
                        {cats.map(({ id, label, Icon, hint }) => (
                            <button
                                key={id}
                                onClick={() => enterMobileCat(id)}
                                className={`${rowBase} items-center`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]">
                                        <Icon size={18} strokeWidth={1.75} className={settingsMuted} />
                                    </div>
                                    <div className="text-start">
                                        <p className={`text-[0.9375rem] font-medium ${settingsOn}`}>{label}</p>
                                        <p className={`text-xs ${settingsMuted} mt-0.5 leading-relaxed`}>{hint}</p>
                                    </div>
                                </div>
                                <ChevronRight size={15} className={settingsMuted} />
                            </button>
                        ))}
                    </>
                ) : (
                    <>
                        <div className="sticky top-0 z-20 -mx-6 px-6 pt-2 pb-3 mb-3 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)]">
                            <button
                                onClick={exitMobileCat}
                                className="flex items-center gap-2 -ml-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]"
                            >
                                <ArrowLeft size={18} className={`${settingsMuted} shrink-0`} />
                                <h1 className={`text-xl font-semibold ${settingsOn}`}>
                                    {cats.find(c => c.id === mobileView)?.label}
                                </h1>
                            </button>
                        </div>
                        {catContent(mobileView as AdminCat)}
                    </>
                )}
            </div>

            {renderPanel()}
        </div>
    );
};

export default Admin;
