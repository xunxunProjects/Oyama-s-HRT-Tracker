import type { MergeResult, MergeStats, RecordKind, SyncState, TombstoneMap, Tombstones } from './types';
import { emptySyncState, hasOwn, MODE_KEYS, RECORD_KINDS } from './types';
import { asTimestamp, mergeTombstoneMaps } from './tombstones';
import { cleanDoseMG } from '../cleanDose';

const CONTENT_FIELDS: Record<RecordKind, readonly string[]> = {
    events: ['route', 'ester', 'doseMG', 'timeH', 'extras'],
    labResults: ['unit', 'concValue', 'timeH', 'assay'],
    doseTemplates: ['name', 'route', 'ester', 'doseMG', 'extras'],
};

export function stableString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
    if (typeof value === 'object') {
        const o = value as Record<string, unknown>;
        return `{${Object.keys(o)
            .sort()
            .map(k => `${k}:${stableString(o[k])}`)
            .join(',')}}`;
    }
    // Normalise numerics so 4, 4.0 and a hand-edited "4" don't read as an edit.
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const n = Number(value);
    return Number.isFinite(n) && String(value).trim() !== '' ? String(n) : String(value);
}

function contentFingerprint(kind: RecordKind, record: any): string {
    return CONTENT_FIELDS[kind]
        .map(f => {
            const value = record?.[f];
            // Imports tidy float tails off doses (cleanDoseMG), so a tidied copy
            // and an untidied one of the same record must still read as equal.
            return stableString(f === 'doseMG' && typeof value === 'number' ? cleanDoseMG(value) : value);
        })
        .join('|');
}

function recordId(record: any): string | null {
    return record && typeof record.id === 'string' && record.id ? record.id : null;
}

function recordStamp(record: any): number {
    return asTimestamp(record?.updatedAt);
}

// --- Merge ------------------------------------------------------------------

function mergeKind(kind: RecordKind, local: any[], remote: any[], tombstones: TombstoneMap, stats: MergeStats): any[] {
    const out = new Map<string, any>();
    const dropped = new Set<string>();

    for (const record of local) {
        const id = recordId(record);
        if (!id) continue;
        if (hasOwn(tombstones, id)) {
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
        if (hasOwn(tombstones, id)) continue;

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
        const theirsWins =
            theirsAt !== mineAt
                ? theirsAt > mineAt
                : // Neither side is provably newer. Pick by fingerprint so this device
                  // and the other one reach the same answer and stop overwriting each
                  // other; which of the two it lands on is arbitrary by necessity.
                  theirsFp > mineFp;
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
 * an endpoint that keeps five revisions.
 */
function resolveScalar<T>(
    localValue: T | undefined,
    localAt: number,
    remoteValue: T | undefined,
    remoteAt: number,
): { value: T | undefined; at: number } {
    if (localValue === undefined) return { value: remoteValue, at: remoteAt };
    if (remoteValue === undefined) return { value: localValue, at: localAt };
    if (remoteAt !== localAt) {
        return remoteAt > localAt ? { value: remoteValue, at: remoteAt } : { value: localValue, at: localAt };
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
            doseTemplates: mergeTombstoneMaps(
                local.modes[m].deletions.doseTemplates,
                remote.modes[m].deletions.doseTemplates,
            ),
        };
        merged.modes[m] = {
            events: mergeKind('events', local.modes[m].events, remote.modes[m].events, deletions.events, stats),
            labResults: mergeKind(
                'labResults',
                local.modes[m].labResults,
                remote.modes[m].labResults,
                deletions.labResults,
                stats,
            ),
            doseTemplates: mergeKind(
                'doseTemplates',
                local.modes[m].doseTemplates,
                remote.modes[m].doseTemplates,
                deletions.doseTemplates,
                stats,
            ),
            deletions,
        };
        const plan = resolveScalar(
            local.modes[m].plan,
            local.modes[m].planUpdatedAt ?? 0,
            remote.modes[m].plan,
            remote.modes[m].planUpdatedAt ?? 0,
        );
        if (plan.value !== undefined) {
            merged.modes[m].plan = plan.value;
            merged.modes[m].planUpdatedAt = plan.at;
        }
    }

    const weight = resolveScalar(local.weight, local.weightUpdatedAt, remote.weight, remote.weightUpdatedAt);
    merged.weight = weight.value;
    merged.weightUpdatedAt = weight.at;

    const born = resolveScalar(local.birthYear, local.birthYearUpdatedAt, remote.birthYear, remote.birthYearUpdatedAt);
    merged.birthYear = born.value;
    merged.birthYearUpdatedAt = born.at;

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
        if ((block.plan?.length ?? 0) > 0 || (block.planUpdatedAt ?? 0) > 1) return true;
    }
    return state.weightUpdatedAt > 1 || state.birthYearUpdatedAt > 1 || state.pkParamsUpdatedAt > 1;
}

/**
 * Stable identity of a state's *content*, used to decide whether a write is
 * worth making. Ordering, `updatedAt`, and tombstone timestamps are excluded:
 * two devices legitimately disagree on all three while holding the same data,
 * and counting those as a difference would have them upload to each other in a
 * loop — against a backup endpoint that keeps five revisions and rate-limits to
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
        parts.push(`${m}.plan:${block.plan === undefined ? '' : stableString(block.plan)}`);
    }
    parts.push(`weight:${state.weight === undefined ? '' : stableString(state.weight)}`);
    parts.push(`birthYear:${state.birthYear === undefined ? '' : stableString(state.birthYear)}`);
    parts.push(`pkParams:${state.pkParams === undefined ? '' : stableString(state.pkParams)}`);
    return parts.join('\n');
}
