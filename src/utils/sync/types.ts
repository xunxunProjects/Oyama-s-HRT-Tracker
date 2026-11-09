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
    /** The medication plan. `undefined` = the payload said nothing about it. */
    plan?: any[];
    /** Epoch ms of the last plan edit; 1 for a plan saved before plans synced. */
    planUpdatedAt?: number;
}

export interface SyncState {
    modes: Record<ModeKey, ModeBlock>;
    /** `undefined` = the payload said nothing about weight. */
    weight?: number;
    weightUpdatedAt: number;
    /** `undefined` = unstated; `null` = explicitly none. */
    birthYear?: number | null;
    birthYearUpdatedAt: number;
    /** `undefined` = unstated; `null` = explicitly "no overrides". */
    pkParams?: any;
    pkParamsUpdatedAt: number;
    /** Estimator, history mode and age beta. `undefined` = unstated. */
    modelSettings?: any;
    modelSettingsUpdatedAt: number;
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

export const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

/** Tombstone maps use no prototype so an id like `toString` cannot read an inherited value. */
export const nullMap = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

export function emptyTombstones(): Tombstones {
    return { events: nullMap(), labResults: nullMap(), doseTemplates: nullMap() };
}

function emptyModeBlock(): ModeBlock {
    return { events: [], labResults: [], doseTemplates: [], deletions: emptyTombstones() };
}

export function emptySyncState(): SyncState {
    return {
        modes: { transfem: emptyModeBlock(), transmasc: emptyModeBlock() },
        weightUpdatedAt: 0,
        birthYearUpdatedAt: 0,
        pkParamsUpdatedAt: 0,
        modelSettingsUpdatedAt: 0,
    };
}
