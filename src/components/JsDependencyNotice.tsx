import React, { useEffect, useState } from 'react';

const DISMISS_KEY = 'js-dependency-notice-dismissed';

function isTorBrowser(): boolean {
    try {
        const ua = navigator.userAgent || '';
        return /TorBrowser|Tor Browser/i.test(ua);
    } catch {
        return false;
    }
}

/**
 * Shown to Tor Browser users (best-effort detection). The site requires
 * JavaScript; this explains that and points them at the security level that
 * keeps JavaScript on, so they are not left thinking the site is broken.
 * English only, per the request.
 */
const JsDependencyNotice: React.FC = () => {
    const [show, setShow] = useState(false);

    useEffect(() => {
        try {
            if (localStorage.getItem(DISMISS_KEY) === '1') return;
        } catch {
            /* private mode */
        }
        if (isTorBrowser()) setShow(true);
    }, []);

    if (!show) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {
            /* private mode */
        }
        setShow(false);
    };

    return (
        <div className="shrink-0 pt-2.5 pb-1.5 text-xs text-[var(--warning)]">
            <div className="max-w-5xl mx-auto px-4 flex items-start gap-2">
                <p className="flex-1 min-w-0">
                    This site requires JavaScript to function. If it does not load in Tor Browser, please lower your
                    security level to &ldquo;Safer&rdquo; or below (Safer / Standard), not &ldquo;Safest&rdquo;.
                </p>
                <button
                    onClick={dismiss}
                    aria-label="Dismiss"
                    className="tap-target -mt-[3px] -me-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                    ×
                </button>
            </div>
        </div>
    );
};

export default JsDependencyNotice;
