// The service worker is generated with `registerType: 'autoUpdate'`, so a new
// build installs itself and claims this page on its own. What it cannot do is
// swap out the JavaScript this page already loaded — so without the reload
// below, the first refresh only kicks off the background update and the user
// has to refresh a second time before they actually see the new version.

const UPDATE_CHECK_INTERVAL_MS = 60 * 60_000;

/**
 * Reload once when a newly installed service worker takes over, and keep
 * checking for new builds while the app is open.
 */
export function watchForAppUpdates(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    // On a first visit the worker installs and claims this page, which also
    // fires `controllerchange` — nothing stale is running yet, so that one must
    // not reload. This has to be a mutable flag rather than a snapshot taken at
    // startup: after that first claim the page IS controlled, and every later
    // `controllerchange` is a genuine new build that should take over.
    let hasController = !!navigator.serviceWorker.controller;
    let reloading = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hasController) {
            hasController = true;
            return;
        }
        if (reloading) return;
        reloading = true;
        window.location.reload();
    });

    navigator.serviceWorker.ready
        .then(registration => {
            // Browsers only re-check sw.js on navigation. This is an installed
            // PWA that people leave open for days, so poll as well and re-check
            // whenever the tab comes back to the foreground.
            const check = () => {
                if (document.visibilityState !== 'visible') return;
                // Rejects when the device is offline or sw.js 404s mid-deploy;
                // an unhandled rejection here would just be console noise.
                registration.update().catch(() => {});
            };
            window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
            document.addEventListener('visibilitychange', check);
            window.addEventListener('focus', check);
        })
        .catch(() => {
            // No service worker in this context (dev server, or unsupported).
        });
}
