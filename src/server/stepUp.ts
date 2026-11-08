import { consumeTOTP, verifyAndConsumeBackupCode } from './totp';
import type { Env } from './env';

/**
 * Recent-authentication check for security-sensitive account changes.
 *
 * A password is not enough to replace the factors that protect an account:
 * otherwise a stolen session and password can enrol an attacker-controlled
 * passkey or rotate the recovery codes and keep the account after the victim
 * signs out every session. Accounts with no second factor keep the older
 * password-only behavior until they add one.
 */
export type StepUpState = 'ok' | 'required' | 'invalid';

export async function checkStepUp(
    env: Env,
    userId: string,
    jwtSecret: string,
    body: Record<string, unknown> | null | undefined,
): Promise<StepUpState> {
    const user = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?').bind(userId).first()) as {
        totp_secret?: string | null;
    } | null;
    const passkeys = (await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
        .bind(userId)
        .first()) as { n?: number } | null;
    const backupCodes = (await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND used_at IS NULL',
    )
        .bind(userId)
        .first()) as { n?: number } | null;

    const hasSecondFactor =
        Boolean(user?.totp_secret) || Number(passkeys?.n ?? 0) > 0 || Number(backupCodes?.n ?? 0) > 0;
    if (!hasSecondFactor) return 'ok';

    const totpCode = typeof body?.totp_code === 'string' ? body.totp_code : '';
    const backupCode = typeof body?.backup_code === 'string' ? body.backup_code : '';
    if (!totpCode && !backupCode) return 'required';

    if (backupCode) {
        return (await verifyAndConsumeBackupCode(env, userId, backupCode, jwtSecret)) ? 'ok' : 'invalid';
    }
    if (!user?.totp_secret) return 'invalid';
    return (await consumeTOTP(env, userId, user.totp_secret, totpCode)) ? 'ok' : 'invalid';
}
