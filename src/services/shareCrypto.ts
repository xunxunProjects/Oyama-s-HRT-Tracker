import { HRTMode } from '../../logic';
import { EncryptedShareSnapshot, sanitizeShareSnapshot } from '../../shareSnapshotSchema';
import { aesGcmDecrypt, aesGcmEncrypt, randomBytes } from '../utils/cryptoCompat';
import { MAX_DECOMPRESSED_SHARE_BYTES, decompressGzipWithLimit, pipeThrough } from './boundedDecompression';

export { MAX_DECOMPRESSED_SHARE_BYTES };

// End-to-end encryption for dosage share links.
//
// Each link gets its own random AES-256-GCM key. The key travels only in the
// link's fragment (`/share/#<token>.<key>`), which browsers never send to a
// server, so the service stores ciphertext it has no way to read. A live link
// also needs its key on the owner's other devices, so the key is sealed
// ("wrapped") with the owner's cloud backup key and stored next to the link:
// readable by any device that can read their backups, and by nothing else.

// AES-GCM comes from cryptoCompat, so this also works on a plain-http
// self-host where the browser hides Web Crypto.

// Domain separation: the owner's cloud key also seals their backups, and a
// wrapped share key must never be mistaken for one, or the other way round.
const SNAPSHOT_AAD = new TextEncoder().encode('hrt-share-snapshot-v1');
const WRAP_AAD = new TextEncoder().encode('hrt-share-key-v1');

const SHARE_KEY_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 bytes, base64url

export const MAX_SHARE_JSON_DEPTH = 64;

/** Cheap scan so pathological nesting is rejected before JSON.parse allocates it. */
function exceedsJsonDepth(text: string, maxDepth: number): boolean {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === 0x5c) {
                escaped = true; // backslash
            } else if (ch === 0x22) {
                inString = false; // quote
            }
            continue;
        }
        if (ch === 0x22) inString = true;
        else if (ch === 0x5b || ch === 0x7b) {
            depth++;
            if (depth > maxDepth) return true;
        } else if (ch === 0x5d || ch === 0x7d) depth--;
    }
    return false;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

const toBase64Url = (bytes: Uint8Array): string =>
    bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64Url = (value: string): Uint8Array =>
    base64ToBytes(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4));

/** A fresh link key, base64url so it sits in a URL fragment untouched. */
export function generateShareKey(): string {
    return toBase64Url(randomBytes(32));
}

export const isShareKey = (value: unknown): value is string => typeof value === 'string' && SHARE_KEY_REGEX.test(value);

/** The link a recipient opens: the server's token, then the key, both in the fragment. */
export const shareUrlWithKey = (serverUrl: string, key: string): string => `${serverUrl}.${key}`;

/** Split a share fragment into the server token and the link key, if it carries one. */
export function parseShareFragment(fragment: string): { token: string | null; key: string | null } {
    const [token = '', key = ''] = fragment.split('.', 2);
    return { token: token || null, key: key || null };
}

/** Seal a snapshot for one link. Compresses first where the browser can. */
export async function encryptShareSnapshot(snapshot: unknown, key: string): Promise<EncryptedShareSnapshot> {
    let plain: Uint8Array = new TextEncoder().encode(JSON.stringify(snapshot));
    let z: 0 | 1 = 0;
    if (typeof CompressionStream !== 'undefined') {
        plain = await pipeThrough(plain, new CompressionStream('gzip'));
        z = 1;
    }
    const iv = randomBytes(12);
    const sealed = await aesGcmEncrypt(fromBase64Url(key), iv, plain, SNAPSHOT_AAD);
    return { e2ee: 1, z, iv: bytesToBase64(iv), data: bytesToBase64(sealed) };
}

/**
 * Open a sealed snapshot with the key from the link, then rebuild it through
 * the same check the server used to run on plaintext shares. Returns null for
 * a wrong or truncated key, tampered ciphertext, or a payload of the wrong shape.
 */
export async function decryptShareSnapshot(
    envelope: EncryptedShareSnapshot,
    key: string,
    maxDecompressedBytes: number = MAX_DECOMPRESSED_SHARE_BYTES,
) {
    if (!isShareKey(key)) return null;
    try {
        let plain: Uint8Array = await aesGcmDecrypt(
            fromBase64Url(key),
            base64ToBytes(envelope.iv),
            base64ToBytes(envelope.data),
            SNAPSHOT_AAD,
        );
        if (envelope.z === 1) plain = await decompressGzipWithLimit(plain, maxDecompressedBytes);
        const text = new TextDecoder().decode(plain);
        if (exceedsJsonDepth(text, MAX_SHARE_JSON_DEPTH)) return null;
        return sanitizeShareSnapshot(JSON.parse(text)).snapshot ?? null;
    } catch {
        return null;
    }
}

export interface WrappedShareKey {
    cloud: 1;
    iv: string;
    data: string;
}

/** Seal a live link's key, and the mode it follows, with the owner's cloud key. */
export async function wrapShareKey(key: string, mode: HRTMode, cloudKeyB64: string): Promise<WrappedShareKey> {
    const iv = randomBytes(12);
    const sealed = await aesGcmEncrypt(
        base64ToBytes(cloudKeyB64),
        iv,
        new TextEncoder().encode(JSON.stringify({ k: key, mode })),
        WRAP_AAD,
    );
    return { cloud: 1, iv: bytesToBase64(iv), data: bytesToBase64(sealed) };
}

/** Null when this device's cloud key is not the one the link key was sealed with. */
export async function unwrapShareKey(
    wrapped: WrappedShareKey,
    cloudKeyB64: string,
): Promise<{ key: string; mode: HRTMode } | null> {
    try {
        const opened = await aesGcmDecrypt(
            base64ToBytes(cloudKeyB64),
            base64ToBytes(wrapped.iv),
            base64ToBytes(wrapped.data),
            WRAP_AAD,
        );
        const parsed = JSON.parse(new TextDecoder().decode(opened));
        if (!isShareKey(parsed?.k) || (parsed.mode !== 'transfem' && parsed.mode !== 'transmasc')) return null;
        return { key: parsed.k, mode: parsed.mode };
    } catch {
        return null;
    }
}
