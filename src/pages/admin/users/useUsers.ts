import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { useDialog } from '../../../contexts/DialogContext';
import { useEscape } from '../../../hooks/useEscape';
import { useSwitchAnimation } from '../../../components/Tabs';
import { adminService, AdminUser, AdminUser2FA, TwoFactorScope } from '../../../services/admin';
import type { BackupMeta } from '../../../services/cloud';
import { TOOL_ORDER, UserTool } from '../types';
import { errorMessage, plural } from '../shared';

const PAGE_SIZE = 20;

export function useUsers() {
    const { token } = useAuth();
    const { showDialog } = useDialog();

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchDebounce, setSearchDebounce] = useState('');
    const [page, setPage] = useState(1);
    const [totalUsers, setTotalUsers] = useState(0);
    const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE));

    // One user is open at a time. `shownId` stays on the last one opened, so
    // its actions are still there while the fold closes over them.
    const [openId, setOpenId] = useState<string | null>(null);
    const [shownId, setShownId] = useState<string | null>(null);
    const [tool, setTool] = useState<UserTool>('menu');
    const toolAnim = useSwitchAnimation(tool, TOOL_ORDER);
    useEscape(() => {
        if (tool !== 'menu') setTool('menu');
        else setOpenId(null);
    }, !!openId);

    const [newPassword, setNewPassword] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [backups, setBackups] = useState<BackupMeta[]>([]);
    const [backupsLoading, setBackupsLoading] = useState(false);
    const [twoFA, setTwoFA] = useState<AdminUser2FA | null>(null);
    const [twoFALoading, setTwoFALoading] = useState(false);

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
            setError('Could not load users');
        } finally {
            setLoading(false);
        }
    }, [token, searchDebounce, page]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        setPage(1);
    }, [searchDebounce]);

    // Another page or search takes the open user off the list.
    useEffect(() => {
        setOpenId(null);
    }, [page, searchDebounce]);

    const toggleUser = (u: AdminUser) => {
        if (openId === u.id) {
            setOpenId(null);
            return;
        }
        setTool('menu');
        setOpenId(u.id);
        setShownId(u.id);
    };

    const openTool = async (u: AdminUser, next: UserTool) => {
        setTool(next);
        if (next === 'password') setNewPassword('');
        if (next === 'edit') setNewUsername(u.username);
        if (!token) return;
        if (next === 'backups') {
            setBackupsLoading(true);
            try {
                setBackups(await adminService.getUserBackups(token, u.id));
            } catch {
                setBackups([]);
            } finally {
                setBackupsLoading(false);
            }
        }
        if (next === '2fa') {
            setTwoFA(null);
            setTwoFALoading(true);
            try {
                setTwoFA(await adminService.getUser2FA(token, u.id));
            } catch {
                setTwoFA(null);
            } finally {
                setTwoFALoading(false);
            }
        }
    };

    const handleDeleteUser = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Delete ${user.username} and everything they stored? This cannot be undone.`,
            async () => {
                try {
                    await adminService.deleteUser(token, user.id);
                    setUsers(prev => prev.filter(u => u.id !== user.id));
                    setTotalUsers(n => Math.max(0, n - 1));
                    setOpenId(null);
                } catch {
                    showDialog('alert', 'Could not delete the user.');
                }
            },
            { danger: true },
        );
    };

    const setMemorial = (user: AdminUser, memorial: boolean) => {
        if (!token) return;
        showDialog(
            'confirm',
            memorial
                ? `Keep ${user.username} as a memorial account? Every device signed in to it is signed out and nobody can sign in again. Backups and share links stay as they are, and you can undo this later.`
                : `Make ${user.username} an ordinary account again? It can be signed in to with its password as before.`,
            async () => {
                try {
                    await adminService.setMemorial(token, user.id, memorial);
                    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, memorial } : u)));
                } catch (e: unknown) {
                    showDialog('alert', errorMessage(e) || 'Could not change the memorial setting.');
                }
            },
            { confirmLabel: memorial ? 'Keep as memorial' : 'Make ordinary' },
        );
    };

    const submitPassword = async (user: AdminUser) => {
        if (!token) return;
        try {
            const { sessionsRevoked } = await adminService.changeUserPassword(token, user.id, newPassword);
            showDialog(
                'alert',
                sessionsRevoked > 0
                    ? `Password changed. ${plural(sessionsRevoked, 'session')} signed out.`
                    : 'Password changed.',
            );
            setTool('menu');
        } catch (e: unknown) {
            showDialog('alert', errorMessage(e) || 'Could not change the password.');
        }
    };

    const submitUsername = async (user: AdminUser) => {
        if (!token) return;
        try {
            await adminService.changeUsername(token, user.id, newUsername);
            setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, username: newUsername.trim() } : u)));
            showDialog('alert', 'Username changed.');
            setTool('menu');
        } catch (e: unknown) {
            showDialog('alert', errorMessage(e) || 'Could not change the username.');
        }
    };

    const handleResetAvatar = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Remove the picture ${user.username} uploaded?`,
            async () => {
                try {
                    await adminService.resetAvatar(token, user.id);
                    showDialog('alert', 'Picture removed.');
                } catch {
                    showDialog('alert', 'Could not remove the picture.');
                }
            },
            { danger: true },
        );
    };

    const clearTwoFA = (user: AdminUser, scope: TwoFactorScope, confirmText: string) => {
        if (!token) return;
        showDialog(
            'confirm',
            confirmText,
            async () => {
                try {
                    const cleared = await adminService.clearUser2FA(token, user.id, scope);
                    setTwoFA(await adminService.getUser2FA(token, user.id));
                    setUsers(prev =>
                        prev.map(u =>
                            u.id === user.id
                                ? {
                                      ...u,
                                      has_totp: cleared.totp ? 0 : u.has_totp,
                                      passkey_count: cleared.passkeys > 0 ? 0 : u.passkey_count,
                                  }
                                : u,
                        ),
                    );
                    const parts = [
                        cleared.totp && 'the authenticator app',
                        cleared.passkeys > 0 && plural(cleared.passkeys, 'passkey'),
                        cleared.backupCodes > 0 && plural(cleared.backupCodes, 'backup code'),
                    ].filter(Boolean) as string[];
                    const sessions = cleared.sessions > 0 ? ` ${plural(cleared.sessions, 'session')} signed out.` : '';
                    showDialog(
                        'alert',
                        parts.length
                            ? `Removed ${parts.join(', ')}.${sessions}`
                            : `${user.username} had no two-step verification to remove.`,
                    );
                } catch (e: unknown) {
                    showDialog('alert', errorMessage(e) || 'Could not reset two-step verification.');
                }
            },
            { danger: true },
        );
    };

    const handleDeleteBackup = async (user: AdminUser, backupId: string) => {
        if (!token) return;
        try {
            await adminService.deleteBackup(token, user.id, backupId);
            setBackups(prev => prev.filter(b => b.id !== backupId));
            setUsers(prev =>
                prev.map(u => (u.id === user.id ? { ...u, backup_count: Math.max(0, (u.backup_count || 1) - 1) } : u)),
            );
        } catch {
            showDialog('alert', 'Could not delete the backup.');
        }
    };

    const handlePurgeBackups = (user: AdminUser) => {
        if (!token) return;
        showDialog(
            'confirm',
            `Delete every cloud backup ${user.username} has?`,
            async () => {
                try {
                    await adminService.purgeBackups(token, user.id);
                    setBackups([]);
                    setUsers(prev =>
                        prev.map(u =>
                            u.id === user.id
                                ? { ...u, backup_count: 0, last_backup_at: null, total_backup_size: 0 }
                                : u,
                        ),
                    );
                } catch {
                    showDialog('alert', 'Could not delete the backups.');
                }
            },
            { danger: true },
        );
    };

    return {
        users,
        loading,
        error,
        searchQuery,
        setSearchQuery,
        searchDebounce,
        page,
        setPage,
        totalUsers,
        totalPages,
        openId,
        shownId,
        tool,
        setTool,
        toolAnim,
        newPassword,
        setNewPassword,
        newUsername,
        setNewUsername,
        backups,
        backupsLoading,
        twoFA,
        twoFALoading,
        toggleUser,
        openTool,
        handleDeleteUser,
        setMemorial,
        submitPassword,
        submitUsername,
        handleResetAvatar,
        clearTwoFA,
        handleDeleteBackup,
        handlePurgeBackups,
    };
}

export type UsersState = ReturnType<typeof useUsers>;
