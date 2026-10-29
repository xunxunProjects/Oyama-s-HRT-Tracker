// Small helpers the Worker's modules share: JSON responses, hashing, hex and
// base64, and a constant-time compare.
//
// These live outside worker.ts for the same reason as requestInput.ts: workerd
// treats every named export of the main module as an entrypoint.

const encoder = new TextEncoder();

export const nowSeconds = () => Math.floor(Date.now() / 1000);

export const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });

export const error = (code: string, message: string, status = 400) => json({ code, message }, status);

export function hex(bytes: Uint8Array): string {
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function randomHex(byteCount: number): string {
    return hex(crypto.getRandomValues(new Uint8Array(byteCount)));
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

export function constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let difference = 0;
    for (let index = 0; index < a.length; index += 1) {
        difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
    }
    return difference === 0;
}

export function b64encode(bytes: Uint8Array): string {
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
}

export function b64decode(value: string): Uint8Array | null {
    try {
        return Uint8Array.from(atob(value), char => char.charCodeAt(0));
    } catch {
        return null;
    }
}
