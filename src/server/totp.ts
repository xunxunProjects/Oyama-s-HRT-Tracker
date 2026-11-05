import type { Env } from './env';

// TOTP / backup-code helpers moved from worker.ts

export async function hmacSha256Hex(key: string, data: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return Array.from(new Uint8Array(sig))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function base32Decode(input: string): Uint8Array<ArrayBuffer> {
    const clean = input.toUpperCase().replace(/\s/g, '').replace(/=+$/, '');
    const bytes: number[] = [];
    let buf = 0,
        bitsLeft = 0;
    for (let i = 0; i < clean.length; i++) {
        const val = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(clean[i]);
        if (val < 0) throw new Error(`Invalid base32 char: ${clean[i]}`);
        buf = (buf << 5) | val;
        bitsLeft += 5;
        if (bitsLeft >= 8) {
            bitsLeft -= 8;
            bytes.push((buf >> bitsLeft) & 0xff);
        }
    }
    return new Uint8Array(bytes);
}

export function base32Encode(bytes: Uint8Array): string {
    const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let buf = 0,
        bitsLeft = 0;
    for (const byte of bytes) {
        buf = (buf << 8) | byte;
        bitsLeft += 8;
        while (bitsLeft >= 5) {
            bitsLeft -= 5;
            result += BASE32_CHARS[(buf >> bitsLeft) & 0x1f];
        }
    }
    if (bitsLeft > 0) result += BASE32_CHARS[(buf << (5 - bitsLeft)) & 0x1f];
    return result;
}

export function generateTOTPSecret(): string {
    const bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    return base32Encode(bytes);
}

export async function hotp(secret: string, counter: number): Promise<string> {
    const keyBytes = base32Decode(secret);
    const counterBuf = new ArrayBuffer(8);
    const view = new DataView(counterBuf);
    view.setUint32(0, Math.floor(counter / 0x100000000), false);
    view.setUint32(4, counter % 0x100000000, false);
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, counterBuf);
    const hmac = new Uint8Array(sig);
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
    return (code % 1_000_000).toString().padStart(6, '0');
}

export async function verifyTOTP(secret: string, token: string, windowSize = 1): Promise<boolean> {
    return (await matchTOTPStep(secret, token, windowSize)) !== null;
}

export async function matchTOTPStep(secret: string, token: string, windowSize = 1): Promise<number | null> {
    if (!/^\d{6}$/.test(token)) return null;
    const T = Math.floor(Date.now() / 1000 / 30);
    for (let i = -windowSize; i <= windowSize; i++) {
        if ((await hotp(secret, T + i)) === token) return T + i;
    }
    return null;
}

export async function consumeTOTP(env: Env, userId: string, secret: string, token: string): Promise<boolean> {
    const step = await matchTOTPStep(secret, token);
    if (step === null) return false;
    const res = await env.DB.prepare(
        'UPDATE users SET totp_last_step = ? WHERE id = ? AND (totp_last_step IS NULL OR totp_last_step < ?)',
    )
        .bind(step, userId, step)
        .run();
    return (res.meta?.changes ?? 0) > 0;
}

function unbiasedRandomIndex(length: number): number {
    // Rejection sampling to avoid modulo bias on a uniform byte.
    const limit = 256 - (256 % length);
    let value: number;
    do {
        value = crypto.getRandomValues(new Uint8Array(1))[0];
    } while (value >= limit);
    return value % length;
}

function generateRawBackupCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
        if (i === 4 || i === 8) code += '-';
        code += chars[unbiasedRandomIndex(chars.length)];
    }
    return code;
}

export async function generateAndStoreBackupCodes(env: Env, userId: string, jwtSecret: string): Promise<string[]> {
    await env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(userId).run();
    const codes: string[] = [];
    for (let i = 0; i < 8; i++) {
        const code = generateRawBackupCode();
        const normalized = code.replace(/-/g, '').toLowerCase();
        const hash = await hmacSha256Hex(jwtSecret, normalized);
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)')
            .bind(id, userId, hash)
            .run();
        codes.push(code);
    }
    return codes;
}

export async function verifyAndConsumeBackupCode(
    env: Env,
    userId: string,
    code: string,
    jwtSecret: string,
): Promise<boolean> {
    const normalized = code.trim().replace(/[-\s]/g, '').toLowerCase();
    const hash = await hmacSha256Hex(jwtSecret, normalized);
    const res = await env.DB.prepare(
        `UPDATE backup_codes SET used_at = ?
     WHERE id = (SELECT id FROM backup_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1)`,
    )
        .bind(Math.floor(Date.now() / 1000), userId, hash)
        .run();
    return (res.meta?.changes ?? 0) > 0;
}
