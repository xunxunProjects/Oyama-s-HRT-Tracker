/**
 * Two-way merge between this device's records and the newest cloud backup.
 *
 * Replaces the old "detect a difference and ask the user what to do" flow. The
 * prompt could not actually resolve anything — its only action added records
 * the cloud had and this device lacked, so an edit or a deletion left the two
 * sides diverged and the dialog returned on every launch.
 *
 * The merge here is deterministic and symmetric: run it on either device with
 * the same pair of inputs and you get the same result, which is what lets both
 * sides converge without a server-side resolver.
 *
 * Three rules do the work:
 *
 *   - **Records union by id.** Anything either side has, the merge has.
 *   - **Deletions are recorded, not inferred.** Removing a record leaves a
 *     tombstone (id + when). "Absent here, present there" is otherwise
 *     ambiguous — added over there, or deleted over here? — and a plain union
 *     resolves that ambiguity the wrong way every time, resurrecting records
 *     the user deliberately removed. A tombstone answers it outright.
 *   - **Same id, different contents → newest `updatedAt` wins.** Ties (and
 *     records predating `updatedAt`) fall back to comparing the content
 *     fingerprint, purely so both devices pick the *same* side; without a
 *     deterministic tiebreak each keeps its own and the two flip-flop the cloud
 *     backup between them forever.
 *
 * Scalars that aren't records — body weight, PK overrides — carry their own
 * last-write timestamp and are resolved last-write-wins.
 */

import { isTestosteroneEster, isT_LabUnit } from '../../logic';

export type ModeKey = 'transfem' | 'transmasc';
export const MODE_KEYS: readonly ModeKey[] = ['transfem', 'transmasc'];

export type RecordKind = 'events' | 'labResults' | 'doseTemplates';
export const RECORD_KINDS: readonly RecordKind[] = ['events', 'labResults', 'doseTemplates'];

/** id -> epoch ms the record was deleted. */
export type TombstoneMap = Record<string, number>;
export type Tombstones = Record<RecordKind, TombstoneMap>;

export interface ModeBlock {
    events: any[];
    labResults: any[];
    doseTemplates: any[];
    deletions: Tombstones;
}

export interface SyncState {
    modes: Record<ModeKey, ModeBlock>;
    /** `undefined` = the payload said nothing about weight. */
    weight?: number;
    weightUpdatedAt: number;
    /** `undefined` = unstated; `null` = explicitly "no overrides". */
    pkParams?: any;
    pkParamsUpdatedAt: number;
}

export interface MergeStats {
    /** Records the cloud had that this device did not. */
    added: number;
    /** Records replaced by a newer version from the cloud. */
    updated: number;
    /** Records dropped here because another device deleted them. */
    removed: number;
}

export interface MergeResult {
    merged: SyncState;
    stats: MergeStats;
    /** The merge changed what this device holds — apply it locally. */
    localChanged: boolean;
    /** The merge holds something the cloud backup does not — push it. */
    remoteStale: boolean;
}

/**
 * Tombstones are kept long enough to reach a device that has been offline for a
 * season, and no longer. A device that misses the window resurrects the record
 * — the same failure any tombstone-expiring system has, traded against a
 * deletion log that grows without bound.
 */
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * Hard ceiling per kind, so a mass delete can't push the backup past the 2 MiB
 * the endpoint accepts. Past it the oldest tombstones are dropped, and records
 * they covered come back if another device still holds them — clearing a
 * history longer than this in one go is the only way to reach that.
 */
export const TOMBSTONE_MAX_PER_KIND = 5000;

// --- Shapes -----------------------------------------------------------------

export function emptyTombstones(): Tombstones {
    return { events: {}, labResults: {}, doseTemplates: {} };
}

function emptyModeBlock(): ModeBlock {
    return { events: [], labResults: [], doseTemplates: [], deletions: emptyTombstones() };
}

export function emptySyncState(): SyncState {
    return {
        modes: { transfem: emptyModeBlock(), transmasc: emptyModeBlock() },
        weightUpdatedAt: 0,
        pkParamsUpdatedAt: 0,
    };
}

function asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
}

function asTimestamp(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export function sanitizeTombstoneMap(raw: unknown): TombstoneMap {
    const out: TombstoneMap = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, at] of Object.entries(raw as Record<string, unknown>)) {
        if (!id) continue;
        const ts = asTimestamp(at);
        if (ts > 0) out[id] = ts;
    }
    return out;
}

export function sanitizeTombstones(raw: unknown): Tombstones {
    const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    return {
        events: sanitizeTombstoneMap(src.events),
        labResults: sanitizeTombstoneMap(src.labResults),
        doseTemplates: sanitizeTombstoneMap(src.doseTemplates),
    };
}

/** Drop expired entries, then the oldest ones once the per-kind ceiling is hit. */
export function pruneTombstoneMap(map: TombstoneMap, now: number): TombstoneMap {
    const live = Object.entries(map).filter(([, at]) => now - at < TOMBSTONE_TTL_MS);
    if (live.length > TOMBSTONE_MAX_PER_KIND) {
        live.sort((a, b) => b[1] - a[1]);
        live.length = TOMBSTONE_MAX_PER_KIND;
    }
    return Object.fromEntries(live);
}

export function pruneTombstones(t: Tombstones, now: number): Tombstones {
    return {
        events: pruneTombstoneMap(t.events, now),
        labResults: pruneTombstoneMap(t.labResults, now),
        doseTemplates: pruneTombstoneMap(t.doseTemplates, now),
    };
}

function mergeTombstoneMaps(a: TombstoneMap, b: TombstoneMap): TombstoneMap {
    const out: TombstoneMap = { ...a };
    for (const [id, at] of Object.entries(b)) {
        if (!(id in out) || at > out[id]) out[id] = at;
    }
    return out;
}

// --- Payload normalisation --------------------------------------------------

/**
 * Route a flat (pre-`modes`) payload into the two mode blocks.
 *
 * The payload's own `mode` field is deliberately not trusted: v1 exports
 * predate it entirely, and a payload assembled by hand or by an older build can
 * carry both kinds regardless of what it claims. The ester / lab-unit partition
 * is what the import path already uses to keep testosterone records out of the
 * transfem log, and it answers per record rather than per file.
 */
function routeFlatPayload(payload: any, modes: Record<ModeKey, ModeBlock>): void {
    for (const ev of asArray(payload.events)) {
        if (!ev || typeof ev !== 'object') continue;
        modes[isTestosteroneEster(ev.ester) ? 'transmasc' : 'transfem'].events.push(ev);
    }
    for (const lab of asArray(payload.labResults)) {
        if (!lab || typeof lab !== 'object') continue;
        modes[isT_LabUnit(lab.unit) ? 'transmasc' : 'transfem'].labResults.push(lab);
    }
    for (const tpl of asArray(payload.doseTemplates)) {
        if (!tpl || typeof tpl !== 'object') continue;
        modes[isTestosteroneEster(tpl.ester) ? 'transmasc' : 'transfem'].doseTemplates.push(tpl);
    }
}

/** Read any export/backup payload — bare array, flat v1, or v2 `modes` — into a SyncState. */
export function normalizeSyncState(payload: unknown): SyncState {
    const state = emptySyncState();
    if (!payload) return state;

    // Oldest export format: a naked array of dose events.
    if (Array.isArray(payload)) {
        routeFlatPayload({ events: payload }, state.modes);
        return state;
    }
    if (typeof payload !== 'object') return state;

    const p = payload as Record<string, any>;

    if (p.modes && typeof p.modes === 'object' && !Array.isArray(p.modes)) {
        for (const m of MODE_KEYS) {
            const block = p.modes[m];
            if (!block || typeof block !== 'object') continue;
            state.modes[m] = {
                events: asArray(block.events),
                labResults: asArray(block.labResults),
                doseTemplates: asArray(block.doseTemplates),
                deletions: sanitizeTombstones(block.deletions),
            };
        }
    } else {
        routeFlatPayload(p, state.modes);
    }

    if (typeof p.weight === 'number' && Number.isFinite(p.weight) && p.weight > 0) {
        state.weight = p.weight;
        // A payload from before per-field stamps still has to lose to a stamped
        // one, but must beat "nothing at all" — hence 1 rather than 0.
        state.weightUpdatedAt = asTimestamp(p.weightUpdatedAt) || 1;
    }
    if (p.pkParams !== undefined) {
        state.pkParams = p.pkParams ?? null;
        state.pkParamsUpdatedAt = asTimestamp(p.pkParamsUpdatedAt) || 1;
    }

    return state;
}

// --- Content fingerprints ---------------------------------------------------

/**
 * Fields that decide whether two records with the same id are the same record.
 * `updatedAt` is excluded on purpose: it is bookkeeping, and including it would
 * make two byte-identical records look like a conflict.
 */
const CONTENT_FIELDS: Record<RecordKind, readonly string[]> = {
    events: ['route', 'ester', 'doseMG', 'timeH', 'extras'],
    labResults: ['unit', 'concValue', 'timeH'],
    doseTemplates: ['name', 'route', 'ester', 'doseMG', 'extras'],
};

export function stableString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
    if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return `{${Object.keys(o).sort().map(k => `${k}:${stableString(o[k])}`).join(',')}}`;
    }
    // Normalise numerics so 4, 4.0 and a hand-edited "4" don't read as an edit.
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const n = Number(value);
    return Number.isFinite(n) && String(value).trim() !== '' ? String(n) : String(value);
}

function contentFingerprint(kind: RecordKind, record: any): string {
    return CONTENT_FIELDS[kind].map(f => stableString(record?.[f])).join('|');
}

function recordId(record: any): string | null {
    return record && typeof record.id === 'string' && record.id ? record.id : null;
}

function recordStamp(record: any): number {
    return asTimestamp(record?.updatedAt);
}

// --- Merge ------------------------------------------------------------------

function mergeKind(
    kind: RecordKind,
    local: any[],
    remote: any[],
    tombstones: TombstoneMap,
    stats: MergeStats,
): any[] {
    const out = new Map<string, any>();
    const dropped = new Set<string>();

    for (const record of local) {
        const id = recordId(record);
        if (!id) continue;
        if (tombstones[id] !== undefined) {
            // Deleted on another device (or on this one, before a restore put it
            // back in the file we are merging).
            if (!dropped.has(id)) {
                dropped.add(id);
                stats.removed++;
            }
            continue;
        }
        out.set(id, record);
    }

    for (const record of remote) {
        const id = recordId(record);
        if (!id) continue;
        if (tombstones[id] !== undefined) continue;

        const mine = out.get(id);
        if (mine === undefined) {
            out.set(id, record);
            stats.added++;
            continue;
        }

        const mineFp = contentFingerprint(kind, mine);
        const theirsFp = contentFingerprint(kind, record);
        if (mineFp === theirsFp) {
            // Same record on both sides. Adopt the later stamp so the two copies
            // stop differing in metadata and the comparison settles.
            const stamp = Math.max(recordStamp(mine), recordStamp(record));
            if (stamp > 0 && recordStamp(mine) !== stamp) out.set(id, { ...mine, updatedAt: stamp });
            continue;
        }

        const mineAt = recordStamp(mine);
        const theirsAt = recordStamp(record);
        const theirsWins = theirsAt !== mineAt
            ? theirsAt > mineAt
            // Neither side is provably newer. Pick by fingerprint so this device
            // and the other one reach the same answer and stop overwriting each
            // other; which of the two it lands on is arbitrary by necessity.
            : theirsFp > mineFp;
        if (theirsWins) {
            out.set(id, record);
            stats.updated++;
        }
    }

    return [...out.values()];
}

/**
 * Later stamp wins; a side that says nothing never beats one that does.
 *
 * The tie needs the same deterministic tiebreak the records get, and for the
 * same reason. Two devices upgrading from a build that never stamped weight
 * both arrive with the floor stamp, so "keep local on a tie" has each of them
 * decide the other is wrong and upload — for as long as both stay open, against
 * an endpoint that keeps ten revisions.
 */
function resolveScalar<T>(
    localValue: T | undefined, localAt: number,
    remoteValue: T | undefined, remoteAt: number,
): { value: T | undefined; at: number } {
    if (localValue === undefined) return { value: remoteValue, at: remoteAt };
    if (remoteValue === undefined) return { value: localValue, at: localAt };
    if (remoteAt !== localAt) {
        return remoteAt > localAt
            ? { value: remoteValue, at: remoteAt }
            : { value: localValue, at: localAt };
    }
    return stableString(remoteValue) > stableString(localValue)
        ? { value: remoteValue, at: remoteAt }
        : { value: localValue, at: localAt };
}

export function mergeSyncStates(local: SyncState, remote: SyncState | null): MergeResult {
    const stats: MergeStats = { added: 0, updated: 0, removed: 0 };

    if (!remote) {
        return {
            merged: local,
            stats,
            localChanged: false,
            // Nothing in the cloud yet — worth uploading only if there is
            // something to upload.
            remoteStale: hasContent(local),
        };
    }

    const merged = emptySyncState();
    for (const m of MODE_KEYS) {
        const deletions: Tombstones = {
            events: mergeTombstoneMaps(local.modes[m].deletions.events, remote.modes[m].deletions.events),
            labResults: mergeTombstoneMaps(local.modes[m].deletions.labResults, remote.modes[m].deletions.labResults),
            doseTemplates: mergeTombstoneMaps(local.modes[m].deletions.doseTemplates, remote.modes[m].deletions.doseTemplates),
        };
        merged.modes[m] = {
            events: mergeKind('events', local.modes[m].events, remote.modes[m].events, deletions.events, stats),
            labResults: mergeKind('labResults', local.modes[m].labResults, remote.modes[m].labResults, deletions.labResults, stats),
            doseTemplates: mergeKind('doseTemplates', local.modes[m].doseTemplates, remote.modes[m].doseTemplates, deletions.doseTemplates, stats),
            deletions,
        };
    }

    const weight = resolveScalar(local.weight, local.weightUpdatedAt, remote.weight, remote.weightUpdatedAt);
    merged.weight = weight.value;
    merged.weightUpdatedAt = weight.at;

    const pk = resolveScalar(local.pkParams, local.pkParamsUpdatedAt, remote.pkParams, remote.pkParamsUpdatedAt);
    merged.pkParams = pk.value;
    merged.pkParamsUpdatedAt = pk.at;

    const mergedFp = fingerprintState(merged);
    return {
        merged,
        stats,
        localChanged: mergedFp !== fingerprintState(local),
        remoteStale: mergedFp !== fingerprintState(remote),
    };
}

/**
 * Whether a state holds anything a user put there.
 *
 * Comparing against an empty state does not answer this: every payload this app
 * builds carries a body weight, defaulted to 70 kg, so "differs from empty" is
 * true the moment you sign in and mints a backup holding nothing but that
 * default. A scalar counts only once it has a real stamp — the floor stamp of 1
 * is what an unstamped payload gets, the untouched default included.
 */
export function hasContent(state: SyncState): boolean {
    for (const m of MODE_KEYS) {
        const block = state.modes[m];
        for (const kind of RECORD_KINDS) {
            if ((block[kind] as any[]).length > 0) return true;
            if (Object.keys(block.deletions[kind]).length > 0) return true;
        }
    }
    return state.weightUpdatedAt > 1 || state.pkParamsUpdatedAt > 1;
}

/**
 * Stable identity of a state's *content*, used to decide whether a write is
 * worth making. Ordering, `updatedAt`, and tombstone timestamps are excluded:
 * two devices legitimately disagree on all three while holding the same data,
 * and counting those as a difference would have them upload to each other in a
 * loop — against a backup endpoint that keeps ten revisions and rate-limits to
 * twenty writes a minute.
 */
export function fingerprintState(state: SyncState): string {
    const parts: string[] = [];
    for (const m of MODE_KEYS) {
        const block = state.modes[m];
        for (const kind of RECORD_KINDS) {
            const rows = (block[kind] as any[])
                .map(r => {
                    const id = recordId(r);
                    return id ? `${id}=${contentFingerprint(kind, r)}` : null;
                })
                .filter((r): r is string => r !== null)
                .sort();
            parts.push(`${m}.${kind}:${rows.join(';')}`);
            parts.push(`${m}.${kind}.del:${Object.keys(block.deletions[kind]).sort().join(';')}`);
        }
    }
    parts.push(`weight:${state.weight === undefined ? '' : stableString(state.weight)}`);
    parts.push(`pkParams:${state.pkParams === undefined ? '' : stableString(state.pkParams)}`);
    return parts.join('\n');
}
