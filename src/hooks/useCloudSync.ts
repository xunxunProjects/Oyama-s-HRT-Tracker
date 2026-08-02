/**
 * Automatic two-way cloud sync.
 *
 * What this replaces: an upload-only auto-backup, plus a startup check that
 * noticed local and cloud had diverged and asked the user to sort it out. The
 * check could only ever offer "add what the cloud has and this device doesn't",
 * so an edit or a deletion left the two sides diverged and the prompt came back
 * on the next launch, and the next.
 *
 * Here the app reconciles the two sides itself (see utils/syncMerge) and says
 * nothing unless something goes wrong.
 *
 * Two paths run against the cloud:
 *
 *   - **Full sync** — fetch the newest backup, merge it with local, apply the
 *     result here, upload it if the cloud copy is behind. Runs on sign-in, when
 *     the tab is brought back to the foreground, when the network returns, and
 *     on a slow timer while visible.
 *   - **Push** — upload local after a change, debounced. No fetch, so typing a
 *     dose doesn't cost a round trip each way.
 *
 * Three things keep this from hammering the backup endpoint, which keeps ten
 * revisions per account and rate-limits to twenty writes a minute:
 * a push is skipped when the payload's content fingerprint matches what was
 * last uploaded; a full sync in flight absorbs any trigger that arrives while
 * it runs; and foreground/poll syncs are floored at one a minute.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudService } from '../services/cloud';
import { CLOUD_KEY_CHANGED_EVENT, hasCloudKey, prepareCloudPayload, readCloudBackup } from '../utils/cloudBackup';
import { fingerprintState, mergeSyncStates, normalizeSyncState, SyncState } from '../utils/syncMerge';

export type SyncStatus =
    /** Signed out, or the user turned sync off. */
    | 'off'
    /** Signed in, nothing in flight. */
    | 'idle'
    | 'syncing'
    | 'synced'
    /** The cloud copy is encrypted and this device has no key for it. */
    | 'locked'
    /** Network or server error; the next trigger retries. */
    | 'error';

export interface CloudSyncState {
    status: SyncStatus;
    /** Epoch ms of the last successful reconcile, or null if none yet this session. */
    lastSyncedAt: number | null;
}

interface Options {
    token: string | null;
    userId: string | null;
    /** The user's auto-sync preference. */
    enabled: boolean;
    /** True once useAppData holds this account's data — never sync before then. */
    ready: boolean;
    buildPayload: () => any;
    applyRemote: (state: SyncState) => void;
    /** Local data. Changes here schedule a push; the values themselves are unused. */
    events: unknown;
    labResults: unknown;
    doseTemplates: unknown;
    weight: unknown;
    pkParams: unknown;
}

/** Debounce before pushing a local edit, long enough to absorb a burst of them. */
const PUSH_DEBOUNCE_MS = 3_000;
/** Floor between foreground/poll syncs. */
const MIN_SYNC_INTERVAL_MS = 60_000;
/** Background poll while the tab is visible. */
const POLL_INTERVAL_MS = 5 * 60_000;
/**
 * How many backups deep to look for one we can actually read. The newest is
 * almost always it; the walk only matters when a write was interrupted and left
 * a truncated body behind.
 */
const MAX_BACKUP_PROBES = 3;

type RemoteRead =
    | { kind: 'state'; state: SyncState }
    | { kind: 'empty' }
    /** Encrypted, and this device holds no key — nothing safe to do. */
    | { kind: 'locked' }
    /**
     * Encrypted under a key this device doesn't have, but it does have one of
     * its own. Changing the account password re-derives the key and orphans
     * every backup written under the old one — permanently, by design, since
     * that is what stops a password reset from exposing them. Waiting for a key
     * that will never exist would mean this device never reaches the cloud
     * again, so the orphaned copy gets superseded instead.
     */
    | { kind: 'orphaned' }
    | { kind: 'unreadable' };

export const useCloudSync = ({
    token, userId, enabled, ready, buildPayload, applyRemote,
    events, labResults, doseTemplates, weight, pkParams,
}: Options): CloudSyncState => {
    const [state, setState] = useState<CloudSyncState>({ status: 'off', lastSyncedAt: null });

    // Callbacks and auth are read at fire time, not captured when a timer is
    // armed: a sync started before a render can otherwise upload a payload
    // built from state that render replaced.
    const buildPayloadRef = useRef(buildPayload);
    buildPayloadRef.current = buildPayload;
    const applyRemoteRef = useRef(applyRemote);
    applyRemoteRef.current = applyRemote;
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const userIdRef = useRef(userId);
    userIdRef.current = userId;
    const activeRef = useRef(false);
    activeRef.current = !!token && !!userId && enabled && ready;

    const runningRef = useRef(false);
    const rerunRef = useRef(false);
    const lastSyncAttemptRef = useRef(0);
    const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * Fingerprint of the payload last known to be in the cloud. A push whose
     * fingerprint matches is skipped — without this, applying a pull would
     * immediately schedule a push of what we just pulled.
     */
    const lastPushedRef = useRef<string | null>(null);
    /**
     * Cleared on sign-out and account switch. Until a full sync has run for the
     * current account, a push would upload this device's data over a cloud copy
     * it has never looked at.
     */
    const bootstrappedForRef = useRef<string | null>(null);
    /**
     * The cloud copy is encrypted and unreadable here. Uploading now would
     * replace data this device cannot see — and, with no key to encrypt with,
     * would store the replacement in the clear. Both paths stop until the key
     * shows up.
     */
    const lockedRef = useRef(false);

    /** Fetch the newest backup we can actually read. */
    const readRemote = useCallback(async (authToken: string): Promise<RemoteRead> => {
        const metas = await cloudService.listMeta(authToken);
        if (!metas || metas.length === 0) return { kind: 'empty' };

        // The endpoint orders by created_at DESC, but don't depend on it.
        const ordered = [...metas].sort((a, b) => b.created_at - a.created_at);
        let sawLocked = false;
        for (const meta of ordered.slice(0, MAX_BACKUP_PROBES)) {
            const backup = await cloudService.loadOne(authToken, meta.id);
            const read = await readCloudBackup(backup.data);
            if (read.status === 'ok') return { kind: 'state', state: normalizeSyncState(read.data) };
            if (read.status === 'locked') { sawLocked = true; break; }
            // Corrupt: a body that isn't JSON tells us nothing about the ones
            // under it, so keep looking rather than treating the cloud as empty
            // and overwriting readable history.
        }
        if (!sawLocked) return { kind: 'unreadable' };
        return hasCloudKey() ? { kind: 'orphaned' } : { kind: 'locked' };
    }, []);

    const runSync = useCallback(async (): Promise<void> => {
        if (!activeRef.current) return;
        if (runningRef.current) { rerunRef.current = true; return; }

        const authToken = tokenRef.current;
        const account = userIdRef.current;
        if (!authToken || !account) return;

        runningRef.current = true;
        lastSyncAttemptRef.current = Date.now();
        setState(prev => ({ ...prev, status: 'syncing' }));

        try {
            const remote = await readRemote(authToken);
            // Signing out or switching accounts mid-flight invalidates
            // everything below — the payload we would build and upload now
            // belongs to a different account's storage namespace.
            if (userIdRef.current !== account || tokenRef.current !== authToken) return;

            if (remote.kind === 'locked') {
                lockedRef.current = true;
                setState(prev => ({ ...prev, status: 'locked' }));
                return;
            }
            if (remote.kind === 'unreadable') {
                setState(prev => ({ ...prev, status: 'error' }));
                return;
            }
            lockedRef.current = false;

            const localPayload = buildPayloadRef.current();
            const local = normalizeSyncState(localPayload);

            if (remote.kind === 'orphaned') {
                // Nothing to merge with — the cloud copy is ciphertext no key on
                // earth opens. Write a readable one and stop. The fingerprint
                // guard matters here: with two devices still holding different
                // keys, each finds the other's copy orphaned, and without it
                // they would take turns re-uploading on every poll.
                const fingerprint = fingerprintState(local);
                if (fingerprint !== lastPushedRef.current) {
                    await cloudService.save(authToken, await prepareCloudPayload(localPayload));
                    if (userIdRef.current !== account) return;
                    lastPushedRef.current = fingerprint;
                }
                bootstrappedForRef.current = account;
                setState({ status: 'synced', lastSyncedAt: Date.now() });
                return;
            }

            const result = mergeSyncStates(local, remote.kind === 'state' ? remote.state : null);

            if (result.localChanged) applyRemoteRef.current(result.merged);

            const mergedFingerprint = fingerprintState(result.merged);
            if (result.remoteStale) {
                // Upload the merge, not the local payload: they differ whenever
                // the cloud held something this device didn't, and uploading
                // local would drop it again.
                const outgoing = result.localChanged
                    ? toPayload(localPayload, result.merged)
                    : localPayload;
                await cloudService.save(authToken, await prepareCloudPayload(outgoing));
                if (userIdRef.current !== account) return;
            }
            lastPushedRef.current = mergedFingerprint;
            bootstrappedForRef.current = account;
            setState({ status: 'synced', lastSyncedAt: Date.now() });
        } catch {
            setState(prev => ({ ...prev, status: 'error' }));
        } finally {
            runningRef.current = false;
            if (rerunRef.current && activeRef.current) {
                rerunRef.current = false;
                void runSync();
            }
        }
    }, [readRemote]);

    const runPush = useCallback(async (): Promise<void> => {
        if (!activeRef.current || lockedRef.current) return;
        const authToken = tokenRef.current;
        const account = userIdRef.current;
        if (!authToken || !account) return;

        // Nothing has looked at the cloud for this account yet. Reconcile first
        // — pushing blind is how a fresh sign-in overwrites everything.
        if (bootstrappedForRef.current !== account) { void runSync(); return; }
        if (runningRef.current) { rerunRef.current = true; return; }

        const payload = buildPayloadRef.current();
        const fingerprint = fingerprintState(normalizeSyncState(payload));
        if (fingerprint === lastPushedRef.current) return;

        runningRef.current = true;
        setState(prev => ({ ...prev, status: 'syncing' }));
        try {
            await cloudService.save(authToken, await prepareCloudPayload(payload));
            if (userIdRef.current !== account) return;
            lastPushedRef.current = fingerprint;
            setState({ status: 'synced', lastSyncedAt: Date.now() });
        } catch {
            setState(prev => ({ ...prev, status: 'error' }));
        } finally {
            runningRef.current = false;
            if (rerunRef.current && activeRef.current) {
                rerunRef.current = false;
                void runSync();
            }
        }
    }, [runSync]);

    // --- Reset whenever the account (or the toggle) changes ---
    useEffect(() => {
        lastPushedRef.current = null;
        bootstrappedForRef.current = null;
        lockedRef.current = false;
        lastSyncAttemptRef.current = 0;
        rerunRef.current = false;
        if (!token || !userId) {
            setState({ status: 'off', lastSyncedAt: null });
        } else {
            setState({ status: enabled ? 'idle' : 'off', lastSyncedAt: null });
        }
    }, [token, userId, enabled]);

    // --- Sign-in / re-enable: reconcile before anything else touches the cloud ---
    useEffect(() => {
        if (!token || !userId || !enabled || !ready) return;
        void runSync();
    }, [token, userId, enabled, ready, runSync]);

    // --- Foreground, reconnect, unlock, and a slow poll ---
    useEffect(() => {
        if (!token || !userId || !enabled || !ready) return;

        const syncIfDue = () => {
            if (Date.now() - lastSyncAttemptRef.current < MIN_SYNC_INTERVAL_MS) return;
            void runSync();
        };
        const onVisibility = () => { if (!document.hidden) syncIfDue(); };
        // A reconnect or a freshly supplied key is worth acting on immediately —
        // both mean the previous attempt failed for a reason that just went away.
        const onOnline = () => { void runSync(); };
        const onKeyChange = () => { void runSync(); };
        const poll = window.setInterval(() => { if (!document.hidden) syncIfDue(); }, POLL_INTERVAL_MS);

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener('online', onOnline);
        window.addEventListener(CLOUD_KEY_CHANGED_EVENT, onKeyChange);
        return () => {
            window.clearInterval(poll);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('online', onOnline);
            window.removeEventListener(CLOUD_KEY_CHANGED_EVENT, onKeyChange);
        };
    }, [token, userId, enabled, ready, runSync]);

    // --- Local edits: debounced push ---
    // Depends only on the data, never on auth or the toggle. Including those
    // would schedule an upload on sign-in — before the reconcile above has
    // looked at what is already up there — or on flipping the setting.
    const skipFirstPushRef = useRef(true);
    useEffect(() => {
        if (skipFirstPushRef.current) {
            skipFirstPushRef.current = false;
            return;
        }
        if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        pushTimerRef.current = setTimeout(() => { void runPush(); }, PUSH_DEBOUNCE_MS);
        return () => {
            if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, labResults, doseTemplates, weight, pkParams]);

    return state;
};

/**
 * Re-issue an export payload with merged contents. Keeps the envelope the local
 * payload already built (meta, active mode, v1 mirrors) so what lands in the
 * cloud stays readable by the import path and by older builds.
 */
function toPayload(localPayload: any, merged: SyncState): any {
    const activeMode = localPayload?.mode === 'transmasc' ? 'transmasc' : 'transfem';
    const active = merged.modes[activeMode];
    return {
        ...localPayload,
        weight: merged.weight ?? localPayload?.weight,
        weightUpdatedAt: merged.weightUpdatedAt || undefined,
        modes: merged.modes,
        events: active.events,
        labResults: active.labResults,
        doseTemplates: active.doseTemplates,
        pkParams: merged.pkParams ?? null,
        pkParamsUpdatedAt: merged.pkParamsUpdatedAt || undefined,
    };
}
