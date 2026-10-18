// OpenPGP backups: the export encrypted to the user's own public key, so only
// their private key, which never comes near this site, can open it. The file
// format is written down in docs/backup-format.md; the offline recovery tool
// reads the same thing, so change both together.
//
// OpenPGP.js is large, so it is loaded only when someone opens this export.

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const BACKUP_FORMAT = 'oyama-hrt-backup';
export const BACKUP_VERSION = 1;

export interface BackupEnvelope {
    format: typeof BACKUP_FORMAT;
    version: number;
    createdAt: string;
    app: string;
    recipient: string;
    payloadSha256: string;
    payload: string;
}

/** What a pasted key turned out to be. `key` is the armored public key to keep. */
export type KeyCheck =
    | { ok: true; fingerprint: string; key: string; userId: string }
    | { ok: false; reason: 'private' | 'many' | 'cannotEncrypt' | 'unreadable' };

const loadOpenPGP = () => import('openpgp');

export const sha256Hex = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)));

/** "0123ABCD..." as "0123 ABCD ...", the way GnuPG and Kleopatra print it. */
export const groupFingerprint = (fp: string): string => fp.match(/.{1,4}/g)?.join(' ') ?? fp;

/**
 * Reads a pasted public key. A private key is refused outright, before
 * anything is kept, and so is a key that cannot encrypt today (expired,
 * revoked, signing only) or a block holding several keys, where it would be
 * unclear which one the backup was meant for.
 */
export async function checkPublicKey(armored: string): Promise<KeyCheck> {
    const text = armored.trim();
    if (/-----BEGIN PGP PRIVATE KEY BLOCK-----/.test(text)) return { ok: false, reason: 'private' };
    const openpgp = await loadOpenPGP();
    let keys;
    try {
        keys = await openpgp.readKeys({ armoredKeys: text });
    } catch {
        return { ok: false, reason: 'unreadable' };
    }
    if (keys.length !== 1) return { ok: false, reason: 'many' };
    const key = keys[0];
    if (key.isPrivate()) return { ok: false, reason: 'private' };
    try {
        await key.verifyPrimaryKey();
        await key.getEncryptionKey();
    } catch {
        return { ok: false, reason: 'cannotEncrypt' };
    }
    let userId = '';
    try {
        userId = (await key.getPrimaryUser()).user.userID?.userID ?? '';
    } catch {
        // A key with no valid user ID can still encrypt; it just has no name to show.
    }
    return { ok: true, fingerprint: key.getFingerprint().toUpperCase(), key: key.armor(), userId };
}

/** The envelope for `payload`, the plain JSON export text. */
export const buildEnvelope = (payload: string, recipient: string, app: string, now = new Date()): BackupEnvelope => ({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    app,
    recipient,
    payloadSha256: sha256Hex(payload),
    payload,
});

/** Encrypts `payload` to the armored public key. Returns the armored message. */
export async function encryptBackup(payload: string, armoredKey: string, app: string): Promise<string> {
    const openpgp = await loadOpenPGP();
    const key = await openpgp.readKey({ armoredKey });
    const envelope = buildEnvelope(payload, key.getFingerprint().toUpperCase(), app);
    const message = await openpgp.createMessage({
        text: JSON.stringify(envelope, null, 2),
        filename: 'hrt-backup.json',
        format: 'utf8',
    });
    return openpgp.encrypt({ message, encryptionKeys: key, format: 'armored' });
}

export const isPgpMessage = (text: string): boolean => /-----BEGIN PGP MESSAGE-----/.test(text);

/**
 * For an import: if `parsed` is a decrypted backup envelope, checks it and
 * returns the payload text inside; `null` means it is not an envelope at all
 * (a plain export, say). Throws when it is an envelope that fails a check, so
 * a damaged backup is never restored in part.
 */
export function unwrapEnvelope(parsed: unknown): string | null {
    if (!parsed || typeof parsed !== 'object' || (parsed as { format?: unknown }).format !== BACKUP_FORMAT) {
        return null;
    }
    const env = parsed as Partial<BackupEnvelope>;
    if (env.version !== BACKUP_VERSION) throw new Error('backup-version');
    if (typeof env.payload !== 'string' || typeof env.payloadSha256 !== 'string') throw new Error('backup-damaged');
    if (sha256Hex(env.payload) !== env.payloadSha256.toLowerCase()) throw new Error('backup-damaged');
    return env.payload;
}

// The key this device encrypts backups to. Kept per device: it is only a
// public key, but which key the user trusts is theirs to set on each device,
// and a key that quietly changed from elsewhere is exactly what the warning
// is for.
const STORAGE_KEY = 'hrt-pgp-backup-key';

export interface SavedKey {
    fingerprint: string;
    key: string;
    userId: string;
}

export function loadSavedKey(): SavedKey | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const v = JSON.parse(raw);
        return typeof v?.fingerprint === 'string' && typeof v?.key === 'string'
            ? { fingerprint: v.fingerprint, key: v.key, userId: typeof v.userId === 'string' ? v.userId : '' }
            : null;
    } catch {
        return null;
    }
}

export function saveKey(k: SavedKey | null): void {
    try {
        if (k) localStorage.setItem(STORAGE_KEY, JSON.stringify(k));
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage full or blocked: the key works for this visit and is asked for again next time.
    }
}
