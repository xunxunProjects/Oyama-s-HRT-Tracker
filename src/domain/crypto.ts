import { aesGcmDecrypt, aesGcmEncrypt, pbkdf2Sha256, randomBytes } from '../utils/cryptoCompat';
import { MAX_DECOMPRESSED_BACKUP_BYTES, decompressGzipWithLimit } from '../services/boundedDecompression';

// --- Compression Utilities ---

export async function decompressData(
    base64: string,
    maxOutputBytes: number = MAX_DECOMPRESSED_BACKUP_BYTES,
): Promise<string> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(await decompressGzipWithLimit(bytes, maxOutputBytes));
}

// --- Encryption Utils ---
// Web Crypto where the page has it, the @noble fallback on a plain-http
// self-host (see src/utils/cryptoCompat.ts). Output is identical either way.

async function generateKey(password: string, salt: Uint8Array, iterations: number = 600000) {
    return pbkdf2Sha256(new TextEncoder().encode(password), salt, iterations, 32);
}

function buffToBase64(buff: Uint8Array): string {
    const bin = Array.from(buff, byte => String.fromCharCode(byte)).join('');
    return btoa(bin);
}

function base64ToBuff(b64: string): Uint8Array {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export async function encryptData(text: string, customPassword?: string): Promise<{ data: string; password: string }> {
    const password = customPassword || buffToBase64(randomBytes(12));
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const iterations = 600000;
    const key = await generateKey(password, salt, iterations);
    const encrypted = await aesGcmEncrypt(key, iv, new TextEncoder().encode(text));

    const bundle = {
        encrypted: true,
        iv: buffToBase64(iv),
        salt: buffToBase64(salt),
        iter: iterations,
        data: buffToBase64(encrypted),
    };
    return {
        data: JSON.stringify(bundle),
        password,
    };
}

export async function decryptData(jsonString: string, password: string): Promise<string | null> {
    try {
        const bundle = JSON.parse(jsonString);
        if (!bundle.encrypted) return jsonString;

        const salt = base64ToBuff(bundle.salt);
        const iv = base64ToBuff(bundle.iv);
        const data = base64ToBuff(bundle.data);
        // The iteration count comes out of the file being imported, so it is
        // attacker-controlled. A positivity check alone let `"iter": 1e11`
        // through to PBKDF2, where it never returns — the import silently hangs
        // forever with no error and no way to cancel. Bounded to the range this
        // app actually writes (600k today, 100k in older exports).
        const declaredIter = bundle.iter;
        const iterations =
            typeof declaredIter === 'number' &&
            Number.isSafeInteger(declaredIter) &&
            declaredIter >= 100000 &&
            declaredIter <= 1000000
                ? declaredIter
                : 100000;

        const key = await generateKey(password, salt, iterations);
        const decrypted = await aesGcmDecrypt(key, iv, data);
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error(e);
        return null;
    }
}

// --- Cloud (end-to-end) encryption ---
// Cloud backups are encrypted client-side with a key derived from the login
// password so the server/admin can never read the plaintext health data.
// The salt is the user's stable id, so the key is consistent across devices
// and survives username changes (a password change re-derives a new key).

export interface CloudBundle {
    cloud: 1;
    iv: string;
    data: string;
}

// Derive the AES-GCM key from the password + a stable per-user salt,
// returning the raw key bytes (base64) for caching on this device. The raw key
// can decrypt backups but cannot be used to authenticate, so caching it is
// strictly safer than caching the password itself.
export async function deriveCloudKey(password: string, userId: string): Promise<string> {
    const enc = new TextEncoder();
    const raw = await pbkdf2Sha256(enc.encode(password), enc.encode(`hrt-cloud-v1:${userId}`), 600000, 32);
    return buffToBase64(raw);
}

export function isCloudEncrypted(obj: any): obj is CloudBundle {
    return !!(obj && obj.cloud === 1 && typeof obj.iv === 'string' && typeof obj.data === 'string');
}

export async function encryptCloudPayload(plaintext: string, rawKeyB64: string): Promise<CloudBundle> {
    const iv = randomBytes(12);
    const encrypted = await aesGcmEncrypt(base64ToBuff(rawKeyB64), iv, new TextEncoder().encode(plaintext));
    return {
        cloud: 1,
        iv: buffToBase64(iv),
        data: buffToBase64(encrypted),
    };
}

export async function decryptCloudPayload(bundle: any, rawKeyB64: string): Promise<string | null> {
    try {
        if (!isCloudEncrypted(bundle)) return null;
        const decrypted = await aesGcmDecrypt(
            base64ToBuff(rawKeyB64),
            base64ToBuff(bundle.iv),
            base64ToBuff(bundle.data),
        );
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return null;
    }
}
