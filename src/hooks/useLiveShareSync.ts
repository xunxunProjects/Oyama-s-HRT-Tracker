import { useEffect, useMemo, useRef, useState } from 'react';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { buildSharedDosageSnapshot } from '../services/shareSnapshot';
import { LIVE_SHARES_CHANGED_EVENT, ShareApiError, sharingService } from '../services/sharing';

interface LiveShareSyncOptions {
    authToken: string | null;
    mode: HRTMode;
    events: DoseEvent[];
    simulation: SimulationResult | null;
    calibrationFn: (timeH: number) => number;
}

export const useLiveShareSync = ({
    authToken,
    mode,
    events,
    simulation,
    calibrationFn,
}: LiveShareSyncOptions): void => {
    const [hasLiveShare, setHasLiveShare] = useState(false);
    const [refreshTick, setRefreshTick] = useState(0);
    const baselineSnapshotRef = useRef<ReturnType<typeof buildSharedDosageSnapshot> | null>(null);
    const pendingSnapshotRef = useRef<ReturnType<typeof buildSharedDosageSnapshot> | null>(null);
    const dataReady = events.length === 0 || simulation !== null;

    const snapshot = useMemo(
        () => buildSharedDosageSnapshot({ mode, events, simulation, calibrationFn }),
        [mode, events, simulation, calibrationFn],
    );

    useEffect(() => {
        baselineSnapshotRef.current = dataReady ? snapshot : null;
        pendingSnapshotRef.current = null;
        setHasLiveShare(false);
        if (!authToken || !dataReady) return;

        let cancelled = false;
        const refresh = () => {
            sharingService.list(authToken)
                .then(shares => {
                    if (!cancelled) {
                        const found = shares.some(share => !share.expired && share.live && share.mode === mode);
                        setHasLiveShare(found);
                        if (found) setRefreshTick(value => value + 1);
                    }
                })
                .catch(() => undefined);
        };

        const onVisibilityChange = () => {
            if (!document.hidden) refresh();
        };
        refresh();
        window.addEventListener(LIVE_SHARES_CHANGED_EVENT, refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisibilityChange);
        const refreshTimer = window.setInterval(refresh, 5 * 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
            window.removeEventListener(LIVE_SHARES_CHANGED_EVENT, refresh);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', onVisibilityChange);
        };
        // snapshot is deliberately captured only when a new account/mode
        // becomes ready. Later snapshot changes are queued below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authToken, mode, dataReady]);

    useEffect(() => {
        if (!dataReady || !baselineSnapshotRef.current) return;
        if (snapshot !== baselineSnapshotRef.current) pendingSnapshotRef.current = snapshot;
    }, [dataReady, snapshot]);

    useEffect(() => {
        if (!authToken || !hasLiveShare || !dataReady || !pendingSnapshotRef.current) return;

        const snapshotToSync = pendingSnapshotRef.current;
        const controller = new AbortController();
        let cancelled = false;
        let timer: number | null = null;
        let attempt = 0;
        const fallbackDelays = [5_000, 15_000, 30_000, 60_000];

        const run = async () => {
            try {
                const result = await sharingService.syncLive(authToken, snapshotToSync, controller.signal);
                if (cancelled) return;
                if (result.updated === 0) {
                    setHasLiveShare(false);
                    return;
                }
                if (pendingSnapshotRef.current === snapshotToSync) {
                    pendingSnapshotRef.current = null;
                    baselineSnapshotRef.current = snapshotToSync;
                }
            } catch (error) {
                if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
                if (attempt >= fallbackDelays.length) return;
                const retryAfter = error instanceof ShareApiError ? error.retryAfterMs : null;
                const delay = Math.max(retryAfter ?? 0, fallbackDelays[attempt]);
                attempt += 1;
                timer = window.setTimeout(() => void run(), delay);
            }
        };

        timer = window.setTimeout(() => void run(), 2_000);

        return () => {
            cancelled = true;
            if (timer !== null) window.clearTimeout(timer);
            controller.abort();
        };
    }, [authToken, dataReady, hasLiveShare, mode, refreshTick, snapshot]);
};
