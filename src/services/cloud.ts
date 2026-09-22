import { ApiError, apiFetch, apiErrorFrom } from './apiClient';
import { MAX_CLOUD_BACKUP_BYTES } from '../../backupPolicy';

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
    /**
     * Store a new backup revision. Returns its id, which sync uses to recognise
     * its own write when it next checks whether the cloud moved under it — see
     * useCloudSync. `null` when the server didn't say, which callers must treat
     * as "the cloud may have moved" rather than as their own revision.
     */
    async save(token: string, data: any): Promise<string | null> {
        const body = JSON.stringify({ data });
        // The endpoint refuses anything over MAX_CLOUD_BACKUP_BYTES with a 413.
        // Checked here first so an account that has outgrown the cap gets told
        // that, rather than retrying the same rejected upload on every edit.
        if (new TextEncoder().encode(body).byteLength > MAX_CLOUD_BACKUP_BYTES) {
            throw new ApiError(413, 'TOO_LARGE', 'Backup exceeds the 2 MiB limit');
        }
        const res = await apiFetch('/api/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body
        });
        if (!res.ok) throw await apiErrorFrom(res);
        try {
            const body = await res.json() as { id?: string };
            return typeof body?.id === 'string' ? body.id : null;
        } catch { return null; }
    },

    // No `load()` that fetches every backup at once: the list is metadata only,
    // and bodies come one at a time from loadOne(). Pick from listMeta() first.

    async listMeta(token: string): Promise<BackupMeta[]> {
        const res = await apiFetch('/api/content', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw await apiErrorFrom(res);
        return await res.json() as BackupMeta[];
    },

    async loadOne(token: string, backupId: string): Promise<CloudBackup> {
        const res = await apiFetch(`/api/content/${encodeURIComponent(backupId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw await apiErrorFrom(res);
        return await res.json() as CloudBackup;
    },

    async deleteBackup(token: string, backupId: string): Promise<void> {
        const res = await apiFetch(`/api/content/${encodeURIComponent(backupId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw await apiErrorFrom(res);
    }
};
