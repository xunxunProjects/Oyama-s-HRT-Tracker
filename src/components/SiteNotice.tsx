import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Megaphone, Close } from './icons';
import { useTranslation } from '../contexts/LanguageContext';
import { noticeService, noticeText, SiteNotice as Notice } from '../services/notice';
import { PAGE_COLUMN } from './PageHeader';

// Plain-text line, same treatment as DoseAdvisory: no card, no fill, no border.
// The operator's banner is a sentence at the top of the app, colored to signal
// how much attention it wants and nothing more. It sits in the page's own
// column, so on a wide window it lines up with the title under it instead of
// running from the sidebar's edge to the window's.

const DISMISS_KEY = 'site-notice-dismissed';

/** Re-check while the tab sits open, so a notice posted mid-session arrives. */
const POLL_INTERVAL_MS = 10 * 60_000;
const MIN_FETCH_INTERVAL_MS = 60_000;

const readDismissed = (): number => {
    try {
        return Number(localStorage.getItem(DISMISS_KEY)) || 0;
    } catch {
        return 0;
    }
};

/**
 * Render the body with bare http(s) URLs turned into links. Everything stays a
 * React text node, so the notice is never interpreted as markup — the point of
 * this banner is a domain change, and a link the reader can follow is most of
 * its value, but not at the cost of injecting an operator-authored string into
 * the DOM as HTML.
 */
const URL_PATTERN = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

const linkify = (text: string): React.ReactNode[] =>
    text.split(URL_PATTERN).map((part, i) =>
        /^https?:\/\//.test(part) ? (
            <a
                key={i}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-current/35 underline-offset-[3px] hover:decoration-current"
            >
                {part}
            </a>
        ) : (
            <React.Fragment key={i}>{part}</React.Fragment>
        ),
    );

const SiteNoticeBanner: React.FC = () => {
    const { t, lang } = useTranslation();
    const [notice, setNotice] = useState<Notice | null>(null);
    const [dismissed, setDismissed] = useState<number>(readDismissed);
    const lastFetchRef = useRef(0);

    const load = useCallback(async () => {
        try {
            setNotice(await noticeService.get());
        } catch {
            // A banner that cannot be fetched is not worth surfacing an error
            // for; the next poll retries.
        }
    }, []);

    useEffect(() => {
        lastFetchRef.current = Date.now();
        void load();
    }, [load]);

    useEffect(() => {
        const refreshIfDue = () => {
            if (document.hidden) return;
            if (Date.now() - lastFetchRef.current < MIN_FETCH_INTERVAL_MS) return;
            lastFetchRef.current = Date.now();
            void load();
        };
        const onVisibility = () => {
            if (!document.hidden) refreshIfDue();
        };
        const poll = window.setInterval(refreshIfDue, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        return () => {
            window.clearInterval(poll);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
        };
    }, [load]);

    if (!notice || notice.revision <= dismissed) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, String(notice.revision));
        } catch {
            /* private mode */
        }
        setDismissed(notice.revision);
    };

    const warn = notice.level === 'warn';
    const tone = warn ? 'text-[var(--warning)]' : 'text-[var(--accent-ink)]';
    const Icon = warn ? Alert : Megaphone;

    return (
        <div className={`shrink-0 pt-2.5 pb-1.5 text-xs ${tone}`}>
            <div className={`${PAGE_COLUMN} flex items-start gap-2`}>
                <span className="icon-line">
                    <Icon size={16} strokeWidth={1.75} />
                </span>
                <p className="flex-1 min-w-0 max-h-[30vh] overflow-y-auto whitespace-pre-wrap break-words">
                    {linkify(noticeText(notice, lang))}
                </p>
                <button
                    onClick={dismiss}
                    aria-label={t('notice.dismiss')}
                    title={t('notice.dismiss')}
                    className="tap-target -mt-[3px] -me-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                    <Close size={16} strokeWidth={1.75} />
                </button>
            </div>
        </div>
    );
};

export default SiteNoticeBanner;
