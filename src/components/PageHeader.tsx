import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * The reading column every page sits in: one width, one side padding, centred
 * in whatever the sidebar leaves. Pinned to the left, a phone's width of rows
 * hugged the sidebar and left the rest of a desktop window empty.
 */
export const PAGE_COLUMN = 'mx-auto w-full max-w-2xl px-6 md:px-8';

/** A small pill text button for the right side of a PageHeader (Select, Edit…). */
export const headerAction = 'inline-flex h-8 items-center gap-1.5 px-2.5 text-[0.875rem] font-medium rounded-full hover:bg-[var(--surface-hover)]';

/** The same pill for the action that does the page's job (Add, Log…): terracotta, with a tonal hover. */
export const headerActionAccent = 'inline-flex h-8 items-center gap-1.5 px-2.5 text-[0.875rem] font-medium rounded-full text-[var(--accent-ink)] hover:bg-[var(--accent-subtle)]';

const on = 'text-[var(--text)]';
const muted = 'text-[var(--text-muted)]';

/**
 * The title bar at the top of every page: a large title on frosted glass that
 * sticks to the top of the scroller, so rows scrolling up blur away under it,
 * while its contents keep to PAGE_COLUMN and line up with the rows below. A
 * hairline appears under it only once something has scrolled beneath.
 *
 * A top-level page (Overview aside) has a plain title, an optional count
 * under it and optional actions on the right. A page reached from another one
 * gets `onBack`, and the title becomes the way back.
 */
const PageHeader: React.FC<{
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    onBack?: () => void;
    /** Shows the way back but won't take it (2FA setup that must finish first). */
    backDisabled?: boolean;
    actions?: React.ReactNode;
}> = ({ title, subtitle, onBack, backDisabled = false, actions }) => {
    // A zero-height marker just above the sticky bar: once it has scrolled out
    // of view, content is passing under the bar and the hairline shows.
    const [marker, setMarker] = React.useState<HTMLDivElement | null>(null);
    const [scrolled, setScrolled] = React.useState(false);
    React.useEffect(() => {
        if (!marker || typeof IntersectionObserver === 'undefined') return;
        const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
        io.observe(marker);
        return () => io.disconnect();
    }, [marker]);

    return (
        <>
            <div ref={setMarker} aria-hidden="true" className="h-0" />
            <div className={`glass sticky top-0 z-20 transition-shadow ${scrolled ? 'shadow-[inset_0_-1px_0_var(--border)]' : ''}`}>
                <div className={`${PAGE_COLUMN} pt-4 pb-3 flex items-end justify-between gap-4`}>
                    <div className="min-w-0">
                        {onBack ? (
                            <button
                                onClick={backDisabled ? undefined : onBack}
                                disabled={backDisabled}
                                className="flex min-w-0 items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg enabled:hover:bg-[var(--surface-hover)] disabled:cursor-default"
                            >
                                <ArrowLeft size={18} className={`${muted} shrink-0 ${backDisabled ? 'opacity-30' : ''}`} />
                                <span className={`text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] truncate ${on}`}>{title}</span>
                            </button>
                        ) : (
                            <h1 className={`text-[1.625rem] leading-8 font-semibold tracking-[-0.02em] truncate ${on}`}>{title}</h1>
                        )}
                        {/* History pins its day labels at exactly this header's
                            height (top-[80px]): 16 + 32 + 2 + 18 + 12. */}
                        {subtitle && <p className={`text-xs ${muted} mt-0.5`}>{subtitle}</p>}
                    </div>
                    {actions && <div className="flex items-center gap-1 -mr-2 shrink-0">{actions}</div>}
                </div>
            </div>
        </>
    );
};

export default PageHeader;
