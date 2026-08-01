import { apiFetch } from './apiClient';

export interface CloudBackup {
    id: string;
    user_id: string;
    data: string;
    created_at: number;
}

export interface BackupMeta {
    id: string;
    created_at: number;
    data_size: number;
}

export const cloudService = {
    async save(token: string, data: any): Promise<void> {
        const res = await apiFetch('/api/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data })
        });
        if (!res.ok) throw new Error('Failed to save');
    },

    // No `load()` that fetches every backup at once. Its endpoint is SELECT *,
    // so it shipped all ten retained bodies (2 MiB cap each) to callers that
    // only ever wanted the newest — which is what both callers did. Use
    // listMeta() to pick, then loadOne() to fetch that one.

    async listMeta(token: string): Promise<BackupMeta[]> {
        const res = await apiFetch('/api/content?meta=1', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to list backups');
        return await res.json() as BackupMeta[];
    },

    async loadOne(token: string, backupId: string): Promise<CloudBackup> {
        const res = await apiFetch(`/api/content/${encodeURIComponent(backupId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load backup');
        return await res.json() as CloudBackup;
    },

    async deleteBackup(token: string, backupId: string): Promise<void> {
        const res = await apiFetch(`/api/content/${encodeURIComponent(backupId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to delete backup');
    }
};
