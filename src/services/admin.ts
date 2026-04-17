export interface AdminUser {
    id: string;
    username: string;
    created_at?: number;
    backup_count?: number;
    last_backup_at?: number | null;
    total_backup_size?: number;
}

export interface BackupMeta {
    id: string;
    created_at: number;
    data_size: number;
}

export const adminService = {
    async getUsers(token: string, query?: string): Promise<AdminUser[]> {
        const url = query ? `/api/admin/users?q=${encodeURIComponent(query)}` : '/api/admin/users';
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        return await res.json() as AdminUser[];
    },

    async deleteUser(token: string, userId: string): Promise<void> {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete user');
    },

    async getUserBackups(token: string, userId: string): Promise<BackupMeta[]> {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/backups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to fetch backups');
        return await res.json() as BackupMeta[];
    },

    async deleteBackup(token: string, userId: string, backupId: string): Promise<void> {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/backups/${encodeURIComponent(backupId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete backup');
    },

    async purgeBackups(token: string, userId: string): Promise<void> {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/backups`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to purge backups');
    },

    async changeUserPassword(token: string, userId: string, newPassword: string): Promise<void> {
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
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
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/username`, {
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
        const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/avatar`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to reset avatar');
    }
};
