export const NOTICE_COLUMNS = 'body, body_i18n, level, starts_at, expires_at, revision, updated_at';

export interface SiteNoticeRow {
    body: string;
    body_i18n: string | null;
    level: string;
    starts_at: number | null;
    expires_at: number | null;
    revision: number;
    updated_at: number;
}

export function serializeNotice(row: SiteNoticeRow) {
    let i18n: Record<string, string> | null = null;
    try {
        const parsed = row.body_i18n ? JSON.parse(row.body_i18n) : null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) i18n = parsed;
    } catch {
        // A body_i18n that will not parse costs the overrides, not the notice.
    }
    return {
        body: row.body,
        i18n,
        level: row.level === 'warn' ? 'warn' : 'info',
        revision: row.revision,
        startsAt: row.starts_at,
        expiresAt: row.expires_at,
        updatedAt: row.updated_at,
    };
}
