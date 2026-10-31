import { afterEach, describe, expect, it, vi } from 'vitest';
import { encryptShareSnapshot, generateShareKey } from '../src/services/shareCrypto';
import { ShareDetails, sharingService } from '../src/services/sharing';

const snapshot = {
    version: 1 as const,
    mode: 'transfem' as const,
    timezone: 'UTC',
    createdAt: 1,
    events: [],
    simulation: null,
};

const token = 't'.repeat(43);

const stubAccess = (encryptedSnapshot: Awaited<ReturnType<typeof encryptShareSnapshot>>) => {
    const raw = {
        passwordRequired: false,
        live: true,
        createdAt: 1,
        updatedAt: 2,
        expiresAt: null,
        encryptedSnapshot,
    };
    vi.stubGlobal(
        'fetch',
        vi.fn(
            async () =>
                new Response(JSON.stringify(raw), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ),
    );
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('live share deduplication', () => {
    it('reuses the previous details when the envelope is unchanged', async () => {
        const key = generateShareKey();
        const sealed = await encryptShareSnapshot(snapshot, key);
        const previous = {
            passwordRequired: false,
            live: true,
            createdAt: 1,
            updatedAt: 2,
            expiresAt: null,
            snapshot,
            envelopeFingerprint: sealed.iv,
        } as unknown as ShareDetails;
        stubAccess(sealed);
        const decrypt = vi.spyOn(crypto.subtle, 'decrypt');

        const result = await sharingService.open(token, key, previous);

        expect(result).toBe(previous);
        expect(decrypt).not.toHaveBeenCalled();
    });

    it('decrypts again when the live envelope changed', async () => {
        const key = generateShareKey();
        const oldSealed = await encryptShareSnapshot(snapshot, key);
        const newSealed = await encryptShareSnapshot(snapshot, key);
        const previous = {
            passwordRequired: false,
            live: true,
            createdAt: 1,
            updatedAt: 2,
            expiresAt: null,
            snapshot,
            envelopeFingerprint: oldSealed.iv,
        } as unknown as ShareDetails;
        stubAccess(newSealed);
        const decrypt = vi.spyOn(crypto.subtle, 'decrypt');

        const result = await sharingService.open(token, key, previous);
        if (!('snapshot' in result)) throw new Error('expected unlocked share details');

        expect(result).not.toBe(previous);
        expect(result.snapshot).toEqual(snapshot);
        expect(decrypt).toHaveBeenCalled();
    });
});
