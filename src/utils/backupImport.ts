/**
 * Import (replace/merge) reconciliation, independent of React and the DOM.
 *
 * These are the same decisions `useAppData` used to make inline: which records
 * an import speaks about, which records it replaces, how a flat v1 payload is
 * routed between the two HRT modes, and which ids a merge already has. Storage
 * and the current active-mode arrays are injected so tests can drive the real
 * code with an in-memory store.
 *
 * No transaction is claimed: writes still happen one key at a time, exactly as
 * before. This module changes where the logic lives, not what it does.
 */
import {
    BODY_WEIGHT_KG_MAX,
    BODY_WEIGHT_KG_MIN,
    DoseEvent,
    LabResult,
    PKCustomParams,
    isT_LabUnit,
    isTestosteroneEster,
    sanitizePKParams,
} from '../../logic';
import {
    DoseTemplate,
    StorageLike,
    loadJSONFromStorage,
    modeKeyFor,
    readTombstonesFromStorage,
    sanitizeImportedEvents,
    sanitizeImportedLabResults,
    sanitizeImportedTemplates,
    writeTombstonesToStorage,
} from './backupState';
import { MODE_KEYS, ModeKey, RecordKind } from './syncMerge';

export interface ImportActiveRecords {
    events: DoseEvent[];
    labResults: LabResult[];
    doseTemplates: DoseTemplate[];
    weight: number;
}

export interface ImportStorageContext {
    storage: StorageLike;
    owner: string;
    mode: ModeKey;
    active: ImportActiveRecords;
}

export interface ProcessImportedDataResult {
    /** Replacement for the active mode's records; undefined = not mentioned. */
    events?: DoseEvent[];
    labResults?: LabResult[];
    doseTemplates?: DoseTemplate[];
    weight?: number;
    pkParams?: PKCustomParams;
}

export interface MergeImportedDataResult {
    /** New records only; the caller appends them to the active state. */
    events: DoseEvent[];
    labResults: LabResult[];
    doseTemplates: DoseTemplate[];
    weight?: number;
    mergedCount: number;
}

const otherModeFor = (mode: ModeKey): ModeKey => (mode === 'transmasc' ? 'transfem' : 'transmasc');

/** Mirrors the hook's historical `forgetDeletions`, with storage injected. */
const forgetTombstones = (
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    kind: RecordKind,
    ids: string[],
    now: number,
): void => {
    if (!ids.length) return;
    const current = readTombstonesFromStorage(storage, owner, mode);
    let touched = false;
    for (const id of ids) {
        if (current[kind][id] !== undefined) {
            delete current[kind][id];
            touched = true;
        }
    }
    if (touched) writeTombstonesToStorage(storage, owner, mode, current, now);
};

/** Mirrors the hook's historical `recordDeletions`, with storage injected. */
const recordTombstones = (
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    kind: RecordKind,
    ids: string[],
    now: number,
): void => {
    if (!ids.length) return;
    const current = readTombstonesFromStorage(storage, owner, mode);
    for (const id of ids) if (id) current[kind][id] = now;
    writeTombstonesToStorage(storage, owner, mode, current, now);
};

/**
 * A replacement payload states the whole set for a kind: ids it leaves out are
 * deletions, and ids it brings back lose any tombstone that would delete them
 * again on the next sync. Same rule the hook applied inline.
 */
export const reconcileReplacementInStorage = (
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    kind: RecordKind,
    before: { id: string }[],
    after: { id: string }[],
    now = Date.now(),
): void => {
    const keep = new Set(after.map(record => record.id));
    const gone = before.map(record => record.id).filter(id => id && !keep.has(id));
    forgetTombstones(storage, owner, mode, kind, [...keep], now);
    recordTombstones(storage, owner, mode, kind, gone, now);
};

const clampImportedWeight = (raw: unknown): number | undefined => {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
    return Math.min(BODY_WEIGHT_KG_MAX, Math.max(BODY_WEIGHT_KG_MIN, raw));
};

const readRecords = <T>(storage: StorageLike, owner: string, mode: ModeKey, suffix: string): T[] =>
    loadJSONFromStorage<T[]>(storage, modeKeyFor(owner, mode, suffix), []);

const appendOtherModeRecords = (
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    kind: RecordKind,
    suffix: string,
    incoming: { id: string }[],
    now: number,
): number => {
    const existing = readRecords<{ id: string }>(storage, owner, mode, suffix);
    const existingIds = new Set(existing.map(record => record.id));
    const newOnes = incoming.filter(record => !existingIds.has(record.id));
    // An explicit import is the user asking for these records back, so any
    // tombstone standing in the way goes.
    forgetTombstones(
        storage,
        owner,
        mode,
        kind,
        incoming.map(record => record.id),
        now,
    );
    if (newOnes.length) {
        storage.setItem(modeKeyFor(owner, mode, suffix), JSON.stringify([...existing, ...newOnes]));
    }
    return newOnes.length;
};

/**
 * Replace-style import. Performs every storage write the hook used to perform,
 * except the weight/PK writes owned by React setters, and returns the active
 * mode's replacement arrays for the caller to install in state.
 *
 * With `check`, sanitisation and the "anything valid?" test still run, but no
 * storage or tombstone write happens.
 */
export function processImportedDataToStorage(
    parsed: any,
    context: ImportStorageContext,
    { check = false, now }: { check?: boolean; now?: number } = {},
): ProcessImportedDataResult {
    const { storage, owner, mode, active } = context;
    // Only the injected clock is fixed; otherwise each write is stamped when
    // it happens, as the inline code did.
    const clock = () => now ?? Date.now();
    const otherMode = otherModeFor(mode);
    // Writes to the other mode's storage, held back until the payload has
    // passed the "anything valid?" test, so a check (or a payload that fails
    // it) leaves storage as it was.
    const otherModeWrites: (() => void)[] = [];
    let newEvents: DoseEvent[] = [];
    let newWeight: number | undefined = undefined;
    let newLabs: LabResult[] = [];
    let newTemplates: DoseTemplate[] = [];
    let newPkParams: PKCustomParams | undefined = undefined;
    let importedOtherMode = false;
    // Which kinds the payload actually speaks about, tracked one by one. A
    // present-but-empty array still means "none"; only an absent key is
    // silence.
    const replaced = { events: false, labResults: false, doseTemplates: false };

    // New multi-mode payload: { modes: { transfem: {...}, transmasc: {...} } }
    if (parsed && typeof parsed === 'object' && parsed.modes && typeof parsed.modes === 'object') {
        const modesBlock = parsed.modes as Record<string, any>;
        for (const m of MODE_KEYS) {
            const block = modesBlock[m];
            if (!block || typeof block !== 'object') continue;
            const evs = Array.isArray(block.events) ? sanitizeImportedEvents(block.events) : [];
            const ls = Array.isArray(block.labResults) ? sanitizeImportedLabResults(block.labResults) : [];
            const tmps = Array.isArray(block.doseTemplates) ? sanitizeImportedTemplates(block.doseTemplates) : [];
            if (m === mode) {
                if (Array.isArray(block.events)) {
                    newEvents = evs;
                    replaced.events = true;
                }
                if (Array.isArray(block.labResults)) {
                    newLabs = ls;
                    replaced.labResults = true;
                }
                if (Array.isArray(block.doseTemplates)) {
                    newTemplates = tmps;
                    replaced.doseTemplates = true;
                }
            } else {
                // Write the other mode's data straight to storage.
                if (Array.isArray(block.events)) {
                    otherModeWrites.push(() => {
                        reconcileReplacementInStorage(
                            storage,
                            owner,
                            m,
                            'events',
                            readRecords<DoseEvent>(storage, owner, m, 'events'),
                            evs,
                            clock(),
                        );
                        storage.setItem(modeKeyFor(owner, m, 'events'), JSON.stringify(evs));
                    });
                    importedOtherMode = true;
                }
                if (Array.isArray(block.labResults)) {
                    otherModeWrites.push(() => {
                        reconcileReplacementInStorage(
                            storage,
                            owner,
                            m,
                            'labResults',
                            readRecords<LabResult>(storage, owner, m, 'lab-results'),
                            ls,
                            clock(),
                        );
                        storage.setItem(modeKeyFor(owner, m, 'lab-results'), JSON.stringify(ls));
                    });
                    importedOtherMode = true;
                }
                if (Array.isArray(block.doseTemplates)) {
                    otherModeWrites.push(() => {
                        reconcileReplacementInStorage(
                            storage,
                            owner,
                            m,
                            'doseTemplates',
                            readRecords<DoseTemplate>(storage, owner, m, 'dose-templates'),
                            tmps,
                            clock(),
                        );
                        storage.setItem(modeKeyFor(owner, m, 'dose-templates'), JSON.stringify(tmps));
                    });
                    importedOtherMode = true;
                }
            }
        }
        newWeight = clampImportedWeight(parsed.weight);
        if (parsed.pkParams && typeof parsed.pkParams === 'object') {
            newPkParams = sanitizePKParams(parsed.pkParams) ?? undefined;
        }
    } else if (Array.isArray(parsed)) {
        newEvents = sanitizeImportedEvents(parsed);
        replaced.events = true;
    } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.events)) {
            newEvents = sanitizeImportedEvents(parsed.events);
            replaced.events = true;
        }
        newWeight = clampImportedWeight(parsed.weight);
        if (Array.isArray(parsed.labResults)) {
            newLabs = sanitizeImportedLabResults(parsed.labResults);
            replaced.labResults = true;
        }
        if (Array.isArray(parsed.doseTemplates)) {
            newTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
            replaced.doseTemplates = true;
        }
        if (parsed.pkParams && typeof parsed.pkParams === 'object') {
            newPkParams = sanitizePKParams(parsed.pkParams) ?? undefined;
        }
    }

    // v1 flat-format safety: if the payload contains items that belong to the
    // *other* HRT mode (T esters / T-unit labs), siphon them into that mode's
    // storage so they don't silently corrupt the active record.
    if (!('modes' in (parsed || {}))) {
        const eventBelongs = (e: DoseEvent) =>
            mode === 'transmasc' ? isTestosteroneEster(e.ester) : !isTestosteroneEster(e.ester);
        const keepEvs: DoseEvent[] = [];
        const otherEvs: DoseEvent[] = [];
        for (const e of newEvents) (eventBelongs(e) ? keepEvs : otherEvs).push(e);
        if (otherEvs.length) {
            otherModeWrites.push(() => {
                const existing = readRecords<DoseEvent>(storage, owner, otherMode, 'events');
                const existingIds = new Set(existing.map(x => x.id));
                forgetTombstones(
                    storage,
                    owner,
                    otherMode,
                    'events',
                    otherEvs.map(e => e.id),
                    clock(),
                );
                storage.setItem(
                    modeKeyFor(owner, otherMode, 'events'),
                    JSON.stringify([...existing, ...otherEvs.filter(e => !existingIds.has(e.id))]),
                );
            });
            importedOtherMode = true;
            newEvents = keepEvs;
        }
        const labBelongs = (l: LabResult) => (mode === 'transmasc' ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit));
        const keepLs: LabResult[] = [];
        const otherLs: LabResult[] = [];
        for (const l of newLabs) (labBelongs(l) ? keepLs : otherLs).push(l);
        if (otherLs.length) {
            otherModeWrites.push(() => {
                const existing = readRecords<LabResult>(storage, owner, otherMode, 'lab-results');
                const existingIds = new Set(existing.map(l => l.id));
                forgetTombstones(
                    storage,
                    owner,
                    otherMode,
                    'labResults',
                    otherLs.map(l => l.id),
                    clock(),
                );
                storage.setItem(
                    modeKeyFor(owner, otherMode, 'lab-results'),
                    JSON.stringify([...existing, ...otherLs.filter(l => !existingIds.has(l.id))]),
                );
            });
            importedOtherMode = true;
            newLabs = keepLs;
        }
    }

    if (
        !importedOtherMode &&
        !newEvents.length &&
        !newWeight &&
        !newLabs.length &&
        !newTemplates.length &&
        !newPkParams
    )
        throw new Error('No valid entries');
    if (check) return {};

    otherModeWrites.forEach(write => write());

    const result: ProcessImportedDataResult = {};
    // A replace-import states the whole set for each kind it mentions, so
    // anything it drops is a deletion. Recording it is what stops the next
    // sync from pulling the dropped records straight back out of the cloud.
    if (replaced.events) {
        reconcileReplacementInStorage(storage, owner, mode, 'events', active.events, newEvents, clock());
        result.events = newEvents;
    }
    if (replaced.labResults) {
        reconcileReplacementInStorage(storage, owner, mode, 'labResults', active.labResults, newLabs, clock());
        result.labResults = newLabs;
    }
    if (replaced.doseTemplates) {
        reconcileReplacementInStorage(
            storage,
            owner,
            mode,
            'doseTemplates',
            active.doseTemplates,
            newTemplates,
            clock(),
        );
        result.doseTemplates = newTemplates;
    }
    if (newWeight !== undefined) result.weight = newWeight;
    if (newPkParams !== undefined) result.pkParams = newPkParams;
    return result;
}

/**
 * Merge-style import. Unions by id and never replaces an existing record. The
 * other mode is written through storage; the active mode's new records are
 * returned for the caller to append to React state, matching the hook's
 * original split.
 */
export function mergeImportedDataToStorage(
    parsed: any,
    context: ImportStorageContext,
    { now }: { now?: number } = {},
): MergeImportedDataResult {
    const { storage, owner, mode, active } = context;
    const clock = () => now ?? Date.now();
    const otherMode = otherModeFor(mode);
    let incomingEvents: DoseEvent[] = [];
    let incomingWeight: number | undefined = undefined;
    let incomingLabs: LabResult[] = [];
    let incomingTemplates: DoseTemplate[] = [];
    let mergedOther = 0;

    if (parsed && typeof parsed === 'object' && parsed.modes && typeof parsed.modes === 'object') {
        const modesBlock = parsed.modes as Record<string, any>;
        for (const m of MODE_KEYS) {
            const block = modesBlock[m];
            if (!block || typeof block !== 'object') continue;
            const evs = Array.isArray(block.events) ? sanitizeImportedEvents(block.events) : [];
            const ls = Array.isArray(block.labResults) ? sanitizeImportedLabResults(block.labResults) : [];
            const tmps = Array.isArray(block.doseTemplates) ? sanitizeImportedTemplates(block.doseTemplates) : [];
            if (m === mode) {
                incomingEvents = evs;
                incomingLabs = ls;
                incomingTemplates = tmps;
            } else {
                // Merge into the other mode's storage directly. The historical
                // order was: compute all three id sets, clear all three kinds'
                // tombstones, then write the kinds that gained records.
                const existingEvs = readRecords<DoseEvent>(storage, owner, m, 'events');
                const existingLs = readRecords<LabResult>(storage, owner, m, 'lab-results');
                const existingTmps = readRecords<DoseTemplate>(storage, owner, m, 'dose-templates');
                const evIds = new Set(existingEvs.map(e => e.id));
                const lsIds = new Set(existingLs.map(l => l.id));
                const tmpIds = new Set(existingTmps.map(tm => tm.id));
                const newEvs = evs.filter(e => !evIds.has(e.id));
                const newLs = ls.filter(l => !lsIds.has(l.id));
                const newTmps = tmps.filter(tm => !tmpIds.has(tm.id));
                // An explicit merge is the user asking for these records
                // back, so any tombstone standing in the way goes.
                forgetTombstones(
                    storage,
                    owner,
                    m,
                    'events',
                    evs.map(e => e.id),
                    clock(),
                );
                forgetTombstones(
                    storage,
                    owner,
                    m,
                    'labResults',
                    ls.map(l => l.id),
                    clock(),
                );
                forgetTombstones(
                    storage,
                    owner,
                    m,
                    'doseTemplates',
                    tmps.map(tm => tm.id),
                    clock(),
                );
                if (newEvs.length)
                    storage.setItem(modeKeyFor(owner, m, 'events'), JSON.stringify([...existingEvs, ...newEvs]));
                if (newLs.length)
                    storage.setItem(modeKeyFor(owner, m, 'lab-results'), JSON.stringify([...existingLs, ...newLs]));
                if (newTmps.length)
                    storage.setItem(
                        modeKeyFor(owner, m, 'dose-templates'),
                        JSON.stringify([...existingTmps, ...newTmps]),
                    );
                // Templates are restored, but historically were not counted in
                // the merge total. Preserve that reporting behavior.
                mergedOther += newEvs.length + newLs.length;
            }
        }
        // No finite/upper-bound checks here: the historical merge path accepted
        // any positive numeric weight. Preserved deliberately.
        if (typeof parsed.weight === 'number' && parsed.weight > 0) incomingWeight = parsed.weight;
    } else if (Array.isArray(parsed)) {
        incomingEvents = sanitizeImportedEvents(parsed);
    } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.events)) incomingEvents = sanitizeImportedEvents(parsed.events);
        if (typeof parsed.weight === 'number' && parsed.weight > 0) incomingWeight = parsed.weight;
        if (Array.isArray(parsed.labResults)) incomingLabs = sanitizeImportedLabResults(parsed.labResults);
        if (Array.isArray(parsed.doseTemplates)) incomingTemplates = sanitizeImportedTemplates(parsed.doseTemplates);
    }

    // v1 flat-format safety (merge): siphon wrong-mode events *and labs* into
    // the other mode's store so a transfem backup merged from transmasc mode
    // doesn't contaminate the transmasc record.
    if (!('modes' in (parsed || {}))) {
        const eventBelongs = (e: DoseEvent) =>
            mode === 'transmasc' ? isTestosteroneEster(e.ester) : !isTestosteroneEster(e.ester);
        const keepEvs: DoseEvent[] = [];
        const otherEvs: DoseEvent[] = [];
        for (const e of incomingEvents) (eventBelongs(e) ? keepEvs : otherEvs).push(e);
        if (otherEvs.length) {
            mergedOther += appendOtherModeRecords(storage, owner, otherMode, 'events', 'events', otherEvs, clock());
            incomingEvents = keepEvs;
        }
        const labBelongs = (l: LabResult) => (mode === 'transmasc' ? isT_LabUnit(l.unit) : !isT_LabUnit(l.unit));
        const keepLs: LabResult[] = [];
        const otherLs: LabResult[] = [];
        for (const l of incomingLabs) (labBelongs(l) ? keepLs : otherLs).push(l);
        if (otherLs.length) {
            mergedOther += appendOtherModeRecords(
                storage,
                owner,
                otherMode,
                'labResults',
                'lab-results',
                otherLs,
                clock(),
            );
            incomingLabs = keepLs;
        }
    }

    if (!mergedOther && !incomingEvents.length && !incomingWeight && !incomingLabs.length && !incomingTemplates.length)
        throw new Error('No valid entries');

    const result: MergeImportedDataResult = {
        events: [],
        labResults: [],
        doseTemplates: [],
        mergedCount: mergedOther,
    };

    if (incomingEvents.length > 0) {
        const existingIds = new Set(active.events.map(e => e.id));
        const newOnes = incomingEvents.filter(e => !existingIds.has(e.id));
        result.mergedCount += newOnes.length;
        forgetTombstones(
            storage,
            owner,
            mode,
            'events',
            incomingEvents.map(e => e.id),
            clock(),
        );
        result.events = newOnes;
    }

    if (incomingWeight !== undefined && incomingWeight > active.weight) {
        result.weight = incomingWeight;
    }

    if (incomingLabs.length > 0) {
        const existingIds = new Set(active.labResults.map(r => r.id));
        const newOnes = incomingLabs.filter(r => !existingIds.has(r.id));
        result.mergedCount += newOnes.length;
        forgetTombstones(
            storage,
            owner,
            mode,
            'labResults',
            incomingLabs.map(r => r.id),
            clock(),
        );
        result.labResults = newOnes;
    }

    if (incomingTemplates.length > 0) {
        const existingIds = new Set(active.doseTemplates.map(t => t.id));
        const newOnes = incomingTemplates.filter(t => !existingIds.has(t.id));
        result.mergedCount += newOnes.length;
        forgetTombstones(
            storage,
            owner,
            mode,
            'doseTemplates',
            incomingTemplates.map(t => t.id),
            clock(),
        );
        result.doseTemplates = newOnes;
    }

    return result;
}
