import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, Loader2, AlertCircle, Server, Search, KeyRound, PenLine, ImageOff, X, ChevronLeft, ChevronRight, Cloud, Trash, Users, ArrowLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminService, AdminUser, BackupMeta } from '../services/admin';
import { useDialog } from '../contexts/DialogContext';
import { settingsMuted, settingsOn } from '../components/SettingsListItem';

type AdminCat = 'users' | 'system';
type MobileView = 'list' | AdminCat;
type UserPanel = null | { type: 'password'; user: AdminUser } | { type: 'edit'; user: AdminUser } | { type: 'backups'; user: AdminUser };

const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';
const rowBase = `w-full flex items-center justify-between py-[18px] ${divider} text-start`;
const rowLabel = 'text-[15px] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const rowValue = `flex items-center gap-1 text-[15px] ${settingsMuted}`;
const iconBtn = `p-2 rounded-lg ${settingsMuted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;
const dangerIconBtn = `p-2 rounded-lg ${settingsMuted} hover:text-red-500 dark:hover:text-red-400 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;

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

    const cats: { id: AdminCat; label: string; Icon: React.ElementType; hint: string }[] = [
        { id: 'users', label: 'Users', Icon: Users, hint: 'Accounts · Passwords · Cloud backups' },
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
            await adminService.changeUserPassword(token, panel.user.id, newPassword);
            showDialog('alert', 'Password updated.');
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
                                <p className={`text-xs ${settingsMuted} mt-0.5`}>{panel.type === 'password' ? 'Change Password' : panel.type === 'edit' ? 'Edit Profile' : 'Cloud Backups'}</p>
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
                    className="w-full py-2.5 pr-3 pl-9 text-[15px] bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-lg outline-none focus:border-[var(--color-m3-primary)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] placeholder:text-[var(--color-m3-on-surface-variant)]"
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
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0">
                                <button onClick={() => openBackupsPanel(u)} className={iconBtn} title="Cloud Backups">
                                    <Cloud size={15} strokeWidth={1.5} />
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

    const catContent = (id: AdminCat) => (id === 'users' ? renderUsers() : renderSystem());

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
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[15px] text-start
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
            <div className="md:hidden flex-1 px-6">
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
                                        <p className={`text-[15px] font-medium ${settingsOn}`}>{label}</p>
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
