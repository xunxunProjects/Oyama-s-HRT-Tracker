import React, { useState, useSyncExternalStore } from 'react';
import { ChevronRight } from '../../components/icons';
import { apiEndpoint } from '../../services/apiClient';
import type { AdminUser } from '../../services/admin';
import { Lang } from '../../i18n/translations';
import { Waiting } from '../../components/Waiting';

export const muted = 'text-[var(--text-muted)]';
export const on = 'text-[var(--text)]';
export const rowBase = 'w-full min-h-14 flex items-center justify-between gap-4 py-3.5 text-start';
export const textBtn =
    'shrink-0 inline-flex h-8 items-center gap-1 px-2.5 text-sm font-medium text-[var(--accent-ink)] rounded-full hover:bg-[var(--accent-subtle)] disabled:opacity-45 disabled:pointer-events-none';
export const dangerTextBtn =
    'shrink-0 inline-flex h-8 items-center gap-1 px-2.5 text-sm font-medium text-[var(--danger)] rounded-full hover:bg-[var(--surface-hover)] disabled:opacity-45 disabled:pointer-events-none';

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : '');

export function timeAgo(ts: number | null | undefined): string {
    if (!ts) return 'never';
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
}

export const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

// datetime-local <-> unix seconds. The strings speak the operator's local
// time; everything stored and compared server-side is UTC seconds.
export const toLocalInput = (ts: number | null): string => {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value: string): number | null => {
    if (!value) return null;
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
};
export const dateToLocalInput = (date: Date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
export const formatWhen = (value: string) =>
    new Date(value).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

export const NOTICE_LANGS: { id: 'default' | Lang; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'zh', label: '简体中文' },
    { id: 'zh-TW', label: '繁體中文' },
    { id: 'yue', label: '粵語' },
    { id: 'en', label: 'English' },
    { id: 'ja', label: '日本語' },
    { id: 'ko', label: '한국어' },
    { id: 'tr', label: 'Türkçe' },
    { id: 'ru', label: 'Русский' },
    { id: 'uk', label: 'Українська' },
];

/** A user's picture, or their first two letters when they have none. */
export const Avatar: React.FC<{ username: string }> = ({ username }) => {
    const [failed, setFailed] = useState(false);
    return (
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--surface-muted)]">
            {failed ? (
                <span className={`text-xs font-medium ${muted}`}>{username.substring(0, 2).toUpperCase()}</span>
            ) : (
                <img
                    src={apiEndpoint(`/api/user/avatar/${username}`)}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => setFailed(true)}
                />
            )}
        </span>
    );
};

/** One line in a user's actions: icon, name, an optional note, and a chevron. */
export const ActionRow: React.FC<{
    icon: React.ElementType;
    label: string;
    note?: string;
    danger?: boolean;
    /** Acts in place (a dialog) instead of opening a page, so no chevron. */
    inPlace?: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, note, danger, inPlace, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        style={{ '--divider-inset': '2rem' } as React.CSSProperties}
        className={`${rowBase} min-h-12 py-3 row-bleed rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)]`}
    >
        <span className="flex min-w-0 items-center gap-3">
            <Icon size={20} strokeWidth={1.75} className={`shrink-0 ${danger ? 'text-[var(--danger)]' : muted}`} />
            <span className={`text-sm ${danger ? 'text-[var(--danger)]' : on}`}>{label}</span>
        </span>
        <span className={`flex min-w-0 items-center gap-1 text-sm ${muted}`}>
            {note && <span className="truncate tabular-nums">{note}</span>}
            {!danger && !inPlace && <ChevronRight size={18} className="shrink-0 opacity-70 rtl:-scale-x-100" />}
        </span>
    </button>
);

/** A line with a name and a short state on the left and one action on the right. */
export const FactorRow: React.FC<{ label: string; state: string; children: React.ReactNode }> = ({
    label,
    state,
    children,
}) => (
    <div className={`${rowBase} min-h-12 py-3`}>
        <div className="min-w-0">
            <p className={`text-sm ${on}`}>{label}</p>
            <p className={`text-xs ${muted} mt-0.5 tabular-nums`}>{state}</p>
        </div>
        {children}
    </div>
);

export const BusyState: React.FC = () => <Waiting className="justify-center py-8" />;

export const has2FA = (u: AdminUser) => (u.has_totp ?? 0) > 0 || (u.passkey_count ?? 0) > 0;

export const userMeta = (u: AdminUser) =>
    [
        u.memorial && 'memorial account',
        (u.backup_count ?? 0) > 0 && `${plural(u.backup_count ?? 0, 'backup')}, last ${timeAgo(u.last_backup_at)}`,
        has2FA(u) && 'two-step on',
    ]
        .filter(Boolean)
        .join(', ');

// One layout on the page at a time: both at once (one hidden) gave every
// field and fold two copies with the same id.
const WIDE = '(min-width: 768px)';
const subscribeWide = (cb: () => void) => {
    const mq = window.matchMedia(WIDE);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
};
export const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches);
