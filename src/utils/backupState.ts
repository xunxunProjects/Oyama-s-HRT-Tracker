import { v4 as uuidv4 } from 'uuid';
import {
    DoseEvent,
    Ester,
    LabResult,
    PKCustomParams,
    Route,
    DOSE_MG_MAX,
    EVENT_TIME_H_MAX,
    EVENT_TIME_H_MIN,
    isLabAssay,
    sanitizePKParams,
    isPlausibleBodyWeightKG,
} from '../../logic';
import { MODE_KEYS, ModeKey, SyncState, Tombstones, pruneTombstones, sanitizeTombstones } from './syncMerge';

/** Minimal storage surface used by the pure backup helpers. */
export interface StorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface DoseTemplate {
    id: string;
    name: string;
    route: Route;
    ester: Ester;
    doseMG: number;
    extras: any;
    createdAt: number;
    /** Epoch ms of the last edit. */
    updatedAt?: number;
}

export interface QuickDose {
    id: string;
    route: Route;
    ester: Ester;
    value: number;
    createdAt: number;
}

export interface ActiveBackupState {
    events: DoseEvent[];
    labResults: LabResult[];
    doseTemplates: DoseTemplate[];
    weight: number;
    pkParams: PKCustomParams | null;
}

export interface ExportPayload {
    meta: { version: 2; exportedAt: string };
    mode: ModeKey;
    weight: number;
    weightUpdatedAt?: number;
    modes: Record<
        ModeKey,
        {
            events: DoseEvent[];
            labResults: LabResult[];
            doseTemplates: DoseTemplate[];
            deletions: Tombstones;
        }
    >;
    events: DoseEvent[];
    labResults: LabResult[];
    doseTemplates: DoseTemplate[];
    pkParams: PKCustomParams | null;
    pkParamsUpdatedAt?: number;
}

export interface AppliedSyncedState {
    active: {
        events: DoseEvent[];
        labResults: LabResult[];
        doseTemplates: DoseTemplate[];
        deletions: Tombstones;
    };
    weight?: number;
    pkParams?: PKCustomParams | null;
}

export const MAX_IMPORT_ENTRIES = 20000;
const DRUG_CODE = /^[A-Za-z0-9_]{1,24}$/;

export const isDrugCode = (v: unknown): v is Ester => typeof v === 'string' && DRUG_CODE.test(v);

/** Carry a record's edit stamp through sanitising; absent or junk becomes undefined. */
export const keepStamp = (raw: any): number | undefined => {
    const n = Number(raw?.updatedAt);
    return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const nsFor = (owner: string, suffix: string): string =>
    owner === 'local' ? `hrt-${suffix}` : `hrt-u${owner}-${suffix}`;

export const modeKeyFor = (owner: string, mode: ModeKey, suffix: string): string =>
    nsFor(owner, mode === 'transmasc' ? `masc-${suffix}` : suffix);

export const loadJSONFromStorage = <T>(storage: StorageLike, key: string, fallback: T): T => {
    try {
        const s = storage.getItem(key);
        return s ? (JSON.parse(s) as T) : fallback;
    } catch {
        return fallback;
    }
};

export const readTombstonesFromStorage = (storage: StorageLike, owner: string, mode: ModeKey): Tombstones =>
    sanitizeTombstones(loadJSONFromStorage<unknown>(storage, modeKeyFor(owner, mode, 'deletions'), null));

export const writeTombstonesToStorage = (
    storage: StorageLike,
    owner: string,
    mode: ModeKey,
    next: Tombstones,
    now = Date.now(),
): void => {
    storage.setItem(modeKeyFor(owner, mode, 'deletions'), JSON.stringify(pruneTombstones(next, now)));
};

export const sanitizeImportedEvents = (raw: any): DoseEvent[] => {
    if (!Array.isArray(raw)) throw new Error('Invalid format');
    if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
    return raw
        .map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { route, timeH, doseMG, ester, extras } = item;
            if (!Object.values(Route).includes(route)) return null;
            const timeNum = Number(timeH);
            // Out-of-range timestamps are dropped rather than clamped: moving a
            // record to a date the user never chose is worse than losing it.
            if (!Number.isFinite(timeNum) || timeNum < EVENT_TIME_H_MIN || timeNum > EVENT_TIME_H_MAX) return null;
            const doseNum = Number(doseMG);
            const validEster = isDrugCode(ester) ? ester : Ester.E2;
            const sanitizedExtras = extras && typeof extras === 'object' ? extras : {};
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                route,
                timeH: timeNum,
                doseMG: Number.isFinite(doseNum) ? Math.min(DOSE_MG_MAX, Math.max(0, doseNum)) : 0,
                ester: validEster,
                extras: sanitizedExtras,
                updatedAt: keepStamp(item),
            } as DoseEvent;
        })
        .filter((item): item is DoseEvent => item !== null);
};

export const sanitizeImportedLabResults = (raw: any): LabResult[] => {
    if (!Array.isArray(raw)) return [];
    if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
    return raw
        .map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { timeH, concValue, unit } = item;
            const timeNum = Number(timeH);
            const valNum = Number(concValue);
            if (!Number.isFinite(timeNum) || !Number.isFinite(valNum)) return null;
            const unitVal =
                unit === 'pg/ml' || unit === 'pmol/l' || unit === 'ng/dl' || unit === 'nmol/l' ? unit : 'pmol/l';
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                timeH: timeNum,
                concValue: valNum,
                unit: unitVal,
                ...(isLabAssay(item.assay) ? { assay: item.assay } : {}),
                updatedAt: keepStamp(item),
            } as LabResult;
        })
        .filter((item): item is LabResult => item !== null);
};

export const sanitizeImportedTemplates = (raw: any): DoseTemplate[] => {
    if (!Array.isArray(raw)) return [];
    if (raw.length > MAX_IMPORT_ENTRIES) throw new Error('Too many entries');
    return raw
        .map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            const { name, route, ester, doseMG, extras, createdAt } = item;
            if (!Object.values(Route).includes(route)) return null;
            if (!isDrugCode(ester)) return null;
            const doseNum = Number(doseMG);
            if (!Number.isFinite(doseNum) || doseNum < 0) return null;
            return {
                id: typeof item.id === 'string' ? item.id : uuidv4(),
                name: typeof name === 'string' ? name : 'Template',
                route,
                ester,
                doseMG: doseNum,
                extras: extras && typeof extras === 'object' ? extras : {},
                createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
                updatedAt: keepStamp(item),
            } as DoseTemplate;
        })
        .filter((item): item is DoseTemplate => item !== null);
};

export const buildExportPayloadFromStorage = (
    storage: StorageLike,
    owner: string,
    activeMode: ModeKey,
    active: ActiveBackupState,
    exportedAt = new Date().toISOString(),
): ExportPayload => {
    const readMode = (m: ModeKey) => ({
        events: loadJSONFromStorage<DoseEvent[]>(storage, modeKeyFor(owner, m, 'events'), []),
        labResults: loadJSONFromStorage<LabResult[]>(storage, modeKeyFor(owner, m, 'lab-results'), []),
        doseTemplates: loadJSONFromStorage<DoseTemplate[]>(storage, modeKeyFor(owner, m, 'dose-templates'), []),
        deletions: readTombstonesFromStorage(storage, owner, m),
    });
    const modes = {
        transfem: readMode('transfem'),
        transmasc: readMode('transmasc'),
    };
    // Overlay current in-memory state for the active mode.
    modes[activeMode] = {
        events: active.events,
        labResults: active.labResults,
        doseTemplates: active.doseTemplates,
        deletions: readTombstonesFromStorage(storage, owner, activeMode),
    };

    return {
        meta: { version: 2, exportedAt },
        mode: activeMode,
        weight: active.weight,
        weightUpdatedAt: Number(storage.getItem(nsFor(owner, 'weight-at'))) || undefined,
        modes,
        // Flat v1-compatible fields mirror the currently active mode.
        events: active.events,
        labResults: active.labResults,
        doseTemplates: active.doseTemplates,
        // Explicitly null when the user cleared them.
        pkParams: active.pkParams ?? null,
        pkParamsUpdatedAt: Number(storage.getItem(nsFor(owner, 'pk-params-at'))) || undefined,
    };
};

/**
 * Sanitise both modes before any writes. Returns the cleaned data and writes
 * the record/tombstone/scalar keys through the supplied storage.
 */
export const applySyncedStateToStorage = (
    storage: StorageLike,
    owner: string,
    activeMode: ModeKey,
    state: SyncState,
    now = Date.now(),
): AppliedSyncedState => {
    const clean = MODE_KEYS.map(m => ({
        m,
        events: sanitizeImportedEvents(state.modes[m].events),
        labResults: sanitizeImportedLabResults(state.modes[m].labResults),
        doseTemplates: sanitizeImportedTemplates(state.modes[m].doseTemplates),
        deletions: sanitizeTombstones(state.modes[m].deletions),
    }));

    for (const block of clean) {
        writeTombstonesToStorage(storage, owner, block.m, block.deletions, now);
        storage.setItem(modeKeyFor(owner, block.m, 'events'), JSON.stringify(block.events));
        storage.setItem(modeKeyFor(owner, block.m, 'lab-results'), JSON.stringify(block.labResults));
        storage.setItem(modeKeyFor(owner, block.m, 'dose-templates'), JSON.stringify(block.doseTemplates));
    }

    const active = clean.find(block => block.m === activeMode);
    if (!active) throw new Error('Active mode missing from synced state');
    const result: AppliedSyncedState = { active };

    if (state.weight !== undefined && isPlausibleBodyWeightKG(state.weight)) {
        result.weight = state.weight;
        storage.setItem(nsFor(owner, 'weight'), String(state.weight));
        if (state.weightUpdatedAt > 0) {
            storage.setItem(nsFor(owner, 'weight-at'), String(state.weightUpdatedAt));
        }
    }
    if (state.pkParams !== undefined) {
        const next = sanitizePKParams(state.pkParams);
        result.pkParams = next;
        if (next) storage.setItem(nsFor(owner, 'pk-params'), JSON.stringify(next));
        else storage.removeItem(nsFor(owner, 'pk-params'));
        if (state.pkParamsUpdatedAt > 0) {
            storage.setItem(nsFor(owner, 'pk-params-at'), String(state.pkParamsUpdatedAt));
        }
    }
    return result;
};
