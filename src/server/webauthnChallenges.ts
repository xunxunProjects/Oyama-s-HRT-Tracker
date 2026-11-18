import { sha256Hex } from '../../workerUtil';

import type { Env } from './env';

const CHALLENGE_TTL_SECONDS = 5 * 60;

/**
 * Persist a WebAuthn challenge so it can be consumed exactly once. The signed
 * challenge token stops tampering; this row stops a captured assertion from
 * being replayed while that token is still within its five-minute lifetime.
 */
export async function storeWebAuthnChallenge(
    env: Env,
    challenge: string,
    purpose: 'passkey-auth' | 'passkey-register',
    userId: string | null,
): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
        'INSERT INTO webauthn_challenges (challenge_hash, purpose, user_id, expires_at) VALUES (?, ?, ?, ?)',
    )
        .bind(await sha256Hex(challenge), purpose, userId, now + CHALLENGE_TTL_SECONDS)
        .run();
}

/** Delete a challenge atomically; false means it was already used or expired. */
export async function consumeWebAuthnChallenge(
    env: Env,
    challenge: string,
    purpose: 'passkey-auth' | 'passkey-register',
): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await env.DB.prepare(
        'DELETE FROM webauthn_challenges WHERE challenge_hash = ? AND purpose = ? AND expires_at > ?',
    )
        .bind(await sha256Hex(challenge), purpose, now)
        .run();
    return Number(result.meta?.changes ?? 0) === 1;
}
