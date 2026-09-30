import { useCallback, useEffect, useRef, useState } from 'react';
import { Regimen, graceH } from '../utils/regimen';
import { regimenLabel } from '../utils/regimenText';

const KEY_ON = 'hrt-dose-reminders';
const KEY_LEAD = 'hrt-reminder-lead-min';
const KEY_MUTED = 'hrt-reminder-muted';

export type ReminderToggleResult = 'ok' | 'denied' | 'unsupported';
export const REMINDER_LEADS = [0, 15, 30, 60] as const;

/** Tauri 1.x exposes its notification API on the window when `withGlobalTauri` is on. */
declare global {
    interface Window {
        __TAURI__?: {
            notification?: {
                isPermissionGranted(): Promise<boolean>;
                requestPermission(): Promise<'granted' | 'denied' | 'default'>;
                sendNotification(options: { title: string; body?: string }): void;
            };
        };
    }
}

const readJSON = <T,>(key: string, fallback: T): T => {
    try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};

/**
 * A notification when a dose comes due, and one more once it is overdue.
 *
 * Native through Tauri on the desktop app, Web Notifications in a browser.
 * Timers are set while the app is open (a background tab still fires); there
 * is no server push, so nothing arrives with the app closed. Permission is
 * only asked for when the person switches this on, never on load.
 */
export function useDoseReminders(regimens: Regimen[], t: (key: string) => string) {
    const native = typeof window !== 'undefined' ? window.__TAURI__?.notification : undefined;
    const supported = !!native || (typeof window !== 'undefined' && 'Notification' in window);

    const [enabled, setEnabledState] = useState(() => supported && localStorage.getItem(KEY_ON) === 'true');
    const [leadMin, setLeadMinState] = useState<number>(() => Number(localStorage.getItem(KEY_LEAD)) || 0);
    const [muted, setMutedState] = useState<string[]>(() => readJSON<string[]>(KEY_MUTED, []));

    // Web permission can be revoked in the browser after the switch was set.
    useEffect(() => {
        if (enabled && !native && Notification.permission !== 'granted') setEnabledState(false);
    }, [enabled, native]);

    const tRef = useRef(t);
    tRef.current = t;

    const setEnabled = useCallback(async (next: boolean): Promise<ReminderToggleResult> => {
        if (!next) {
            setEnabledState(false);
            localStorage.setItem(KEY_ON, 'false');
            return 'ok';
        }
        if (!supported) return 'unsupported';
        let granted: boolean;
        if (native) {
            granted = await native.isPermissionGranted() || (await native.requestPermission()) === 'granted';
        } else {
            let permission = Notification.permission;
            if (permission === 'default') permission = await Notification.requestPermission();
            granted = permission === 'granted';
        }
        setEnabledState(granted);
        localStorage.setItem(KEY_ON, String(granted));
        return granted ? 'ok' : 'denied';
    }, [supported, native]);

    const setLeadMin = useCallback((m: number) => {
        setLeadMinState(m);
        localStorage.setItem(KEY_LEAD, String(m));
    }, []);

    const setMuted = useCallback((key: string, isMuted: boolean) => {
        setMutedState(prev => {
            const next = isMuted ? Array.from(new Set([...prev, key])) : prev.filter(k => k !== key);
            localStorage.setItem(KEY_MUTED, JSON.stringify(next));
            return next;
        });
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const nowMs = Date.now();
        const notify = (title: string, body: string, tag: string) => {
            try {
                if (native) native.sendNotification({ title, body });
                else new Notification(title, { body, tag });
            } catch { /* some embedded webviews expose the API but refuse to show */ }
        };
        const timers: number[] = [];
        for (const r of regimens) {
            if (muted.includes(r.key)) continue;
            const dueMs = r.nextH * 3600000;
            const stamp = Math.round(r.nextH);
            // Only what falls within a day: the regimens are re-read every
            // minute, so later doses get their timers as they come into range.
            const plan: [number, () => void][] = [
                [dueMs - leadMin * 60000, () => notify(tRef.current('reminders.notify_title'), regimenLabel(r, tRef.current), `dose-${r.key}-${stamp}`)],
                [dueMs + graceH(r) * 3600000, () => notify(tRef.current('reminders.notify_overdue'), regimenLabel(r, tRef.current), `overdue-${r.key}-${stamp}`)],
            ];
            for (const [atMs, fire] of plan) {
                if (atMs <= nowMs || atMs - nowMs > 24 * 3600000) continue;
                timers.push(window.setTimeout(fire, atMs - nowMs));
            }
        }
        return () => timers.forEach(id => window.clearTimeout(id));
    }, [enabled, regimens, leadMin, muted, native]);

    return { supported, enabled, setEnabled, leadMin, setLeadMin, muted, setMuted };
}
