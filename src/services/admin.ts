import { apiFetch } from './apiClient';

export interface AdminUser {
    id: string;
    username: string;
    created_at?: number;
    backup_count?: number;
    last_backup_at?: number | null;
    total_backup_size?: number;
    has_totp?: number;
    passkey_count?: number;
}

export interface AdminUser2FA {
    /** An authenticator app secret is enrolled. */
    totp: boolean;
    /** Registered passkeys. */
    passkeys: number;
    /** Unused backup codes left. */
    backupCodes: number;
    /** Either second factor is present, i.e. login demands more than a password. */
    enabled: boolean;
}

export type TwoFactorScope = 'all' | 'totp' | 'passkeys' | 'backup_codes';

export interface Cleared2FA {
    totp: boolean;
    passkeys: number;
    backupCodes: number;
    /** Sessions revoked alongside, so a stripped factor evicts whoever held one. */
    sessions: number;
}

export interface BackupMeta {
    id: string;
    created_at: number;
    data_size: number;
}

export interface PaginatedUsers {
    users: AdminUser[];
    total: number;
    page: number;
    limit: number;
}

export const adminService = {
    async getUsers(token: string, query?: string, page: number = 1, limit: number = 20): Promise<PaginatedUsers> {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        params.set('page', String(page));
        params.set('limit', String(limit));
        const url = `/api/admin/users?${params.toString()}`;
        const res = await apiFetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        return await res.json() as PaginatedUsers;
    },

    async deleteUser(token: string, userId: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete user');
    },

    async getUserBackups(token: string, userId: string): Promise<BackupMeta[]> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/backups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch backups');
        return await res.json() as BackupMeta[];
    },

    async deleteBackup(token: string, userId: string, backupId: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/backups/${encodeURIComponent(backupId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete backup');
    },

    async purgeBackups(token: string, userId: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/backups`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to purge backups');
    },

    async changeUserPassword(token: string, userId: string, newPassword: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ newPassword })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async changeUsername(token: string, userId: string, username: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/username`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ username })
        });
        if (!res.ok) throw new Error(await res.text());
    },

    async resetAvatar(token: string, userId: string): Promise<void> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/avatar`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to reset avatar');
    },

    async getUser2FA(token: string, userId: string): Promise<AdminUser2FA> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/2fa`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        return await res.json() as AdminUser2FA;
    },

    /** Erase a user's second factors. Omit `scope` to clear every one of them. */
    async clearUser2FA(token: string, userId: string, scope: TwoFactorScope = 'all'): Promise<Cleared2FA> {
        const res = await apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/2fa`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ scope })
        });
        if (!res.ok) throw new Error(await res.text());
        const body = await res.json() as { cleared: Cleared2FA };
        return body.cleared;
    }
};
