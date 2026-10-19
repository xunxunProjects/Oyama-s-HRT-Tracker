import React from 'react';
import { createRoot } from 'react-dom/client';
import './src/index.css';
import App from './src/App';
import { watchForAppUpdates } from './src/utils/swUpdate';
import { preventPinchZoom } from './src/utils/preventPinchZoom';
import { recoverReplaceJournal } from './src/utils/replaceJournal';

watchForAppUpdates();
preventPinchZoom();

/**
 * A Replace interrupted between localStorage writes leaves a journal. Recover
 * before React mounts, so no component ever reads a half-replaced store. If
 * recovery itself fails, show a blocking screen rather than render data that
 * may be partial.
 */
const container = document.getElementById('root');
if (container) {
    let recoveryFailed = false;
    try {
        recoverReplaceJournal(localStorage);
    } catch (err) {
        recoveryFailed = true;
        console.error('Replace journal recovery failed:', err);
        const panel = document.createElement('div');
        panel.style.cssText =
            'max-width:34rem;margin:12vh auto;padding:1.5rem;font:16px/1.5 system-ui,sans-serif;color:#222;';
        const title = document.createElement('h1');
        title.style.cssText = 'font-size:1.25rem;margin:0 0 .75rem;';
        title.textContent = 'Could not recover an interrupted restore';
        const detail = document.createElement('p');
        detail.style.cssText = 'margin:0 0 1rem;';
        detail.textContent =
            'The app stopped before it could finish or roll back a complete-backup replace. It will not open the data because it may be partial. Reload to try the recovery again; do not import or edit records until this succeeds.';
        const reload = document.createElement('button');
        reload.textContent = 'Reload';
        reload.style.cssText = 'padding:.5rem 1rem;font:inherit;cursor:pointer;';
        reload.addEventListener('click', () => window.location.reload());
        panel.appendChild(title);
        panel.appendChild(detail);
        panel.appendChild(reload);
        container.replaceChildren(panel);
    }
    if (!recoveryFailed) {
        const root = createRoot(container);
        root.render(
            <React.StrictMode>
                <App />
            </React.StrictMode>,
        );
    }
}
