import { decryptCloudPayload, isCloudEncrypted } from '../../logic';

export interface BackupSummary {
    events: any[];
    labResults: any[];
    doseTemplates: any[];
    weight?: number;
}

/** Parse a stored cloud backup string/object, decrypting when needed. */
export async function parseCloudBackup(rawData: string | unknown): Promise<any | null> {
    try {
        const parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
        if (!isCloudEncrypted(parsed)) return parsed;
        const key = localStorage.getItem('enc_key');
        if (!key) return null;
        const plain = await decryptCloudPayload(parsed, key);
        if (plain === null) return null;
        return JSON.parse(plain);
    } catch {
        return null;
    }
}

/** Flatten v1/v2 backup payloads into counts usable by the account UI. */
export function normalizeBackupPayload(parsed: any): BackupSummary {
    if (!parsed || typeof parsed !== 'object') {
        return { events: [], labResults: [], doseTemplates: [] };
    }

    if (parsed.modes && typeof parsed.modes === 'object') {
        const events: any[] = [];
        const labResults: any[] = [];
        const doseTemplates: any[] = [];
        for (const mode of ['transfem', 'transmasc'] as const) {
            const block = parsed.modes[mode];
            if (!block || typeof block !== 'object') continue;
            if (Array.isArray(block.events)) events.push(...block.events);
            if (Array.isArray(block.labResults)) labResults.push(...block.labResults);
            if (Array.isArray(block.doseTemplates)) doseTemplates.push(...block.doseTemplates);
        }
        return {
            events,
            labResults,
            doseTemplates,
            weight: typeof parsed.weight === 'number' ? parsed.weight : undefined,
        };
    }

    return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        labResults: Array.isArray(parsed.labResults) ? parsed.labResults : [],
        doseTemplates: Array.isArray(parsed.doseTemplates) ? parsed.doseTemplates : [],
        weight: typeof parsed.weight === 'number' ? parsed.weight : undefined,
    };
}
