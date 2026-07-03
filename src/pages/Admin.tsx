import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, Loader2, AlertCircle, RefreshCw, Server, Search, KeyRound, PenLine, ImageOff, X, ChevronLeft, ChevronRight, Cloud, Trash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminService, AdminUser, BackupMeta, PaginatedUsers } from '../services/admin';
import { useDialog } from '../contexts/DialogContext';
import { settingsMuted, settingsOn } from '../components/SettingsListItem';

interface AdminProps {
    t: (key: string) => string;
}

type Tab = 'users' | 'system';
type UserPanel = null | { type: 'password'; user: AdminUser } | { type: 'edit'; user: AdminUser } | { type: 'backups'; user: AdminUser };

const divider = 'border-b border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)]';
const iconBtn = `p-2 rounded-md ${settingsMuted} hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)] hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;
const dangerIconBtn = `p-2 rounded-md ${settingsMuted} hover:text-red-500 dark:hover:text-red-400 hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors`;

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

const Admin: React.FC<AdminProps> = ({ t }) => {
    const { token } = useAuth();
    const { showDialog } = useDialog();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('users');
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
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-400 border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)] transition-colors"
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

    return (
        <div className="pt-8 pb-24 px-6 md:px-8 w-full max-w-2xl">
            <h1 className={`text-xl font-semibold ${settingsOn}`}>Dashboard</h1>

            {/* Tabs */}
            <div className={`flex items-center gap-6 ${divider} mt-6 mb-8`}>
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-3 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'users' ? `${settingsOn} border-[var(--color-m3-primary)]` : `${settingsMuted} border-transparent hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]`}`}
                >
                    Users
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={`pb-3 text-sm font-medium -mb-px border-b-2 transition-colors ${activeTab === 'system' ? `${settingsOn} border-[var(--color-m3-primary)]` : `${settingsMuted} border-transparent hover:text-[var(--color-m3-on-surface)] dark:hover:text-[var(--color-m3-dark-on-surface)]`}`}
                >
                    System
                </button>
            </div>

            {activeTab === 'users' && (
                <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-baseline gap-2">
                            <h2 className={`text-sm font-medium ${settingsOn}`}>Manage Users</h2>
                            <span className={`text-xs ${settingsMuted}`}>{totalUsers}</span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-initial">
                                <Search size={15} strokeWidth={1.5} className={`absolute left-3 top-1/2 -translate-y-1/2 ${settingsMuted}`} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search users..."
                                    className="w-full sm:w-56 py-2.5 pr-3 pl-9 text-sm bg-[var(--color-m3-surface-container-lowest)] dark:bg-[var(--color-m3-dark-surface-container-low)] border border-[var(--color-m3-outline-variant)] dark:border-[var(--color-m3-dark-outline-variant)] rounded-md outline-none focus:border-[var(--color-m3-primary)] text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)] placeholder:text-[var(--color-m3-on-surface-variant)]"
                                />
                            </div>
                            <button
                                onClick={fetchUsers}
                                className={`${iconBtn} shrink-0`}
                                title="Refresh"
                            >
                                <RefreshCw size={15} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
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
                        <div className="flex items-center justify-center gap-1 pt-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className={`${iconBtn} disabled:opacity-40 disabled:pointer-events-none`}
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
                                            className={`min-w-[32px] h-8 rounded-md text-sm transition-colors ${
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
                            >
                                <ChevronRight size={15} strokeWidth={1.5} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'system' && (
                <div className="space-y-5">
                    <h2 className={`text-sm font-medium ${settingsOn}`}>System Status</h2>
                    <div className={`flex items-start gap-3 py-4 ${divider}`}>
                        <Server size={18} strokeWidth={1.5} className={`${settingsMuted} shrink-0 mt-0.5`} />
                        <div>
                            <h3 className={`text-sm font-medium ${settingsOn}`}>Operational</h3>
                            <p className={`text-sm ${settingsMuted} mt-1 leading-relaxed max-w-md`}>
                                All systems are running smoothly. The backend is connected to the
                                <span className="font-mono text-xs mx-1 px-1.5 py-0.5 rounded bg-[var(--color-m3-surface-container)] dark:bg-[var(--color-m3-dark-surface-container)]">
                                    {window.location.hostname === 'localhost' ? 'Local' : 'Remote'}
                                </span>
                                environment.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {renderPanel()}
        </div>
    );
};

export default Admin;
