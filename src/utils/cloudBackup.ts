import { decryptCloudPayload, isCloudEncrypted, deriveCloudKey, encryptCloudPayload } from '../../logic';

/**
 * Fired when this device gains (or changes) the key that decrypts cloud
 * backups. Sync is suspended while a backup is readable only in principle, so
 * it needs to know the moment that stops being true — otherwise unlocking on
 * the Account page leaves sync idle until the next scheduled poll.
 */
export const CLOUD_KEY_CHANGED_EVENT = 'hrt-cloud-key-changed';

function announceKeyChange(): void {
    try { window.dispatchEvent(new Event(CLOUD_KEY_CHANGED_EVENT)); } catch { /* non-DOM host */ }
}

/** Cache a derived cloud key on this device and wake anything waiting on one. */
export function cacheCloudKey(rawKeyB64: string | null): void {
    if (rawKeyB64) localStorage.setItem('enc_key', rawKeyB64);
    else localStorage.removeItem('enc_key');
    announceKeyChange();
}

/** Whether this device holds a key at all — distinct from holding the right one. */
export function hasCloudKey(): boolean {
    return !!localStorage.getItem('enc_key');
}

/**
 * Encrypt an export payload for cloud storage when a device key is present.
 * Without a key (a session predating E2EE, or a passwordless passkey login on a
 * fresh device) the payload is stored as-is.
 */
export async function prepareCloudPayload(exportData: any): Promise<any> {
    const key = localStorage.getItem('enc_key');
    if (!key) return exportData;
    return await encryptCloudPayload(JSON.stringify(exportData), key);
}

export interface BackupSummary {
    events: any[];
    labResults: any[];
    doseTemplates: any[];
    weight?: number;
}

// Outcome of trying to read a cloud backup:
//  - ok:      decrypted (or plaintext) and ready to use
//  - corrupt: not valid JSON / unexpected shape
//  - locked:  encrypted, but this device has no working key (e.g. signed in
//             with a passkey, or the key was cleared) — the user must unlock
//             with their password.
export type CloudBackupResult =
    | { status: 'ok'; data: any }
    | { status: 'corrupt' }
    | { status: 'locked' };

function toEnvelope(rawData: string | unknown): any | undefined {
    try {
        return typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch {
        return undefined;
    }
}

/** Read a stored cloud backup, decrypting with the cached device key if needed. */
export async function readCloudBackup(rawData: string | unknown): Promise<CloudBackupResult> {
    const parsed = toEnvelope(rawData);
    if (parsed === undefined) return { status: 'corrupt' };
    if (!isCloudEncrypted(parsed)) return { status: 'ok', data: parsed };

    const key = localStorage.getItem('enc_key');
    if (key) {
        const plain = await decryptCloudPayload(parsed, key);
        if (plain !== null) {
            try { return { status: 'ok', data: JSON.parse(plain) }; }
            catch { return { status: 'corrupt' }; }
        }
    }
    return { status: 'locked' };
}

/**
 * Verify a password against an encrypted backup and, on success, cache the
 * derived key so every other backup decrypts too. Returns `locked` when the
 * password is wrong (or the backup was encrypted under a different/old
 * password). The key is only cached once it has actually decrypted the bundle,
 * so a bad password never poisons future saves.
 */
export async function unlockCloudBackup(
    rawData: string | unknown,
    password: string,
    userId: string,
): Promise<CloudBackupResult> {
    const parsed = toEnvelope(rawData);
    if (parsed === undefined) return { status: 'corrupt' };
    if (!isCloudEncrypted(parsed)) return { status: 'ok', data: parsed };

    let candidate: string;
    try { candidate = await deriveCloudKey(password, userId); }
    catch { return { status: 'locked' }; }

    const plain = await decryptCloudPayload(parsed, candidate);
    if (plain === null) return { status: 'locked' };

    localStorage.setItem('enc_key', candidate);
    announceKeyChange();
    try { return { status: 'ok', data: JSON.parse(plain) }; }
    catch { return { status: 'corrupt' }; }
}

/** Parse a stored cloud backup string/object, decrypting when needed. */
export async function parseCloudBackup(rawData: string | unknown): Promise<any | null> {
    const res = await readCloudBackup(rawData);
    return res.status === 'ok' ? res.data : null;
}

/** Flatten v1/v2 backup payloads into counts usable by the account UI. */
export function normalizeBackupPayload(parsed: any): BackupSummary {
    if (!parsed || typeof parsed !== 'object') {
        return { events: [], labResults: [], doseTemplates: [] };
    }

    if (parsed.modes && typeof parsed.modes === 'object') {
        const modesBlock = parsed.modes as Record<string, any>;
        const preferredMode = localStorage.getItem('hrt-mode') === 'transmasc' ? 'transmasc' : 'transfem';
        const preferredBlock = modesBlock[preferredMode];

        if (preferredBlock && typeof preferredBlock === 'object') {
            return {
                events: Array.isArray(preferredBlock.events) ? preferredBlock.events : [],
                labResults: Array.isArray(preferredBlock.labResults) ? preferredBlock.labResults : [],
                doseTemplates: Array.isArray(preferredBlock.doseTemplates) ? preferredBlock.doseTemplates : [],
                weight: typeof parsed.weight === 'number' ? parsed.weight : undefined,
            };
        }

        const events: any[] = [];
        const labResults: any[] = [];
        const doseTemplates: any[] = [];
        for (const mode of ['transfem', 'transmasc'] as const) {
            const block = modesBlock[mode];
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
