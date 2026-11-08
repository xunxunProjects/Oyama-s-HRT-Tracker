import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

import { checkRateLimit } from '../rateLimit';
import { getClientIP, MAX_JSON_BODY_BYTES, readSmallBody, readSmallJsonBody } from '../../../requestInput';
import { sha256Hex } from '../../../workerUtil';
import {
    DosageShareSnapshot,
    isJsonObject,
    sanitizeEncryptedShareSnapshot,
    sanitizeShareSnapshot,
} from '../../../shareSnapshotSchema';
import {
    MAX_ACTIVE_SHARES_PER_USER,
    MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER,
    MAX_LIVE_UPDATES_PER_REQUEST,
    MAX_SHARE_EXPIRY_SECONDS,
    MAX_SHARE_REQUEST_BYTES,
    MAX_WRAPPED_SHARE_KEY_BYTES,
    shareOriginFor,
} from '../shareConstants';
import { SHARE_TOKEN_REGEX, signShareViewerPass } from './sharesAccess';
import { validatePassword } from '../validation';
import { sanitizeWrappedShareKey, sweepExpiredShares } from '../shareHelpers';
import { assertStorageBudget } from '../storageBudget';
import { b64urlEncode } from '../webauthn';

import type { RequestContext } from '../../../worker';

export async function handleSharesRoute(
    ctx: RequestContext,
    userId: string,
    jwtSecret: string,
): Promise<Response | null> {
    const {
        request,
        env,
        url,
        corsHeaders,
        privateCacheHeaders,
        withSecurityHeaders,
        jsonError,
        shareJson,
        ctx: execCtx,
    } = ctx;

    if (url.pathname === '/api/shares' && request.method === 'POST') {
        if (!(await checkRateLimit(env, `share-create:${userId}`, 10))) {
            return shareJson(
                { code: 'RATE_LIMITED', message: 'Too many shares created. Please try again later.' },
                429,
                { 'Retry-After': '60' },
            );
        }

        // Streamed and cancelled at the cap; text() buffered a
        // chunked body in full before the size check.
        const parsedBody = await readSmallJsonBody(request, MAX_SHARE_REQUEST_BYTES);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413)
                : shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
        }
        const body = parsedBody.value as unknown;
        if (!isJsonObject(body))
            return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);

        if (body.live !== undefined && typeof body.live !== 'boolean') {
            return shareJson({ code: 'INVALID_REQUEST', message: 'live must be a boolean' }, 400);
        }
        const live = body.live === true;

        // Current clients send `encryptedSnapshot`, sealed in the browser.
        // A plaintext `snapshot` is still accepted from app versions cached
        // before encryption shipped, so their share button keeps working
        // until they update.
        const encrypted = body.encryptedSnapshot !== undefined;
        let sealedSnapshotJson: string | null = null;
        let keyWrapped: string | null = null;
        let legacySnapshot: DosageShareSnapshot | null = null;
        if (encrypted) {
            const sealed = sanitizeEncryptedShareSnapshot(body.encryptedSnapshot);
            if (!sealed.envelope) {
                return shareJson({ code: 'INVALID_SNAPSHOT', message: sealed.error || 'Invalid share snapshot' }, 400);
            }
            sealedSnapshotJson = JSON.stringify(sealed.envelope);
            if (live) {
                keyWrapped = sanitizeWrappedShareKey(body.wrappedKey);
                if (!keyWrapped) {
                    return shareJson(
                        { code: 'INVALID_REQUEST', message: 'A live encrypted share needs wrappedKey' },
                        400,
                    );
                }
            }
        } else {
            const sanitized = sanitizeShareSnapshot(body.snapshot);
            if (!sanitized.snapshot) {
                return shareJson(
                    { code: 'INVALID_SNAPSHOT', message: sanitized.error || 'Invalid share snapshot' },
                    400,
                );
            }
            legacySnapshot = sanitized.snapshot;
        }

        let password: string | null = null;
        if (body.password !== undefined && body.password !== null && body.password !== '') {
            if (typeof body.password !== 'string')
                return shareJson({ code: 'INVALID_REQUEST', message: 'password must be a string' }, 400);
            const passwordValidation = validatePassword(body.password);
            if (!passwordValidation.valid)
                return shareJson({ code: 'INVALID_PASSWORD', message: passwordValidation.error }, 400);
            password = body.password;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        if (
            typeof body.expiresAt !== 'number' ||
            !Number.isSafeInteger(body.expiresAt) ||
            body.expiresAt <= 0 ||
            body.expiresAt > 8_640_000_000_000_000
        ) {
            return shareJson(
                {
                    code: 'INVALID_EXPIRATION',
                    message: 'expiresAt is required and must be a valid epoch-millisecond timestamp',
                },
                400,
            );
        }
        const expiresAtSeconds = Math.floor(body.expiresAt / 1000);
        if (expiresAtSeconds <= nowSeconds) {
            return shareJson({ code: 'INVALID_EXPIRATION', message: 'expiresAt must be in the future' }, 400);
        }
        if (expiresAtSeconds >= MAX_SHARE_EXPIRY_SECONDS) {
            return shareJson({ code: 'INVALID_EXPIRATION', message: 'expiresAt must be before the end of 2100' }, 400);
        }

        // Treat the server receipt time as the snapshot provenance time;
        // clients cannot backdate or future-date a public snapshot. For an
        // encrypted share the page shows the row's own created_at instead.
        if (legacySnapshot) legacySnapshot.createdAt = nowSeconds * 1000;
        const snapshotJson = legacySnapshot ? JSON.stringify(legacySnapshot) : sealedSnapshotJson!;
        if (new TextEncoder().encode(snapshotJson).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
        }

        // Was scoped to this author's own shares, which left every other
        // user's expired snapshot sitting there until they happened to create
        // one themselves. The sweep is global; the per-user tombstone trim
        // below still is not, since its cap is per user by design.
        await sweepExpiredShares(env);
        await env.DB.prepare(
            `DELETE FROM dosage_shares WHERE id IN (
              SELECT id FROM dosage_shares
              WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
              ORDER BY expires_at DESC LIMIT -1 OFFSET ?
            )`,
        )
            .bind(userId, nowSeconds, MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER)
            .run();
        const activeShareCount = await env.DB.prepare(
            'SELECT COUNT(*) AS count FROM dosage_shares WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)',
        )
            .bind(userId, nowSeconds)
            .first<{ count: number }>();
        if ((activeShareCount?.count ?? 0) >= MAX_ACTIVE_SHARES_PER_USER) {
            return shareJson(
                {
                    code: 'SHARE_LIMIT_REACHED',
                    message: `A maximum of ${MAX_ACTIVE_SHARES_PER_USER} active share links is allowed`,
                },
                409,
            );
        }
        await assertStorageBudget(env, new TextEncoder().encode(snapshotJson).byteLength);
        const id = crypto.randomUUID();
        const rawShareToken = b64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
        const tokenHash = await sha256Hex(rawShareToken);
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        await env.DB.prepare(
            'INSERT INTO dosage_shares (id, user_id, token_hash, snapshot_json, password_hash, expires_at, is_live, share_mode, created_at, updated_at, encrypted, key_wrapped) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        )
            .bind(
                id,
                userId,
                tokenHash,
                snapshotJson,
                passwordHash,
                expiresAtSeconds,
                live ? 1 : 0,
                // The mode of an encrypted share stays inside its wrapped key.
                legacySnapshot?.mode ?? null,
                nowSeconds,
                nowSeconds,
                encrypted ? 1 : 0,
                keyWrapped,
            )
            .run();

        return shareJson(
            {
                id,
                token: rawShareToken,
                url: `${shareOriginFor(url, env)}/share/#${rawShareToken}`,
                live,
                mode: legacySnapshot?.mode ?? null,
                encrypted,
                wrappedKey: keyWrapped ? JSON.parse(keyWrapped) : null,
                createdAt: nowSeconds * 1000,
                updatedAt: nowSeconds * 1000,
                expiresAt: expiresAtSeconds * 1000,
                passwordRequired: passwordHash !== null,
            },
            201,
        );
    }

    if (url.pathname === '/api/shares/live' && request.method === 'PUT') {
        if (!(await checkRateLimit(env, `share-live-update:${userId}`, 30))) {
            return shareJson(
                { code: 'RATE_LIMITED', message: 'Too many live share updates. Please try again later.' },
                429,
                { 'Retry-After': '60' },
            );
        }

        const parsedBody = await readSmallJsonBody(request, MAX_SHARE_REQUEST_BYTES);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413)
                : shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
        }
        const body = parsedBody.value as unknown;
        if (!isJsonObject(body)) {
            return shareJson({ code: 'INVALID_REQUEST', message: 'Request body must be an object' }, 400);
        }

        // Encrypted live shares: the browser seals the snapshot once per
        // link, with that link's own key, and names the link it is for.
        // Only the owner's still-active encrypted live links are touched.
        if (body.updates !== undefined) {
            if (!Array.isArray(body.updates) || body.updates.length > MAX_LIVE_UPDATES_PER_REQUEST) {
                return shareJson({ code: 'INVALID_REQUEST', message: 'updates must be an array' }, 400);
            }
            const nowSeconds = Math.floor(Date.now() / 1000);
            const seenIds = new Set<string>();
            const statements: D1PreparedStatement[] = [];
            for (const update of body.updates) {
                if (
                    !isJsonObject(update) ||
                    typeof update.id !== 'string' ||
                    update.id.length < 1 ||
                    update.id.length > 64 ||
                    seenIds.has(update.id)
                ) {
                    return shareJson({ code: 'INVALID_REQUEST', message: 'Each update needs a unique id' }, 400);
                }
                seenIds.add(update.id);
                const sealed = sanitizeEncryptedShareSnapshot(update.encryptedSnapshot);
                if (!sealed.envelope) {
                    return shareJson(
                        { code: 'INVALID_SNAPSHOT', message: sealed.error || 'Invalid share snapshot' },
                        400,
                    );
                }
                statements.push(
                    env.DB.prepare(
                        `UPDATE dosage_shares
               SET snapshot_json = ?, updated_at = ?
               WHERE id = ? AND user_id = ? AND is_live = 1 AND encrypted = 1
                 AND (expires_at IS NULL OR expires_at > ?)`,
                    ).bind(JSON.stringify(sealed.envelope), nowSeconds, update.id, userId, nowSeconds),
                );
            }
            const results = statements.length > 0 ? await env.DB.batch(statements) : [];
            const updated = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
            return shareJson({ updated, updatedAt: nowSeconds * 1000 });
        }

        // Plaintext live shares made before encryption shipped. Never
        // touches an encrypted row, so an app version cached from before
        // cannot overwrite a sealed link with a readable snapshot.
        const sanitized = sanitizeShareSnapshot(body.snapshot);
        if (!sanitized.snapshot) {
            return shareJson({ code: 'INVALID_SNAPSHOT', message: sanitized.error || 'Invalid share snapshot' }, 400);
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        sanitized.snapshot.createdAt = nowSeconds * 1000;
        const validatedSnapshotJson = JSON.stringify(sanitized.snapshot);
        if (new TextEncoder().encode(validatedSnapshotJson).byteLength > MAX_SHARE_REQUEST_BYTES) {
            return shareJson({ code: 'SNAPSHOT_TOO_LARGE', message: 'Share snapshot exceeds the 2 MiB limit' }, 413);
        }

        const activeLiveShares = await env.DB.prepare(
            `SELECT id FROM dosage_shares
             WHERE user_id = ? AND is_live = 1 AND encrypted = 0
               AND share_mode = ?
               AND (expires_at IS NULL OR expires_at > ?)`,
        )
            .bind(userId, sanitized.snapshot.mode, nowSeconds)
            .all<{ id: string }>();

        // Give every link a different set of opaque event identifiers. This
        // prevents recipients of separate links from correlating otherwise
        // identical records through caller-provided/local IDs.
        const updates = (activeLiveShares.results || []).map(({ id }) => {
            const snapshotForShare: DosageShareSnapshot = {
                ...sanitized.snapshot!,
                events: sanitized.snapshot!.events.map(event => ({
                    ...event,
                    id: crypto.randomUUID(),
                    extras: { ...event.extras },
                })),
            };
            return env.DB.prepare(
                `UPDATE dosage_shares
               SET snapshot_json = ?, updated_at = ?
               WHERE id = ? AND user_id = ? AND is_live = 1 AND encrypted = 0
                 AND share_mode = ?
                 AND (expires_at IS NULL OR expires_at > ?)`,
            ).bind(JSON.stringify(snapshotForShare), nowSeconds, id, userId, sanitized.snapshot!.mode, nowSeconds);
        });
        const results = updates.length > 0 ? await env.DB.batch(updates) : [];
        const updated = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
        return shareJson({
            updated,
            updatedAt: nowSeconds * 1000,
        });
    }

    // Re-seal live link keys after a password change. The cloud key that
    // seals them comes from the password, so without this every live
    // link would stop updating from the owner's devices.
    if (url.pathname === '/api/shares/keys' && request.method === 'PUT') {
        if (!(await checkRateLimit(env, `share-live-update:${userId}`, 30))) {
            return shareJson({ code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' }, 429, {
                'Retry-After': '60',
            });
        }
        const parsedKeysBody = await readSmallJsonBody(request);
        if (!parsedKeysBody.ok) {
            return parsedKeysBody.tooLarge
                ? shareJson({ code: 'TOO_LARGE', message: 'Request body is too large' }, 413)
                : shareJson({ code: 'INVALID_REQUEST', message: 'Invalid JSON body' }, 400);
        }
        const body = parsedKeysBody.value as unknown;
        if (!isJsonObject(body) || !Array.isArray(body.keys) || body.keys.length > MAX_LIVE_UPDATES_PER_REQUEST) {
            return shareJson({ code: 'INVALID_REQUEST', message: 'keys must be an array' }, 400);
        }
        const statements: D1PreparedStatement[] = [];
        for (const entry of body.keys) {
            const wrapped = isJsonObject(entry) ? sanitizeWrappedShareKey(entry.wrappedKey) : null;
            if (!wrapped || typeof entry.id !== 'string' || entry.id.length < 1 || entry.id.length > 64) {
                return shareJson({ code: 'INVALID_REQUEST', message: 'Invalid key entry' }, 400);
            }
            statements.push(
                env.DB.prepare(
                    `UPDATE dosage_shares SET key_wrapped = ?
               WHERE id = ? AND user_id = ? AND is_live = 1 AND encrypted = 1 AND key_wrapped IS NOT NULL`,
                ).bind(wrapped, entry.id, userId),
            );
        }
        const results = statements.length > 0 ? await env.DB.batch(statements) : [];
        const updated = results.reduce((count, result) => count + (result.meta.changes ?? 0), 0);
        return shareJson({ updated });
    }

    if (url.pathname === '/api/shares' && request.method === 'GET') {
        const nowSeconds = Math.floor(Date.now() / 1000);
        await env.DB.prepare(
            "UPDATE dosage_shares SET snapshot_json = 'null', password_hash = NULL, key_wrapped = NULL WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ? AND (snapshot_json != 'null' OR password_hash IS NOT NULL OR key_wrapped IS NOT NULL)",
        )
            .bind(userId, nowSeconds)
            .run();
        await env.DB.prepare(
            `DELETE FROM dosage_shares WHERE id IN (
              SELECT id FROM dosage_shares
              WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at <= ?
              ORDER BY expires_at DESC LIMIT -1 OFFSET ?
            )`,
        )
            .bind(userId, nowSeconds, MAX_EXPIRED_SHARE_TOMBSTONES_PER_USER)
            .run();
        const rows = await env.DB.prepare(
            'SELECT id, password_hash, expires_at, is_live, share_mode, created_at, updated_at, encrypted, key_wrapped FROM dosage_shares WHERE user_id = ? ORDER BY created_at DESC',
        )
            .bind(userId)
            .all();
        const shares = (rows.results || []).map((share: any) => ({
            id: share.id,
            live: share.is_live === 1,
            mode: share.share_mode,
            createdAt: share.created_at * 1000,
            updatedAt: (share.updated_at ?? share.created_at) * 1000,
            expiresAt: share.expires_at == null ? null : share.expires_at * 1000,
            passwordRequired: share.password_hash !== null,
            expired: share.expires_at != null && share.expires_at <= nowSeconds,
            encrypted: share.encrypted === 1,
            // Sealed with the owner's cloud key; only their own devices
            // can open it to keep the link updated.
            wrappedKey: share.key_wrapped ? JSON.parse(share.key_wrapped) : null,
        }));
        return shareJson({ shares });
    }

    if (request.method === 'DELETE' && url.pathname.match(/^\/api\/shares\/[^/]+$/)) {
        const shareId = url.pathname.split('/').pop()!;
        const existing = await env.DB.prepare('SELECT id FROM dosage_shares WHERE id = ? AND user_id = ?')
            .bind(shareId, userId)
            .first();
        if (!existing) return shareJson({ code: 'SHARE_NOT_FOUND', message: 'Share not found' }, 404);
        await env.DB.prepare('DELETE FROM dosage_shares WHERE id = ? AND user_id = ?').bind(shareId, userId).run();
        return shareJson({ message: 'Share deleted' });
    }

    return null;
}
