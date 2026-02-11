import React, { useEffect, useState } from 'react';
import { Trash2, Loader2, AlertCircle, RefreshCw, LogOut, User as UserIcon, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { adminService, AdminUser } from '../services/admin';
import { useDialog } from '../contexts/DialogContext';

interface AdminProps {
    t: (key: string) => string;
}

type Tab = 'users' | 'system';

const Admin: React.FC<AdminProps> = ({ t }) => {
    const { token, logout } = useAuth();
    const { showDialog } = useDialog();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('users');

    const fetchUsers = async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const data = await adminService.getUsers(token);
            setUsers(data);
        } catch (err) {
            setError('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, [token]);

    const handleDeleteUser = async (user: AdminUser) => {
        if (!token) return;

        showDialog('confirm', `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`, async () => {
            try {
                await adminService.deleteUser(token, user.id);
                // Optimistic update
                setUsers(prev => prev.filter(u => u.id !== user.id));
                showDialog('alert', 'User deleted successfully.');
            } catch (err) {
                showDialog('alert', 'Failed to delete user.');
            }
        });
    };

    return (
        <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950/50 pt-8 pb-20 px-6 md:px-12 w-full">
            {/* Header */}
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight mb-12">Dashboard</h1>

            {/* Tabs */}
            <div className="flex items-center gap-8 border-b border-zinc-200 dark:border-zinc-800 mb-12">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === 'users'
                        ? 'text-zinc-900 dark:text-zinc-50'
                        : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                        }`}
                >
                    Users
                    {activeTab === 'users' && (
                        <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-zinc-900 dark:bg-zinc-50 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    className={`pb-4 text-sm font-semibold transition-colors relative ${activeTab === 'system'
                        ? 'text-zinc-900 dark:text-zinc-50'
                        : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'
                        }`}
                >
                    System
                    {activeTab === 'system' && (
                        <span className="absolute bottom-[-1px] left-0 w-full h-[2px] bg-zinc-900 dark:bg-zinc-50 rounded-full" />
                    )}
                </button>
            </div>

            {/* Content Area */}
            {activeTab === 'users' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Manage Users</h2>
                            <span className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                                {users.length} items
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={fetchUsers}
                                className="p-2 border border-zinc-200 dark:border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-white dark:hover:bg-zinc-800/50 transition-all"
                                title="Refresh List"
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
                    ) : (
                        <div className="grid gap-3">
                            {users.map(u => (
                                <div
                                    key={u.id}
                                    className="group bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition-all flex items-center justify-between"
                                >
                                    <div className="flex items-center gap-4">
                                        {/* Avatar Placeholder */}
                                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-semibold text-sm">
                                            {u.username.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{u.username}</h3>
                                            <p className="text-xs text-zinc-400 font-mono mt-0.5">{u.id}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleDeleteUser(u)}
                                            className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-100 dark:hover:border-red-900/30 rounded-lg transition-all"
                                            title="Delete User"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
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
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-emerald-600 dark:text-emerald-400">
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
        </div>
    );
};

export default Admin;
