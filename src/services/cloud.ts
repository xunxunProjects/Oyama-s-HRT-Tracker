import { e2eeEncrypt, e2eeDecrypt, E2EEPayload } from '../utils/e2ee';

export interface CloudBackup {
    id: number;
    user_id: string;
    data: string;
    encrypted: number;
    created_at: number;
}

export interface MergeResponse {
    message: string;
    id?: string;
    merged: boolean;
    data?: any;
    requiresClientMerge?: boolean;
    cloudData?: any;
    cloudCreatedAt?: number;
}

export const cloudService = {
    /**
     * Save data to cloud with optional E2EE.
     * If encryptionPassword is provided, data is encrypted client-side before transmission.
     */
    async save(token: string, data: any, encryptionPassword?: string): Promise<void> {
        let payload: any = data;
        let encrypted = false;

        if (encryptionPassword) {
            const plaintext = JSON.stringify(data);
            payload = await e2eeEncrypt(plaintext, encryptionPassword);
            encrypted = true;
        }

        const res = await fetch('/api/content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data: payload, encrypted })
        });
        if (!res.ok) throw new Error('Failed to save');
    },

    /**
     * Load data from cloud. If data is E2EE, decrypts with the provided password.
     */
    async load(token: string, encryptionPassword?: string): Promise<CloudBackup[]> {
        const res = await fetch('/api/content', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('Failed to load');
        const backups = await res.json() as CloudBackup[];

        if (encryptionPassword) {
            // Attempt to decrypt E2EE backups
            for (const backup of backups) {
                if (backup.encrypted) {
                    try {
                        const parsed = JSON.parse(backup.data) as E2EEPayload;
                        if (parsed.e2ee) {
                            const decrypted = await e2eeDecrypt(parsed, encryptionPassword);
                            if (decrypted) {
                                backup.data = decrypted;
                            }
                        }
                    } catch {
                        // Leave as-is if decryption fails
                    }
                }
            }
        }

        return backups;
    },

    /**
     * Merge local data with cloud data.
     * For E2EE data, the server returns both payloads for client-side merge.
     * For plaintext data, the server performs the merge.
     */
    async merge(token: string, data: any, encryptionPassword?: string): Promise<MergeResponse> {
        let payload: any = data;
        let encrypted = false;

        if (encryptionPassword) {
            const plaintext = JSON.stringify(data);
            payload = await e2eeEncrypt(plaintext, encryptionPassword);
            encrypted = true;
        }

        const res = await fetch('/api/content/merge', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ data: payload, encrypted })
        });
        if (!res.ok) throw new Error('Failed to merge');
        const result = await res.json() as MergeResponse;

        // Handle client-side merge for E2EE data
        if (result.requiresClientMerge && encryptionPassword && result.cloudData) {
            try {
                const cloudPayload = result.cloudData as E2EEPayload;
                const decryptedCloud = cloudPayload.e2ee
                    ? await e2eeDecrypt(cloudPayload, encryptionPassword)
                    : JSON.stringify(result.cloudData);

                if (decryptedCloud) {
                    const cloudData = JSON.parse(decryptedCloud);
                    const localData = data;

                    // Client-side merge: union by ID, keep newer
                    const mergedData = clientSideMerge(cloudData, localData);

                    // Save the merged result back (encrypted)
                    await cloudService.save(token, mergedData, encryptionPassword);

                    return {
                        message: 'Data merged successfully (client-side)',
                        merged: true,
                        data: mergedData
                    };
                }
            } catch {
                // Fall through to return original result
            }
        }

        return result;
    }
};

/**
 * Client-side merge for E2EE data (identical logic to server-side merge).
 * Merges events, lab results, and templates by ID, keeping newer records.
 */
function clientSideMerge(cloudData: any, localData: any): any {
    const mergedEvents = mergeArrayById(
        cloudData.events || [],
        localData.events || [],
        'id',
        'timestamp'
    );
    const mergedLabResults = mergeArrayById(
        cloudData.labResults || [],
        localData.labResults || [],
        'id',
        'timestamp'
    );
    const mergedTemplates = mergeArrayById(
        cloudData.doseTemplates || [],
        localData.doseTemplates || [],
        'id',
        'createdAt'
    );

    const localExportTime = localData.meta?.exportedAt ? new Date(localData.meta.exportedAt).getTime() : 0;
    const cloudExportTime = cloudData.meta?.exportedAt ? new Date(cloudData.meta.exportedAt).getTime() : 0;
    const mergedWeight = localExportTime >= cloudExportTime
        ? (localData.weight ?? cloudData.weight ?? 70)
        : (cloudData.weight ?? localData.weight ?? 70);

    return {
        meta: { version: 1, exportedAt: new Date().toISOString(), merged: true },
        weight: mergedWeight,
        events: mergedEvents,
        labResults: mergedLabResults,
        doseTemplates: mergedTemplates
    };
}

function mergeArrayById(cloudArr: any[], localArr: any[], idField: string, timestampField: string): any[] {
    const map = new Map<string, any>();

    for (const item of cloudArr) {
        if (item && item[idField]) {
            map.set(item[idField], item);
        }
    }

    for (const item of localArr) {
        if (!item || !item[idField]) continue;
        const existing = map.get(item[idField]);
        if (!existing) {
            map.set(item[idField], item);
        } else {
            const existingTime = existing[timestampField] || 0;
            const newTime = item[timestampField] || 0;
            if (newTime >= existingTime) {
                map.set(item[idField], item);
            }
        }
    }

    return Array.from(map.values());
}
