import bcrypt from 'bcryptjs';

import { passwordCheckAllowed } from '../rateLimit';
import { validateUsername, validatePassword, reservedForAdmin } from '../validation';
import { ensureCommunityVoteSchema } from '../../../communityVoteServer';
import { isMemorialAccount, logDeletion } from '../userHelpers';
import { readSmallJsonBody } from '../../../requestInput';
import { LIVE_SESSION_SQL } from './sessions';
import { MAX_NOTICE_BODY, NOTICE_COLUMNS, NOTICE_LANGS, type SiteNoticeRow, serializeNotice } from '../notice';

import type { RequestContext } from '../../../worker';

export async function handleAdminRoute(ctx: RequestContext, payload: any): Promise<Response | null> {
    const { request, env, url, corsHeaders, privateCacheHeaders, withSecurityHeaders, jsonError } = ctx;

    if (!url.pathname.startsWith('/api/admin/')) return null;

    if (payload.role !== 'admin') return jsonError('FORBIDDEN', 'Forbidden', 403);

    // The user list reports each account's 2FA posture and the /2fa routes
    // below read and clear it, so the column and table both have to exist
    // before any of those queries name them. Cached per isolate.

    // --- Site notice ---
    // Reads back what is stored regardless of the schedule, so the editor
    // shows a notice that is queued or already expired instead of the
    // empty state the public endpoint reports for one.
    if (url.pathname === '/api/admin/notice' && request.method === 'GET') {
        const row = await env.DB.prepare(
            `SELECT ${NOTICE_COLUMNS} FROM site_notice WHERE id = 1`,
        ).first<SiteNoticeRow>();
        const stored = row && row.body ? serializeNotice(row) : null;
        return withSecurityHeaders(
            new Response(JSON.stringify({ notice: stored }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    if (url.pathname === '/api/admin/notice' && request.method === 'PUT') {
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const body = parsedBody.value as any;
        if (!body || typeof body.body !== 'string') {
            return jsonError('INVALID_REQUEST', 'Missing notice body', 400);
        }
        const text = body.body.trim();
        if (!text) return jsonError('INVALID_REQUEST', 'Notice body cannot be empty', 400);
        if (text.length > MAX_NOTICE_BODY) {
            return jsonError('INVALID_REQUEST', `Notice body exceeds ${MAX_NOTICE_BODY} characters`, 400);
        }
        const level = body.level === 'warn' ? 'warn' : 'info';

        // Per-locale overrides. Unknown locales and blank strings are
        // dropped rather than rejected: the editor sends a field for every
        // language it offers, and an untouched box is not an error.
        let i18nJson: string | null = null;
        if (body.i18n != null) {
            if (typeof body.i18n !== 'object' || Array.isArray(body.i18n)) {
                return jsonError('INVALID_REQUEST', 'i18n must be an object', 400);
            }
            const cleaned: Record<string, string> = {};
            for (const [lang, value] of Object.entries(body.i18n as Record<string, unknown>)) {
                if (!(NOTICE_LANGS as readonly string[]).includes(lang)) continue;
                if (typeof value !== 'string') continue;
                const trimmed = value.trim();
                if (!trimmed) continue;
                if (trimmed.length > MAX_NOTICE_BODY) {
                    return jsonError(
                        'INVALID_REQUEST',
                        `Notice body for ${lang} exceeds ${MAX_NOTICE_BODY} characters`,
                        400,
                    );
                }
                cleaned[lang] = trimmed;
            }
            if (Object.keys(cleaned).length > 0) i18nJson = JSON.stringify(cleaned);
        }

        // `undefined` distinguishes "not a timestamp" from the null that
        // means "no bound", which is why this cannot just coerce to Number.
        const parseTs = (value: unknown): number | null | undefined => {
            if (value == null) return null;
            const n = Number(value);
            return Number.isFinite(n) ? Math.floor(n) : undefined;
        };
        const startsAt = parseTs(body.startsAt);
        const expiresAt = parseTs(body.expiresAt);
        if (startsAt === undefined || expiresAt === undefined) {
            return jsonError('INVALID_REQUEST', 'startsAt and expiresAt must be unix timestamps or null', 400);
        }
        if (startsAt != null && expiresAt != null && expiresAt <= startsAt) {
            return jsonError('INVALID_REQUEST', 'expiresAt must be after startsAt', 400);
        }

        // revision bumps on every save and never resets, because clients key
        // their "dismissed" flag on it: correcting the wording should reach
        // everyone who had already dismissed the previous revision.
        const saved = await env.DB.prepare(
            `INSERT INTO site_notice (id, body, body_i18n, level, starts_at, expires_at, revision, updated_at)
               VALUES (1, ?1, ?2, ?3, ?4, ?5, 1, unixepoch())
               ON CONFLICT(id) DO UPDATE SET
                 body = ?1, body_i18n = ?2, level = ?3, starts_at = ?4, expires_at = ?5,
                 revision = site_notice.revision + 1, updated_at = unixepoch()
               RETURNING ${NOTICE_COLUMNS}`,
        )
            .bind(text, i18nJson, level, startsAt, expiresAt)
            .first<SiteNoticeRow>();

        return withSecurityHeaders(
            new Response(JSON.stringify({ notice: saved ? serializeNotice(saved) : null }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Take the banner down. Blanks the body instead of dropping the row so
    // the revision counter keeps climbing — see the site_notice note above.
    if (url.pathname === '/api/admin/notice' && request.method === 'DELETE') {
        await env.DB.prepare(
            `UPDATE site_notice SET body = '', body_i18n = NULL, starts_at = NULL, expires_at = NULL,
                 revision = revision + 1, updated_at = unixepoch() WHERE id = 1`,
        ).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Notice cleared' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }
    // Search users (with backup stats, paginated)
    if (url.pathname === '/api/admin/users' && request.method === 'GET') {
        const query = url.searchParams.get('q')?.trim();
        // parseInt('abc') is NaN and a huge digit string overflows
        // D1's bind; both used to reach the database and 500.
        const pageParam = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
        const page = Number.isSafeInteger(pageParam) && pageParam >= 1 ? Math.min(pageParam, 1_000_000) : 1;
        const limitParam = Number.parseInt(url.searchParams.get('limit') ?? '20', 10);
        const limit = Number.isSafeInteger(limitParam) ? Math.min(100, Math.max(1, limitParam)) : 20;
        const offset = (page - 1) * limit;
        const whereClause = query ? 'WHERE username LIKE ?' : '';
        const filterArgs = query ? [`%${query}%`] : [];
        const countResult = await env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${whereClause}`)
            .bind(...filterArgs)
            .first<{ total: number }>();
        const total = countResult?.total ?? 0;

        // Pick the page of users first, then aggregate only for those ids.
        // Joining `content` before the LIMIT made SQLite finish grouping
        // every user before it could sort by username and cut the page,
        // and SUM(LENGTH(data)) reads each body in full — so one page of
        // twenty users read every backup in the database.
        const pageRows = await env.DB.prepare(
            `SELECT id, username, created_at,
              CASE WHEN totp_secret IS NOT NULL AND totp_secret != '' THEN 1 ELSE 0 END AS has_totp
              FROM users ${whereClause} ORDER BY username ASC LIMIT ? OFFSET ?`,
        )
            .bind(...filterArgs, limit, offset)
            .all<{ id: string; username: string; created_at: number; has_totp: number }>();
        const ids = pageRows.results.map(u => u.id);
        const placeholders = ids.map(() => '?').join(',');
        const [backupAgg, passkeyAgg] =
            ids.length === 0
                ? [[], []]
                : await Promise.all([
                      env.DB.prepare(
                          `SELECT user_id, COUNT(*) AS backup_count, MAX(created_at) AS last_backup_at, SUM(LENGTH(data)) AS total_backup_size
                FROM content WHERE user_id IN (${placeholders}) GROUP BY user_id`,
                      )
                          .bind(...ids)
                          .all<{
                              user_id: string;
                              backup_count: number;
                              last_backup_at: number;
                              total_backup_size: number;
                          }>()
                          .then(r => r.results),
                      env.DB.prepare(
                          `SELECT user_id, COUNT(*) AS passkey_count FROM passkeys WHERE user_id IN (${placeholders}) GROUP BY user_id`,
                      )
                          .bind(...ids)
                          .all<{ user_id: string; passkey_count: number }>()
                          .then(r => r.results),
                  ]);
        // Its own query, and allowed to fail, so the list still loads on a
        // database that has not had migration 0015 yet.
        const memorialIds = new Set<string>();
        if (ids.length > 0) {
            try {
                const rows = await env.DB.prepare(
                    `SELECT id FROM users WHERE id IN (${placeholders}) AND memorial_at IS NOT NULL`,
                )
                    .bind(...ids)
                    .all<{ id: string }>();
                for (const r of rows.results) memorialIds.add(r.id);
            } catch {}
        }
        const backupsByUser = new Map(backupAgg.map(r => [r.user_id, r]));
        const passkeysByUser = new Map(passkeyAgg.map(r => [r.user_id, r.passkey_count]));
        const users = pageRows.results.map(u => {
            const b = backupsByUser.get(u.id);
            return {
                ...u,
                backup_count: b?.backup_count ?? 0,
                last_backup_at: b?.last_backup_at ?? null,
                total_backup_size: b?.total_backup_size ?? 0,
                passkey_count: passkeysByUser.get(u.id) ?? 0,
                memorial: memorialIds.has(u.id),
            };
        });
        return withSecurityHeaders(
            new Response(JSON.stringify({ users, total, page, limit }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Storage: what the database is made of. The number that was never
    // visible anywhere until the day it hit the plan's cap. On demand
    // only — SUM(LENGTH()) over `content` reads every backup body.
    if (url.pathname === '/api/admin/storage' && request.method === 'GET') {
        const sizeOf = (table: string, column: string | null) =>
            env.DB.prepare(
                `SELECT COUNT(*) AS rows_, ${column ? `COALESCE(SUM(LENGTH(${column})), 0)` : '0'} AS payload_bytes FROM ${table}`,
            ).first<{ rows_: number; payload_bytes: number }>();
        const tables: [string, string | null][] = [
            ['content', 'data'],
            ['dosage_shares', 'snapshot_json'],
            ['users', null],
            ['sessions', null],
            ['passkeys', null],
            ['backup_codes', null],
            ['deletion_log', null],
        ];
        const rows = await Promise.all(
            tables.map(async ([table, column]) => {
                const r = await sizeOf(table, column);
                return { table, rows: r?.rows_ ?? 0, payload_bytes: r?.payload_bytes ?? 0 };
            }),
        );
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    tables: rows,
                    payload_bytes: rows.reduce((sum, r) => sum + r.payload_bytes, 0),
                    measured_at: Math.floor(Date.now() / 1000),
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            ),
        );
    }

    // Keep an account as a memorial, or make it an ordinary account again.
    // Marking it signs out every device and stops new sign-ins; backups and
    // share links stay exactly as they are.
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/memorial$/) && request.method === 'PUT') {
        const targetId = url.pathname.split('/')[4];
        if (targetId === 'admin') return jsonError('INVALID_REQUEST', 'The admin account cannot be a memorial', 400);
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { memorial } = (parsedBody.value ?? {}) as any;
        if (typeof memorial !== 'boolean') return jsonError('INVALID_REQUEST', 'memorial must be true or false', 400);
        const target = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(targetId).first();
        if (!target) return jsonError('NOT_FOUND', 'User not found', 404);
        try {
            if (memorial) {
                await env.DB.batch([
                    env.DB.prepare(
                        'UPDATE users SET memorial_at = COALESCE(memorial_at, unixepoch()) WHERE id = ?',
                    ).bind(targetId),
                    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
                    env.DB.prepare('DELETE FROM f2f_cli_codes WHERE user_id = ?').bind(targetId),
                ]);
            } else {
                await env.DB.prepare('UPDATE users SET memorial_at = NULL WHERE id = ?').bind(targetId).run();
            }
        } catch (e) {
            console.error('Failed to update memorial state:', e);
            return jsonError(
                'MIGRATION_REQUIRED',
                'Apply migration 0015_memorial_accounts.sql to this database first',
                503,
            );
        }
        return withSecurityHeaders(
            new Response(JSON.stringify({ memorial }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // A memorial account is kept as it is. Anything that would change or
    // remove what it holds waits until it is made an ordinary account again.
    const changesUser =
        (url.pathname.match(/^\/api\/admin\/users\/[^/]+(\/(backups(\/[^/]+)?|password|username|avatar|2fa))?$/) &&
            ['DELETE', 'POST', 'PATCH'].includes(request.method)) ||
        false;
    if (changesUser && (await isMemorialAccount(env, url.pathname.split('/')[4]))) {
        return jsonError('ACCOUNT_MEMORIAL', 'This account is a memorial. Unmark it before changing it.', 409);
    }

    // List user backups (metadata only)
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'GET') {
        const targetId = url.pathname.split('/')[4];
        const backups = await env.DB.prepare(
            'SELECT id, created_at, LENGTH(data) AS data_size FROM content WHERE user_id = ? ORDER BY created_at DESC',
        )
            .bind(targetId)
            .all();
        return withSecurityHeaders(
            new Response(JSON.stringify(backups.results), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Delete a specific backup
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups\/[^/]+$/) && request.method === 'DELETE') {
        const parts = url.pathname.split('/');
        const targetId = parts[4];
        const backupId = parts[6];
        await env.DB.prepare('DELETE FROM content WHERE id = ? AND user_id = ?').bind(backupId, targetId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Backup deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Purge all backups for a user
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/backups$/) && request.method === 'DELETE') {
        const targetId = url.pathname.split('/')[4];
        await env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId).run();
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'All backups purged' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Admin change user password
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/password$/) && request.method === 'POST') {
        const targetId = url.pathname.split('/')[4];
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const body = parsedBody.value as any;
        const { newPassword } = body;
        if (!newPassword) return jsonError('INVALID_REQUEST', 'Missing new password', 400);
        const passVal = validatePassword(newPassword);
        if (!passVal.valid) return jsonError('INVALID_REQUEST', passVal.error!, 400);
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        // An admin reset is the operator's answer to "someone is in my
        // account", so it has to evict whoever currently holds a session on
        // it. Without this the intruder's 7-day JWT kept passing the session
        // lookup in the middleware, and every request it made refreshed
        // last_used_at so the idle timeout never fired either — the one
        // recovery path an operator has left the foothold in place. The
        // self-service change already does this, and so does the 2FA reset
        // below. Unqualified DELETE is right here: the caller is the admin,
        // whose token carries no `sid` and skips the session lookup, so this
        // cannot sign the operator out.
        // Counted before the batch — D1 exposes no portable per-statement
        // row count, and the admin UI reports what was removed.
        const sessRow = await env.DB.prepare(
            `SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?2 AND ${LIVE_SESSION_SQL}`,
        )
            .bind(Math.floor(Date.now() / 1000), targetId)
            .first<{ n: number }>();
        // A reset is a full credential reset, not just a new
        // password: an intruder who enrolled a passkey or fresh
        // backup codes would otherwise survive it.
        await env.DB.batch([
            env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(hashedPassword, targetId),
            env.DB.prepare('UPDATE users SET totp_secret = NULL, totp_last_step = NULL WHERE id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
        ]);
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    message: 'Password updated',
                    sessionsRevoked: sessRow?.n ?? 0,
                    credentialsCleared: true,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            ),
        );
    }

    // Admin reset username
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/username$/) && request.method === 'PATCH') {
        const targetId = url.pathname.split('/')[4];
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const body = parsedBody.value as any;
        const { username } = body;
        if (!username) return jsonError('INVALID_REQUEST', 'Missing username', 400);
        const trimmed = username.trim();
        if (!validateUsername(trimmed)) return jsonError('INVALID_REQUEST', 'Invalid username format', 400);
        if (reservedForAdmin(env, trimmed)) return jsonError('CONFLICT', 'Username already taken', 409);
        const renamed = await env.DB.prepare(
            `UPDATE users SET username = ?
                             WHERE id = ?
                               AND NOT EXISTS (
                                   SELECT 1 FROM users WHERE lower(username) = lower(?) AND id != ?
                               )`,
        )
            .bind(trimmed, targetId, trimmed, targetId)
            .run();
        if (Number(renamed.meta?.changes ?? 0) === 0) return jsonError('CONFLICT', 'Username already taken', 409);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Username updated' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Admin reset avatar
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/avatar$/) && request.method === 'DELETE') {
        const targetId = url.pathname.split('/')[4];
        try {
            await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`);
        } catch (e) {}
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'Avatar reset' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    // Admin read a user's 2FA posture
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/2fa$/) && request.method === 'GET') {
        const targetId = url.pathname.split('/')[4];
        const target = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?')
            .bind(targetId)
            .first()) as any;
        if (!target) return jsonError('NOT_FOUND', 'User not found', 404);
        const pkRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
            .bind(targetId)
            .first<{ n: number }>();
        const bcRow = await env.DB.prepare(
            'SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ? AND used_at IS NULL',
        )
            .bind(targetId)
            .first<{ n: number }>();
        const passkeys = pkRow?.n ?? 0;
        // Deliberately never returns totp_secret itself — an admin needs to
        // know whether a factor exists, not to be handed the seed that
        // would let them mint codes as the user.
        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    totp: !!target.totp_secret,
                    passkeys,
                    backupCodes: bcRow?.n ?? 0,
                    enabled: !!target.totp_secret || passkeys > 0,
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            ),
        );
    }

    // Admin disable / erase a user's 2FA.
    // This is the recovery path for someone who lost their authenticator:
    // the self-service DELETE /api/user/2fa demands a code from the very
    // device they no longer have, and DELETE /api/user/passkeys/:id needs
    // a login they can't complete, so without an admin route the account
    // is stranded behind a factor nobody can present. `scope` defaults to
    // every factor; a narrower scope drops one without touching the rest.
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+\/2fa$/) && request.method === 'DELETE') {
        const targetId = url.pathname.split('/')[4];
        const parsedBody = await readSmallJsonBody(request);
        if (!parsedBody.ok) {
            return parsedBody.tooLarge
                ? jsonError('TOO_LARGE', 'Request body is too large', 413)
                : jsonError('INVALID_REQUEST', 'Invalid JSON body', 400);
        }
        const { scope } = parsedBody.value as any;
        const which = scope === undefined || scope === null ? 'all' : String(scope);
        if (!['all', 'totp', 'passkeys', 'backup_codes'].includes(which)) {
            return jsonError('INVALID_REQUEST', 'Invalid scope', 400);
        }
        const target = (await env.DB.prepare('SELECT totp_secret FROM users WHERE id = ?')
            .bind(targetId)
            .first()) as any;
        if (!target) return jsonError('NOT_FOUND', 'User not found', 404);

        const clearTotp = which === 'all' || which === 'totp';
        const clearPasskeys = which === 'all' || which === 'passkeys';
        const clearBackupCodes = which === 'all' || which === 'backup_codes';

        // Stripping a factor weakens the account, so whoever currently holds
        // a session on it loses that session too: otherwise an attacker who
        // enrolled their own authenticator on a hijacked account keeps the
        // foothold that this very reset exists to evict. Clearing spent
        // backup codes alone is not a downgrade, so it leaves sessions be.
        const revokeSessions = clearTotp || clearPasskeys;

        // Counted before the batch — D1 exposes no portable per-statement
        // row count, and the admin UI reports exactly what was removed.
        const pkRow = clearPasskeys
            ? await env.DB.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?')
                  .bind(targetId)
                  .first<{ n: number }>()
            : null;
        const bcRow = clearBackupCodes
            ? await env.DB.prepare('SELECT COUNT(*) AS n FROM backup_codes WHERE user_id = ?')
                  .bind(targetId)
                  .first<{ n: number }>()
            : null;
        const sessRow = revokeSessions
            ? await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?2 AND ${LIVE_SESSION_SQL}`)
                  .bind(Math.floor(Date.now() / 1000), targetId)
                  .first<{ n: number }>()
            : null;

        const statements: D1PreparedStatement[] = [];
        // totp_last_step goes with the secret: a stale high-water mark left
        // behind would reject the opening codes of whatever secret the user
        // enrols next, since consumeTOTP compares steps against it.
        if (clearTotp)
            statements.push(
                env.DB.prepare('UPDATE users SET totp_secret = NULL, totp_last_step = NULL WHERE id = ?').bind(
                    targetId,
                ),
            );
        if (clearPasskeys) statements.push(env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId));
        if (clearBackupCodes)
            statements.push(env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId));
        if (revokeSessions) statements.push(env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId));
        await env.DB.batch(statements);

        return withSecurityHeaders(
            new Response(
                JSON.stringify({
                    message: '2FA cleared',
                    scope: which,
                    cleared: {
                        totp: clearTotp && !!target.totp_secret,
                        passkeys: pkRow?.n ?? 0,
                        backupCodes: bcRow?.n ?? 0,
                        sessions: sessRow?.n ?? 0,
                    },
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            ),
        );
    }

    // Delete user
    if (url.pathname.match(/^\/api\/admin\/users\/[^/]+$/) && request.method === 'DELETE') {
        const targetId = url.pathname.split('/').pop();
        if (targetId === 'admin') {
            return jsonError('INVALID_REQUEST', 'Cannot delete admin account', 400);
        }
        const target = (await env.DB.prepare('SELECT created_at FROM users WHERE id = ?')
            .bind(targetId)
            .first()) as any;
        const deletedAt = Math.floor(Date.now() / 1000);
        await ensureCommunityVoteSchema(env);
        await env.DB.batch([
            env.DB.prepare('DELETE FROM dosage_shares WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM content WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM passkeys WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM backup_codes WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM f2f_cli_codes WHERE user_id = ?').bind(targetId),
            env.DB.prepare('DELETE FROM community_vote_ballots WHERE user_id = ?').bind(targetId),
            /* F2F seats are tombstones: never delete the row. */
            env.DB.prepare(
                "UPDATE f2f_keys SET status = 'revoked', public_key = '', revoked_at = ?, updated_at = ? WHERE user_id = ?",
            ).bind(deletedAt, deletedAt, targetId),
            env.DB.prepare(
                "UPDATE f2f_seats SET status = 'deleted', deleted_at = ?, updated_at = ? WHERE user_id = ?",
            ).bind(deletedAt, deletedAt, targetId),
            env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId),
        ]);
        try {
            await env.AVATAR_BUCKET.delete(`hrt-tracker-user-avatar/${targetId}`);
        } catch (e) {}
        if (target) await logDeletion(env, 'admin', target?.created_at ?? null);
        return withSecurityHeaders(
            new Response(JSON.stringify({ message: 'User deleted' }), {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }),
        );
    }

    return null;
}
