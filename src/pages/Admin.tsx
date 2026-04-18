import React, { useEffect, useState, useCallback } from 'react';
import { Trash2, Loader2, AlertCircle, RefreshCw, Server, Search, KeyRound, PenLine, ImageOff, X, ChevronLeft, ChevronRight, Cloud, Trash } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminService, AdminUser, BackupMeta, PaginatedUsers } from '../services/admin';
import { useDialog } from '../contexts/DialogContext';

interface AdminProps {
    t: (key: string) => string;
}

type Tab = 'users' | 'system';
type UserPanel = null | { type: 'password'; user: AdminUser } | { type: 'edit'; user: AdminUser } | { type: 'backups'; user: AdminUser };

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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setPanel(null)}>
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
                    <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => setPanel(null)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                                <ChevronLeft size={18} className="text-zinc-500" />
                            </button>
                            <div>
                                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{panel.user.username}</h3>
                                <p className="text-xs text-zinc-400 font-mono">{panel.type === 'password' ? 'Change Password' : panel.type === 'edit' ? 'Edit Profile' : 'Cloud Backups'}</p>
                            </div>
                        </div>
                        <button onClick={() => setPanel(null)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                            <X size={18} className="text-zinc-400" />
                        </button>
                    </div>

                    <div className="p-6">
                        {panel.type === 'password' && (
                            <div className="space-y-4">
                                <p className="text-sm text-zinc-500">Set a new password for <strong className="text-zinc-900 dark:text-zinc-100">{panel.user.username}</strong>.</p>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="New password (min 8 chars)"
                                    className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-shadow"
                                    autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setPanel(null)} className="px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors">Cancel</button>
                                    <button
                                        onClick={submitPassword}
                                        disabled={newPassword.length < 8}
                                        className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 transition-all"
                                    >
                                        Update Password
                                    </button>
                                </div>
                            </div>
                        )}

                        {panel.type === 'edit' && (
                            <div className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Username</label>
                                    <input
                                        type="text"
                                        value={newUsername}
                                        onChange={e => setNewUsername(e.target.value)}
                                        placeholder="New username"
                                        className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-shadow"
                                        autoFocus
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={submitUsername}
                                            disabled={!newUsername.trim() || newUsername.trim() === panel.user.username}
                                            className="px-5 py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 transition-all"
                                        >
                                            Save Username
                                        </button>
                                    </div>
                                </div>
                                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
                                    <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Avatar</label>
                                    <button
                                        onClick={() => handleResetAvatar(panel.user)}
                                        className="flex items-center gap-2 px-4 py-2.5 border border-red-200 dark:border-red-900/30 text-red-500 rounded-xl text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                    >
                                        <ImageOff size={16} /> Reset Avatar
                                    </button>
                                </div>
                            </div>
                        )}

                        {panel.type === 'backups' && (
                            backupsLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-zinc-300" size={28} /></div>
                            ) : backups.length === 0 ? (
                                <p className="text-sm text-zinc-400 text-center py-8">No backups found.</p>
                            ) : (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-zinc-500">{backups.length} backup(s) · {formatBytes(backups.reduce((s, b) => s + b.data_size, 0))} total</span>
                                        <button
                                            onClick={handlePurgeBackups}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-500 border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                                        >
                                            <Trash size={14} /> Purge All
                                        </button>
                                    </div>
                                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                            {backups.map(b => (
                                                <div key={b.id} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                                    <div>
                                                        <p className="text-sm text-zinc-900 dark:text-zinc-100">{new Date(b.created_at * 1000).toLocaleString()}</p>
                                                        <p className="text-xs text-zinc-400 mt-0.5">{formatBytes(b.data_size)} · <span className="font-mono">{b.id.slice(0, 8)}</span></p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDeleteBackup(b.id)}
                                                        className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                        title="Delete backup"
                                                    >
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
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
        <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950/50 pt-8 pb-20 px-6 md:px-12 w-full">
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight mb-12">Dashboard</h1>

            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-zinc-200 dark:border-zinc-800 mb-12">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === 'users' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                >
                    Users
                    {activeTab === 'users' && <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-zinc-900 dark:bg-zinc-50 rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === 'system' ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'}`}
                >
                    System
                    {activeTab === 'system' && <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-zinc-900 dark:bg-zinc-50 rounded-full" />}
                </button>
            </div>

            {activeTab === 'users' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Manage Users</h2>
                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                {totalUsers}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:flex-initial">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search users..."
                                    className="w-full sm:w-56 pl-9 pr-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100 transition-shadow"
                                />
                            </div>
                            <button
                                onClick={fetchUsers}
                                className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800/50 transition-all shrink-0"
                                title="Refresh"
                            >
                                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {loading && users.length === 0 ? (
                        <div className="flex justify-center py-12">
                            <Loader2 className="animate-spin text-zinc-300" size={32} />
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 text-red-600 dark:text-red-400 rounded-xl text-sm flex items-center gap-2">
                            <AlertCircle size={18} /> {error}
                        </div>
                    ) : users.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-12">No users found{searchDebounce ? ` for "${searchDebounce}"` : ''}.</p>
                    ) : (
                        <div className="grid gap-3">
                            {users.map(u => (
                                <div
                                    key={u.id}
                                    className="group bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition-all flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-700">
                                            <img
                                                src={`/api/user/avatar/${u.username}`}
                                                alt={u.username}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                                }}
                                            />
                                            <div className="hidden w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-semibold text-sm bg-zinc-100 dark:bg-zinc-800">
                                                {u.username.substring(0, 2).toUpperCase()}
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{u.username}</h3>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <p className="text-xs text-zinc-400 font-mono">{u.id.slice(0, 8)}</p>
                                                {(u.backup_count ?? 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                                                        <Cloud size={11} />
                                                        {u.backup_count} · {formatBytes(u.total_backup_size || 0)} · {timeAgo(u.last_backup_at)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button onClick={() => openBackupsPanel(u)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all" title="Cloud Backups">
                                            <Cloud size={16} />
                                        </button>
                                        <button onClick={() => openPasswordPanel(u)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all" title="Change Password">
                                            <KeyRound size={16} />
                                        </button>
                                        <button onClick={() => openEditPanel(u)} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-all" title="Edit Profile">
                                            <PenLine size={16} />
                                        </button>
                                        <button onClick={() => handleDeleteUser(u)} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Delete User">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800/50 transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <ChevronLeft size={16} />
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
                                        <span key={`dot-${i}`} className="px-1 text-zinc-400 text-sm">...</span>
                                    ) : (
                                        <button
                                            key={item}
                                            onClick={() => setPage(item as number)}
                                            className={`min-w-[36px] h-9 rounded-lg text-sm font-semibold transition-all ${
                                                page === item
                                                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                                                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                            }`}
                                        >
                                            {item}
                                        </button>
                                    )
                                )}
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800/50 transition-all disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'system' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">System Status</h2>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 p-6 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-pink-50 dark:bg-pink-900/20 rounded-xl text-pink-600 dark:text-pink-400">
                                <Server size={24} />
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-1">Operational</h3>
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-md">
                                    All systems are running smoothly. The backend is connected to the
                                    <span className="font-mono text-xs mx-1 px-1.5 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-700 dark:text-zinc-300">
                                        {window.location.hostname === 'localhost' ? 'Local' : 'Remote'}
                                    </span>
                                    environment.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {renderPanel()}
        </div>
    );
};

export default Admin;
