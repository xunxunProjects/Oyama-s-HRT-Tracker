import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * The reading column every page sits in: one width, one side padding, centred
 * in whatever the sidebar leaves. Pinned to the left, a phone's width of rows
 * hugged the sidebar and left the rest of a desktop window empty.
 */
export const PAGE_COLUMN = 'mx-auto w-full max-w-2xl px-6 md:px-8';

/** A small text button for the right side of a PageHeader (Add, Select…). */
export const headerAction = 'flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-md hover:bg-[var(--color-m3-surface-container)] dark:hover:bg-[var(--color-m3-dark-surface-container)]';

const on = 'text-[var(--color-m3-on-surface)] dark:text-[var(--color-m3-dark-on-surface)]';
const muted = 'text-[var(--color-m3-on-surface-variant)] dark:text-[var(--color-m3-dark-on-surface-variant)]';

/**
 * The title bar at the top of every page. It sticks to the top of the
 * scroller on a full-width band of the page colour, so rows scrolling up
 * disappear under all of it, while its contents keep to PAGE_COLUMN and line
 * up with the rows below.
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
}> = ({ title, subtitle, onBack, backDisabled = false, actions }) => (
    <div className="sticky top-0 z-20 bg-[var(--color-m3-surface-dim)] dark:bg-[var(--color-m3-dark-surface)]">
        <div className={`${PAGE_COLUMN} pt-8 pb-3 flex items-center justify-between gap-4`}>
            <div className="min-w-0">
                {onBack ? (
                    <button
                        onClick={backDisabled ? undefined : onBack}
                        disabled={backDisabled}
                        className="flex min-w-0 items-center gap-3 -ml-2 px-2 py-1.5 rounded-lg enabled:hover:bg-[var(--color-m3-surface-container)] dark:enabled:hover:bg-[var(--color-m3-dark-surface-container)] disabled:cursor-default"
                    >
                        <ArrowLeft size={18} className={`${muted} shrink-0 ${backDisabled ? 'opacity-30' : ''}`} />
                        <span className={`text-xl font-semibold truncate ${on}`}>{title}</span>
                    </button>
                ) : (
                    <h1 className={`text-xl font-semibold ${on}`}>{title}</h1>
                )}
                {/* Default line height on purpose: History pins its day labels at
                    exactly this header's height (top-[94px]). */}
                {subtitle && <p className={`text-sm ${muted} mt-0.5`}>{subtitle}</p>}
            </div>
            {actions && <div className="flex items-center gap-1 -mr-2 shrink-0">{actions}</div>}
        </div>
    </div>
);

export default PageHeader;
