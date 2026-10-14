import { useEffect, useMemo, useRef, useState } from 'react';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { buildSharedDosageSnapshot } from '../services/shareSnapshot';
import {
    LIVE_SHARES_CHANGED_EVENT,
    sealSnapshotForLink,
    ShareApiError,
    SharedDosageSnapshot,
    ShareSummary,
    sharingService,
} from '../services/sharing';
import { unwrapShareKey } from '../services/shareCrypto';
import { CLOUD_KEY_CHANGED_EVENT, getCloudKey } from '../utils/cloudBackup';

/** The owner's live links for one mode, split by how each one is updated. */
interface LiveTargets {
    /** Encrypted links whose key this device could unwrap. */
    encrypted: { id: string; key: string }[];
    /** Links made before share encryption shipped. */
    legacy: boolean;
}

const NO_TARGETS: LiveTargets = { encrypted: [], legacy: false };

const findLiveTargets = async (shares: ShareSummary[], mode: HRTMode): Promise<LiveTargets> => {
    const live = shares.filter(share => !share.expired && share.live);
    const legacy = live.some(share => !share.encrypted && share.mode === mode);
    const cloudKey = getCloudKey();
    const encrypted: LiveTargets['encrypted'] = [];
    if (cloudKey) {
        for (const share of live) {
            if (!share.encrypted || !share.wrappedKey) continue;
            // A link sealed under an older password, or opened on a device
            // that only signed in with a passkey, stays as it was last synced.
            const opened = await unwrapShareKey(share.wrappedKey, cloudKey);
            if (opened && opened.mode === mode) encrypted.push({ id: share.id, key: opened.key });
        }
    }
    return { encrypted, legacy };
};

// Each request stays under the worker's 2 MiB body limit.
const MAX_LIVE_BATCH_CHARS = 1_800_000;

const syncTargets = async (
    authToken: string,
    targets: LiveTargets,
    snapshot: SharedDosageSnapshot,
    signal: AbortSignal,
): Promise<number> => {
    let updated = 0;
    if (targets.legacy) {
        updated += (await sharingService.syncLegacyLive(authToken, snapshot, signal)).updated;
    }
    let batch: Parameters<typeof sharingService.syncEncryptedLive>[1] = [];
    let batchChars = 0;
    const flush = async () => {
        if (batch.length === 0) return;
        updated += (await sharingService.syncEncryptedLive(authToken, batch, signal)).updated;
        batch = [];
        batchChars = 0;
    };
    for (const target of targets.encrypted) {
        const encryptedSnapshot = await sealSnapshotForLink(snapshot, target.key);
        const size = encryptedSnapshot.data.length + 200;
        if (batchChars + size > MAX_LIVE_BATCH_CHARS) await flush();
        batch.push({ id: target.id, encryptedSnapshot });
        batchChars += size;
    }
    await flush();
    return updated;
};

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
    const [targets, setTargets] = useState<LiveTargets>(NO_TARGETS);
    const hasLiveShare = targets.legacy || targets.encrypted.length > 0;
    const [refreshTick, setRefreshTick] = useState(0);
    const baselineSnapshotRef = useRef<ReturnType<typeof buildSharedDosageSnapshot> | null>(null);
    const pendingSnapshotRef = useRef<ReturnType<typeof buildSharedDosageSnapshot> | null>(null);
    const dataReady = events.length === 0 || simulation !== null;

    const snapshot = useMemo(
        () => buildSharedDosageSnapshot({ mode, events, simulation, calibrationFn }),
        [mode, events, simulation, calibrationFn],
    );
    const latestSnapshotRef = useRef(snapshot);
    latestSnapshotRef.current = snapshot;

    useEffect(() => {
        baselineSnapshotRef.current = dataReady ? snapshot : null;
        pendingSnapshotRef.current = null;
        setTargets(NO_TARGETS);
        if (!authToken || !dataReady) return;

        let cancelled = false;
        let previouslyFound = false;
        const refresh = () => {
            sharingService
                .list(authToken)
                .then(shares => findLiveTargets(shares, mode))
                .then(next => {
                    if (!cancelled) {
                        const found = next.legacy || next.encrypted.length > 0;
                        // A fresh object on every poll would restart the pending sync.
                        setTargets(previous => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
                        if (found && !previouslyFound) {
                            // Refresh an existing live link when the owner opens
                            // the app, including changes made before this tab
                            // discovered the link.
                            pendingSnapshotRef.current ??= latestSnapshotRef.current;
                            setRefreshTick(value => value + 1);
                        }
                        previouslyFound = found;
                    }
                })
                .catch(() => undefined);
        };

        const onVisibilityChange = () => {
            if (!document.hidden) refresh();
        };
        refresh();
        window.addEventListener(LIVE_SHARES_CHANGED_EVENT, refresh);
        window.addEventListener(CLOUD_KEY_CHANGED_EVENT, refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', onVisibilityChange);
        const refreshTimer = window.setInterval(refresh, 5 * 60_000);
        return () => {
            cancelled = true;
            window.clearInterval(refreshTimer);
            window.removeEventListener(LIVE_SHARES_CHANGED_EVENT, refresh);
            window.removeEventListener(CLOUD_KEY_CHANGED_EVENT, refresh);
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
                const updated = await syncTargets(authToken, targets, snapshotToSync, controller.signal);
                if (cancelled) return;
                if (updated === 0) {
                    setTargets(NO_TARGETS);
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
    }, [authToken, dataReady, hasLiveShare, targets, mode, refreshTick, snapshot]);
};
