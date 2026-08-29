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
 *   - **Push** — upload local after a change, debounced. Fetches only the
 *     backup list, not a body, so logging a dose doesn't cost a full download.
 *
 * Nothing writes over a revision it hasn't read. Storage gives no help here:
 * every save inserts a new newest revision, with no "only if unchanged", so a
 * device that uploads without looking silently replaces whatever another one
 * wrote. Records survive that — the next merge unions them back — but deletions
 * do not, because the tombstone goes with the revision that was overwritten and
 * the record returns. So the push path first checks the newest revision is
 * still the one it reconciled with, and hands off to a full sync when it isn't.
 *
 * Three more things keep this from hammering the endpoint, which keeps ten
 * revisions per account and rate-limits to twenty writes a minute: a push is
 * skipped when the payload's content fingerprint matches what was last
 * uploaded; a sync in flight absorbs any trigger that arrives while it runs;
 * and foreground/poll syncs are floored at one a minute.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cloudService } from '../services/cloud';
import { CLOUD_KEY_CHANGED_EVENT, hasCloudKey, prepareCloudPayload, readCloudBackup } from '../utils/cloudBackup';
import { fingerprintState, hasContent, mergeSyncStates, normalizeSyncState, SyncState } from '../utils/syncMerge';

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

/**
 * What a manual reconcile ended up doing. A bare boolean used to collapse
 * "the cloud copy is encrypted and this device has no key" into the same
 * "failed" as a dead network, which is what left the backup button reporting a
 * generic failure with no hint that the fix is to unlock.
 */
export type SyncOutcome =
    /** Reconciled; the cloud holds this device's data. */
    | 'synced'
    /** Encrypted cloud copy, no key here. Unlock, don't retry. */
    | 'locked'
    /** Network or server trouble; retrying is worth it. */
    | 'error'
    /** Nothing ran — signed out, or another sync was already in flight. */
    | 'skipped';

export interface CloudSyncState {
    status: SyncStatus;
    /** Epoch ms of the last successful reconcile, or null if none yet this session. */
    lastSyncedAt: number | null;
    /**
     * Reconcile right now, ignoring the auto-sync toggle.
     *
     * This is what the manual "back up to cloud" button runs. It cannot be a
     * plain upload: that would overwrite the newest revision without reading it,
     * which is how one device's press erases a deletion another device made.
     */
    syncNow: () => Promise<SyncOutcome>;
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

/**
 * Newest first. The endpoint already orders by created_at DESC, but don't
 * depend on it; the sort is stable, so revisions written in the same second
 * keep whatever order it gave them and both devices read them the same way.
 */
const byNewest = <T extends { created_at: number }>(metas: T[]): T[] =>
    [...metas].sort((a, b) => b.created_at - a.created_at);

/** Id of the newest revision, whether or not it turned out to be readable. */
const newestBackupId = (metas: { id: string }[]): string | null =>
    metas.length ? metas[0].id : null;

type RemoteRead =
    | { kind: 'state'; state: SyncState }
    | { kind: 'empty' }
    /** Encrypted, and this device holds no key — nothing safe to do. */
    | { kind: 'locked' }
    /**
     * Encrypted under a key this device doesn't have, but it does have one of
     * its own — which in practice means the password was just changed here.
     * Changing it re-derives the key and orphans every backup written under the
     * old one, permanently and by design, since that is what stops a password
     * reset from exposing them. Waiting for a key that will never exist would
     * mean this device never reaches the cloud again, so the orphaned copy gets
     * superseded instead.
     *
     * Other devices don't reach this state: the password endpoint drops their
     * sessions, so they sign out and re-derive rather than uploading under a key
     * the account has moved on from.
     */
    | { kind: 'orphaned' }
    | { kind: 'unreadable' };

export const useCloudSync = ({
    token, userId, enabled, ready, buildPayload, applyRemote,
    events, labResults, doseTemplates, weight, pkParams,
}: Options): CloudSyncState => {
    // The reported half of the state. `syncNow` is grafted on at the end so
    // the setters below stay plain data.
    const [state, setState] = useState<Omit<CloudSyncState, 'syncNow'>>(
        { status: 'off', lastSyncedAt: null });

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

    /**
     * Re-checked after every await. Signing out or switching accounts mid-flight
     * invalidates the payload we would build — it belongs to a different
     * account's storage namespace — and switching the toggle off mid-flight
     * should stop the upload that hasn't happened yet, and stop the run from
     * reporting "up to date" over the "sync off" the toggle just set.
     */
    const stillCurrent = useCallback((account: string, authToken: string, force = false): boolean =>
        (force || activeRef.current) && userIdRef.current === account && tokenRef.current === authToken,
        []);

    /**
     * Id of the newest cloud revision this device has actually reconciled with
     * — either one it read, or one its own push created.
     *
     * This is the compare-and-swap the storage layer doesn't have. Every POST
     * inserts a new "newest" revision; there is no "only if unchanged". So a
     * push that hasn't looked first silently overwrites whatever another device
     * wrote in the meantime. Records survive that (the next merge unions them
     * back) but deletions do not: a device that never saw the tombstone
     * re-uploads its copy of the record, and the delete comes undone.
     */
    const lastSeenBackupRef = useRef<string | null>(null);

    /** Fetch the newest backup we can actually read, plus what the newest *is*. */
    const readRemote = useCallback(async (
        authToken: string,
    ): Promise<{ read: RemoteRead; newestId: string | null }> => {
        const metas = await cloudService.listMeta(authToken);
        if (!metas || metas.length === 0) return { read: { kind: 'empty' }, newestId: null };

        const ordered = byNewest(metas);
        const newestId = newestBackupId(ordered);
        let sawLocked = false;
        for (const meta of ordered.slice(0, MAX_BACKUP_PROBES)) {
            const backup = await cloudService.loadOne(authToken, meta.id);
            const read = await readCloudBackup(backup.data);
            if (read.status === 'ok') {
                return { read: { kind: 'state', state: normalizeSyncState(read.data) }, newestId };
            }
            if (read.status === 'locked') { sawLocked = true; break; }
            // Corrupt: a body that isn't JSON tells us nothing about the ones
            // under it, so keep looking rather than treating the cloud as empty
            // and overwriting readable history.
        }
        if (!sawLocked) return { read: { kind: 'unreadable' }, newestId };
        return { read: hasCloudKey() ? { kind: 'orphaned' } : { kind: 'locked' }, newestId };
    }, []);

    /**
     * `force` runs a reconcile even with auto-sync switched off — the manual
     * backup button, which is a deliberate act rather than a scheduled one.
     * It still refuses to write over a cloud copy it could not read.
     */
    const runSync = useCallback(async (force = false): Promise<SyncOutcome> => {
        if (!force && !activeRef.current) return 'skipped';
        if (runningRef.current) { rerunRef.current = true; return 'skipped'; }

        const authToken = tokenRef.current;
        const account = userIdRef.current;
        if (!authToken || !account) return 'skipped';

        runningRef.current = true;
        lastSyncAttemptRef.current = Date.now();
        setState(prev => ({ ...prev, status: 'syncing' }));

        try {
            const { read: remote, newestId } = await readRemote(authToken);
            if (!stillCurrent(account, authToken, force)) return 'skipped';

            // `locked` covers a cloud copy this device cannot read. The
            // `!hasCloudKey()` half covers the mirror case the write path used to
            // paper over: no key at all — a passwordless passkey login, or a
            // non-secure origin where the key cannot be derived. Uploading then
            // meant sending the record in the clear, and because an account with
            // an empty cloud reports `empty` rather than `locked`, that path fell
            // straight through to a push and still called itself 'synced'.
            if (remote.kind === 'locked' || !hasCloudKey()) {
                lockedRef.current = true;
                setState(prev => ({ ...prev, status: 'locked' }));
                return 'locked';
            }
            if (remote.kind === 'unreadable') {
                setState(prev => ({ ...prev, status: 'error' }));
                return 'error';
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
                lastSeenBackupRef.current = newestId;
                if (hasContent(local) && fingerprint !== lastPushedRef.current) {
                    const savedId = await cloudService.save(authToken, await prepareCloudPayload(localPayload));
                    if (!stillCurrent(account, authToken, force)) return 'skipped';
                    lastPushedRef.current = fingerprint;
                    lastSeenBackupRef.current = savedId;
                }
                bootstrappedForRef.current = account;
                setState(prev => ({ ...prev, status: 'synced', lastSyncedAt: Date.now() }));
                return 'synced';
            }

            const result = mergeSyncStates(local, remote.kind === 'state' ? remote.state : null);

            if (result.localChanged) applyRemoteRef.current(result.merged);

            const mergedFingerprint = fingerprintState(result.merged);
            lastSeenBackupRef.current = newestId;
            if (result.remoteStale) {
                // Upload the merge, not the local payload: they differ whenever
                // the cloud held something this device didn't, and uploading
                // local would drop it again.
                const outgoing = result.localChanged
                    ? toPayload(localPayload, result.merged)
                    : localPayload;
                const savedId = await cloudService.save(authToken, await prepareCloudPayload(outgoing));
                if (!stillCurrent(account, authToken, force)) return 'skipped';
                lastSeenBackupRef.current = savedId;
            }
            lastPushedRef.current = mergedFingerprint;
            bootstrappedForRef.current = account;
            setState(prev => ({ ...prev, status: 'synced', lastSyncedAt: Date.now() }));
            return 'synced';
        } catch {
            setState(prev => ({ ...prev, status: 'error' }));
            return 'error';
        } finally {
            runningRef.current = false;
            if (rerunRef.current && activeRef.current) {
                rerunRef.current = false;
                void runSync();
            }
        }
    }, [readRemote, stillCurrent]);

    const runPush = useCallback(async (): Promise<void> => {
        // A debounced push can fire without a preceding reconcile, so it needs
        // its own key check — see the fail-closed note in runSync.
        if (!activeRef.current || lockedRef.current || !hasCloudKey()) return;
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
            // Check the cloud hasn't moved since the revision this device last
            // reconciled with. A blind write is what undoes another device's
            // deletion: this device would upload its own copy of a record it
            // never learned was deleted, and the tombstone would be gone with
            // the revision it overwrote. Only the metadata is fetched, so the
            // common case — nothing else wrote — stays one small request.
            const metas = await cloudService.listMeta(authToken);
            if (!stillCurrent(account, authToken)) return;
            if (newestBackupId(byNewest(metas ?? [])) !== lastSeenBackupRef.current) {
                // Someone else wrote. Hand off to a full reconcile, which the
                // finally below starts once this run has released the lock —
                // clearing the lock here instead would let that reconcile and
                // this run's own cleanup trip over each other.
                rerunRef.current = true;
                return;
            }

            const savedId = await cloudService.save(authToken, await prepareCloudPayload(payload));
            if (!stillCurrent(account, authToken)) return;
            lastPushedRef.current = fingerprint;
            lastSeenBackupRef.current = savedId;
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
    }, [runSync, stillCurrent]);

    // --- Reset whenever the account (or the toggle) changes ---
    useEffect(() => {
        lastPushedRef.current = null;
        lastSeenBackupRef.current = null;
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
        // A reconnect means the previous attempt failed for a reason that has
        // just gone away, so it is worth acting on immediately.
        const onOnline = () => { void runSync(); };
        const poll = window.setInterval(() => { if (!document.hidden) syncIfDue(); }, POLL_INTERVAL_MS);

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener('online', onOnline);
        return () => {
            window.clearInterval(poll);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener('online', onOnline);
        };
    }, [token, userId, enabled, ready, runSync]);

    // --- A key arriving on this device ---
    // Separate from the effect above because it must run with auto-sync *off*
    // too. The manual backup button reconciles regardless of the toggle, so it
    // can leave the status on `locked`; unlocking then has to clear that, or the
    // Account page keeps offering to unlock something already unlocked.
    useEffect(() => {
        if (!token || !userId || !ready) return;
        const onKeyChange = () => {
            // Sign-out clears the key through the same event — that is a lock,
            // not an unlock, and the effect above it has already reset the state.
            if (!hasCloudKey()) return;
            lockedRef.current = false;
            if (enabled) { void runSync(); return; }
            setState(prev => (prev.status === 'locked' ? { ...prev, status: 'off' } : prev));
        };
        window.addEventListener(CLOUD_KEY_CHANGED_EVENT, onKeyChange);
        return () => window.removeEventListener(CLOUD_KEY_CHANGED_EVENT, onKeyChange);
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

    const syncNow = useCallback(() => runSync(true), [runSync]);

    return { ...state, syncNow };
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
