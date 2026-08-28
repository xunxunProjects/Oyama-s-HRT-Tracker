import { Lang } from '../i18n/translations';
import { apiEndpoint, apiFetch } from './apiClient';

export type NoticeLevel = 'info' | 'warn';

export interface SiteNotice {
    /** Fallback text, shown for any locale `i18n` does not cover. */
    body: string;
    /** Optional per-locale overrides. */
    i18n: Partial<Record<Lang, string>> | null;
    level: NoticeLevel;
    /**
     * Bumped on every save and never reset. This is what a dismissal is keyed
     * on, so editing the wording brings the banner back for people who had
     * already dismissed the previous revision.
     */
    revision: number;
    /** Unix seconds, or null for "no bound". */
    startsAt: number | null;
    expiresAt: number | null;
    updatedAt: number;
}

/** What the admin editor sends. Scheduling fields are optional. */
export interface NoticeDraft {
    body: string;
    i18n?: Partial<Record<Lang, string>> | null;
    level?: NoticeLevel;
    startsAt?: number | null;
    expiresAt?: number | null;
}

/** Pick the text for a locale, falling back to the notice's own default. */
export function noticeText(notice: SiteNotice, lang: Lang): string {
    return notice.i18n?.[lang]?.trim() || notice.body;
}

export const noticeService = {
    /**
     * Public read. Unauthenticated by design: a signed-out visitor is exactly
     * who a "this domain is moving" banner has to reach.
     */
    async get(): Promise<SiteNotice | null> {
        const res = await fetch(apiEndpoint('/api/notice'));
        if (!res.ok) throw new Error('Failed to fetch notice');
        const body = await res.json() as { notice: SiteNotice | null };
        return body.notice;
    },

    /** Admin read. Returns a queued or expired notice, which the public one hides. */
    async getStored(token: string): Promise<SiteNotice | null> {
        const res = await apiFetch(apiEndpoint('/api/admin/notice'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
        const body = await res.json() as { notice: SiteNotice | null };
        return body.notice;
    },

    async save(token: string, draft: NoticeDraft): Promise<SiteNotice | null> {
        const res = await apiFetch(apiEndpoint('/api/admin/notice'), {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(draft)
        });
        if (!res.ok) throw new Error(await res.text());
        const body = await res.json() as { notice: SiteNotice | null };
        return body.notice;
    },

    async clear(token: string): Promise<void> {
        const res = await apiFetch(apiEndpoint('/api/admin/notice'), {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(await res.text());
    },
};
