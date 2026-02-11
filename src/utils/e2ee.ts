/**
 * End-to-End Encryption utilities for cloud data transmission.
 * Uses AES-256-GCM with PBKDF2 key derivation.
 * Data is encrypted client-side before being sent to the server,
 * ensuring the server only ever sees ciphertext.
 */

function buffToBase64(buff: Uint8Array): string {
    const bin = Array.from(buff, (byte) => String.fromCharCode(byte)).join('');
    return btoa(bin);
}

function base64ToBuff(b64: string): Uint8Array {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// PBKDF2 iteration count: 600,000 per OWASP 2023 recommendations for SHA-256.
// This should be periodically reviewed and increased as hardware improves.
const E2EE_PBKDF2_ITERATIONS = 600000;

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: E2EE_PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export interface E2EEPayload {
    e2ee: true;
    iv: string;
    salt: string;
    ciphertext: string;
}

/**
 * Encrypt plaintext JSON string using a user-derived password.
 * Returns a payload object safe for JSON serialization and cloud storage.
 */
export async function e2eeEncrypt(plaintext: string, password: string): Promise<E2EEPayload> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );
    return {
        e2ee: true,
        iv: buffToBase64(iv),
        salt: buffToBase64(salt),
        ciphertext: buffToBase64(new Uint8Array(encrypted)),
    };
}

/**
 * Decrypt an E2EE payload back to plaintext using the user-derived password.
 * Returns null if decryption fails (wrong password or corrupted data).
 */
export async function e2eeDecrypt(payload: E2EEPayload, password: string): Promise<string | null> {
    try {
        const salt = base64ToBuff(payload.salt);
        const iv = base64ToBuff(payload.iv);
        const ciphertext = base64ToBuff(payload.ciphertext);
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );
        return new TextDecoder().decode(decrypted);
    } catch {
        return null;
    }
}
