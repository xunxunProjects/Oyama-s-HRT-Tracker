/**
 * Complete-device backup bundle: an unencrypted, versioned JSON envelope.
 *
 * The website owns only this data layer. It does not encrypt, decrypt, hold
 * keys, or claim that a bundle is a cold-backup encryption format. Encryption
 * and decryption belong to the separate offline Tools workflow.
 *
 * The bundle is deliberately separate from the v2 records export used for cloud
 * sync. It carries the local-only groups (quick doses, supplies, plan),
 * calibration state, and an allowlisted set of portable preferences. Import is
 * merge-only: category-level validation runs before any write, and a category
 * with an unresolved same-id conflict is blocked rather than guessed.
 *
 * A bundle exported while signed in names its account only as a hash
 * (`sourceAccount`), so an import can say whether it came from the account it
 * is going into.
 *
 * A separate Replace action requires a complete bundle, refuses ambiguity, and
 * applies through a crash-recoverable localStorage journal. That is an
 * application-level transaction, not a browser primitive: it restores its
 * snapshot after a crash or a failed write, but it is not a claim of storage
 * atomicity beyond localStorage's own guarantees.
 */
import {
    BODY_WEIGHT_KG_MAX,
    BODY_WEIGHT_KG_MIN,
    DOSE_MG_MAX,
    EVENT_TIME_H_MAX,
    EVENT_TIME_H_MIN,
    Route,
    isLabAssay,
    isDrugCode,
    isPlausibleBodyWeightKG,
    normalizeCalibrationMethod,
    sanitizePKParams,
    type CalibrationHistoryMode,
    type CalibrationMethod,
    type DoseEvent,
    type LabResult,
    type PKCustomParams,
} from '../../logic';
import type { AppTheme } from '../constants';
import type { Lang } from '../i18n/translations';
import {
    PLAN_EVERY_DAYS_MAX,
    PLAN_TIMES_PER_DAY_MAX,
    FREQUENCIES,
    legacyCpaItem,
    normalizePlanItem,
    type PlanItem,
} from './plan';
import { normalizeSupply, type Pack, type Supply } from './regimen';
import { cleanDoseMG } from './cleanDose';
import {
    MAX_IMPORT_ENTRIES,
    loadJSONFromStorage,
    modeKeyFor,
    nsFor,
    readTombstonesFromStorage,
    type DoseTemplate,
    type QuickDose,
    type StorageLike,
} from './backupState';
import {
    MODE_KEYS,
    RECORD_KINDS,
    TOMBSTONE_MAX_PER_KIND,
    TOMBSTONE_TTL_MS,
    emptyTombstones,
    pruneTombstoneMap,
    pruneTombstones,
    type ModeKey,
    type RecordKind,
    type TombstoneMap,
    type Tombstones,
} from './syncMerge';
import { applyReplaceJournal, type ReplaceJournalEntry } from './replaceJournal';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const COMPLETE_BACKUP_FORMAT = 'oyama-hrt-complete-backup';
export const COMPLETE_BACKUP_FORMAT_VERSION = 1;

/** Allowance for a device clock that is a little ahead of the importer. */
export const ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1000;
// The plan's limits live beside the form that enforces them; import keeps the same ceiling.
export { PLAN_EVERY_DAYS_MAX, PLAN_TIMES_PER_DAY_MAX };

/** Shown when a failed write could not be fully rolled back. */
export const PARTIAL_WRITE_MESSAGE = 'Complete backup import failed; partial writes may have occurred.';

export type PortablePreferenceKey =
    'app-theme' | 'hrt-lang' | 'app-show-prediction' | 'app-hide-site-label' | 'hrt-supply-lead-days';

export const PORTABLE_PREFERENCE_KEYS: readonly PortablePreferenceKey[] = [
    'app-theme',
    'hrt-lang',
    'app-show-prediction',
    'app-hide-site-label',
    'hrt-supply-lead-days',
];

/**
 * Only confirmed keys leave the device. `app-auto-backup`, `app-dev-mode`,
 * onboarding/site-notice flags, and every credential stay excluded by
 * construction.
 */
export interface PortablePreferences {
    'app-theme'?: AppTheme;
    'hrt-lang'?: Lang;
    'app-show-prediction'?: boolean;
    'app-hide-site-label'?: boolean;
    'hrt-supply-lead-days'?: number;
}

export interface CompleteBackupMode {
    events?: DoseEvent[];
    labResults?: LabResult[];
    doseTemplates?: DoseTemplate[];
    deletions?: Tombstones;
    quickDoses?: QuickDose[];
    supplies?: Supply[];
    plan?: PlanItem[];
}

export interface CompleteBackupCalibration {
    method: CalibrationMethod;
    historyMode: CalibrationHistoryMode;
}

export interface CompleteBackupBundle {
    format: typeof COMPLETE_BACKUP_FORMAT;
    formatVersion: typeof COMPLETE_BACKUP_FORMAT_VERSION;
    createdAt: string;
    mode: ModeKey;
    /** `completeBackupAccountTag` of the account it was exported from; absent when signed out. */
    sourceAccount?: string;
    modes: Record<ModeKey, CompleteBackupMode>;
    weight?: number;
    weightUpdatedAt?: number;
    /** Missing = the bundle says nothing; null = explicitly cleared. */
    pkParams?: PKCustomParams | null;
    pkParamsUpdatedAt?: number;
    calibration: CompleteBackupCalibration;
    preferences: PortablePreferences;
}

export interface CompleteBackupActive {
    events: DoseEvent[];
    labResults: LabResult[];
    doseTemplates: DoseTemplate[];
    quickDoses: QuickDose[];
    supplies: Supply[];
    plan: PlanItem[];
    weight: number;
    pkParams: PKCustomParams | null;
    calibrationMethod: CalibrationMethod;
    calibrationHistoryMode: CalibrationHistoryMode;
}

export interface CompleteBackupContext {
    storage: StorageLike;
    owner: string;
    mode: ModeKey;
    active: CompleteBackupActive;
    /** Injection point for tests; defaults to Date.now(). */
    now?: number;
}

export type BundleCategory =
    'events' | 'labResults' | 'doseTemplates' | 'deletions' | 'quickDoses' | 'supplies' | 'plan';

export interface BundleCounts {
    events: number;
    labResults: number;
    doseTemplates: number;
    deletions: number;
    quickDoses: number;
    supplies: number;
    plan: number;
}

export type ScalarPreviewAction = 'added' | 'updated' | 'skipped' | 'unchanged' | 'conflict' | 'blocked';

export interface ScalarPreview<T> {
    action: ScalarPreviewAction;
    current?: T;
    incoming: T;
}

export interface CompleteBackupScalarsPreview {
    weight?: ScalarPreview<number>;
    pkParams?: ScalarPreview<PKCustomParams | null>;
    calibration?: {
        action: 'unchanged' | 'overwrite' | 'blocked';
        current: CompleteBackupCalibration;
        incoming: CompleteBackupCalibration;
    };
}

/** What an incoming tombstone will do to local records, per record kind. */
export interface CompleteBackupDeletionImpact {
    mode: ModeKey;
    kind: RecordKind;
    /** Tombstone entries the file contained, before bounds were applied. */
    incoming: number;
    /** Entries retained after clock-skew, TTL and cap checks. */
    accepted: number;
    /** Local records that would be removed by an accepted tombstone. */
    removedLocal: number;
    removedIds: string[];
    /** Local records kept because their updatedAt is newer than the tombstone. */
    protectedIds: string[];
    /** Incoming entries rejected (clock skew, TTL, cap, or newer local record). */
    droppedIds: string[];
}

/**
 * Whether a file was exported from the account it is going into. `unknown`
 * when the file names no account (made signed out, or by an older version) or
 * this device is signed out.
 */
export type CompleteBackupAccountMatch = 'same' | 'other' | 'unknown';

export interface CompleteBackupPreview {
    /** False only when the envelope itself cannot be read. */
    ok: boolean;
    errors: string[];
    formatVersion?: number;
    createdAt?: string;
    sourceMode?: ModeKey;
    currentMode: ModeKey;
    /**
     * The account whose storage this preview targets. Two previews of the same
     * file against different accounts are not interchangeable.
     */
    targetOwner: string;
    account: CompleteBackupAccountMatch;
    counts: Record<ModeKey, BundleCounts>;
    /** Category paths the file does not mention at all. */
    missing: string[];
    /** Category paths that will not be written. */
    blocked: string[];
    issues: string[];
    conflicts: string[];
    stats: { added: number; updated: number; skipped: number; removed: number };
    preferences: {
        values: PortablePreferences;
        ignored: string[];
        invalid: string[];
    };
    calibration?: CompleteBackupCalibration;
    weight?: number;
    weightUpdatedAt?: number;
    pkParams?: PKCustomParams | null;
    pkParamsUpdatedAt?: number;
    /** Per-kind deletion effect, including ids, shown before confirmation. */
    deletionImpact: CompleteBackupDeletionImpact[];
    /** How scalar LWW fields will resolve, including equal-time conflicts. */
    scalars: CompleteBackupScalarsPreview;
}

export interface CompleteBackupMergeResult {
    applied: string[];
    blocked: string[];
    skipped: string[];
    added: number;
    updated: number;
    /** Local records removed by an accepted incoming tombstone. */
    removed: number;
    /** Merged arrays for each mode; only applied categories are present. */
    modes: Partial<Record<ModeKey, CompleteBackupMode>>;
    weight?: number;
    /** Present only when the bundle supplied a value; null means cleared. */
    pkParams?: PKCustomParams | null;
    calibration?: CompleteBackupCalibration;
    /** Allowlisted values only. The caller applies them to React state. */
    preferences: PortablePreferences;
}

export type CompleteBackupOutcome = 'applied' | 'settings-only' | 'nothing';

/**
 * What the UI should report after a merge attempt. Preferences are real data
 * even when every record category was blocked, but they are not a record
 * merge; "nothing" means no category, scalar, or preference was applied.
 */
export function classifyCompleteBackupOutcome(result: CompleteBackupMergeResult): CompleteBackupOutcome {
    if (
        result.applied.length > 0 ||
        result.weight !== undefined ||
        result.pkParams !== undefined ||
        result.calibration !== undefined
    ) {
        return 'applied';
    }
    if (Object.keys(result.preferences).length > 0) return 'settings-only';
    return 'nothing';
}

interface Validation<T> {
    value?: T;
    error?: string;
}

const ARRAY_CATEGORIES = ['events', 'labResults', 'doseTemplates', 'quickDoses', 'supplies', 'plan'] as const;
type ArrayCategory = (typeof ARRAY_CATEGORIES)[number];

const CATEGORY_SUFFIX: Record<ArrayCategory, string> = {
    events: 'events',
    labResults: 'lab-results',
    doseTemplates: 'dose-templates',
    quickDoses: 'quick-doses',
    supplies: 'supplies',
    plan: 'plan',
};

const STAMPED_CATEGORIES: ReadonlySet<ArrayCategory> = new Set(['events', 'labResults', 'doseTemplates']);

const KIND_CATEGORY: Record<RecordKind, ArrayCategory> = {
    events: 'events',
    labResults: 'labResults',
    doseTemplates: 'doseTemplates',
};

const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isRoute = (value: unknown): value is Route =>
    typeof value === 'string' && (Object.values(Route) as string[]).includes(value);

/**
 * Names that would collide with `Object.prototype` on a plain-object map.
 * Record ids are rejected outright; tombstone maps use null-prototype objects
 * and `Object.hasOwn`, so even a stray local value cannot inherit a timestamp.
 */
const FORBIDDEN_IDS: ReadonlySet<string> = new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']);

const isRecordId = (value: unknown): value is string =>
    typeof value === 'string' && value !== '' && !FORBIDDEN_IDS.has(value);

const hasOwn = (record: object, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

const ACCOUNT_TAG = /^[0-9a-f]{64}$/;

/**
 * How a bundle names the account it came from without holding the account's
 * id or username: a SHA-256 of the id under this format's name. It is only
 * compared with the importing account's own tag, to catch the wrong file; it
 * is not a signature and proves nothing about who wrote the file.
 */
export const completeBackupAccountTag = (owner: string): string | undefined =>
    owner === 'local' ? undefined : bytesToHex(sha256(utf8ToBytes(`${COMPLETE_BACKUP_FORMAT}/account/${owner}`)));

const nullMap = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

const isStamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

const readStamp = (value: unknown, now?: number): Validation<number> => {
    if (value === undefined || value === null) return {};
    if (!isStamp(value)) return { error: 'updatedAt must be a positive finite number' };
    if (now !== undefined && value > now + ALLOWED_CLOCK_SKEW_MS) {
        return { error: 'updatedAt is in the future beyond the allowed clock skew' };
    }
    return { value };
};

/** What normalizeSyncState gives a weight or PK value that has no stamp. */
const UNSTAMPED_SCALAR_AT = 1;

const readStampString = (value: string | null): number | undefined => {
    if (value === null || value.trim() === '') return undefined;
    const n = Number(value);
    return isStamp(n) ? n : undefined;
};

const isIsoDate = (value: unknown): value is string =>
    typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));

const isAppTheme = (value: unknown): value is AppTheme =>
    value === 'light' || value === 'dark' || value === 'system' || value === 'mono';

const isLang = (value: unknown): value is Lang =>
    value === 'zh' ||
    value === 'zh-TW' ||
    value === 'yue' ||
    value === 'en' ||
    value === 'ja' ||
    value === 'ko' ||
    value === 'tr';

const isCalibrationMethodValue = (value: unknown): value is CalibrationMethod =>
    value === 'off' || value === 'ekf' || value === 'ou_kalman' || value === 'mipd';

const isCalibrationHistoryMode = (value: unknown): value is CalibrationHistoryMode =>
    value === 'forward' || value === 'retrospective';

/**
 * A deterministic JSON form for "same timestamp, same content?" checks, so
 * object key order from another device does not look like an edit.
 */
const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (isObject(value)) {
        return `{${Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
};

const recordStamp = (record: unknown): number | undefined => {
    if (!isObject(record)) return undefined;
    return readStamp(record.updatedAt).value;
};

// --- Record validators ------------------------------------------------------

const validateEvent = (raw: unknown, path: string, now?: number): Validation<DoseEvent> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (!isRoute(raw.route)) return { error: `${path}: unknown route` };
    const timeH = raw.timeH;
    if (!isFiniteNumber(timeH) || timeH < EVENT_TIME_H_MIN || timeH > EVENT_TIME_H_MAX)
        return { error: `${path}: timeH is outside the accepted range` };
    if (!isFiniteNumber(raw.doseMG) || raw.doseMG < 0 || raw.doseMG > DOSE_MG_MAX)
        return { error: `${path}: doseMG is invalid` };
    if (!isDrugCode(raw.ester)) return { error: `${path}: ester must be a drug code` };
    const extras = raw.extras === undefined || raw.extras === null ? {} : raw.extras;
    if (!isObject(extras)) return { error: `${path}: extras must be an object` };
    const stamp = readStamp(raw.updatedAt, now);
    if (stamp.error) return { error: `${path}: ${stamp.error}` };
    const value: DoseEvent = {
        id: raw.id,
        route: raw.route,
        timeH,
        doseMG: cleanDoseMG(raw.doseMG),
        ester: raw.ester,
        extras: extras as DoseEvent['extras'],
    };
    if (stamp.value !== undefined) value.updatedAt = stamp.value;
    return { value };
};

const validateLabResult = (raw: unknown, path: string, now?: number): Validation<LabResult> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (!isFiniteNumber(raw.timeH)) return { error: `${path}: timeH must be finite` };
    if (!isFiniteNumber(raw.concValue)) return { error: `${path}: concValue must be finite` };
    if (raw.unit !== 'pg/ml' && raw.unit !== 'pmol/l' && raw.unit !== 'ng/dl' && raw.unit !== 'nmol/l')
        return { error: `${path}: unknown lab unit` };
    if (raw.assay !== undefined && raw.assay !== null && !isLabAssay(raw.assay))
        return { error: `${path}: unknown lab assay` };
    const stamp = readStamp(raw.updatedAt, now);
    if (stamp.error) return { error: `${path}: ${stamp.error}` };
    const value: LabResult = {
        id: raw.id,
        timeH: raw.timeH,
        concValue: raw.concValue,
        unit: raw.unit,
    };
    if (raw.assay !== undefined && raw.assay !== null && isLabAssay(raw.assay)) value.assay = raw.assay;
    if (stamp.value !== undefined) value.updatedAt = stamp.value;
    return { value };
};

const validateTemplate = (raw: unknown, path: string, now?: number): Validation<DoseTemplate> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (typeof raw.name !== 'string') return { error: `${path}: name must be a string` };
    if (!isRoute(raw.route)) return { error: `${path}: unknown route` };
    if (!isDrugCode(raw.ester)) return { error: `${path}: ester must be a drug code` };
    if (!isFiniteNumber(raw.doseMG) || raw.doseMG < 0) return { error: `${path}: doseMG is invalid` };
    const extras = raw.extras === undefined || raw.extras === null ? {} : raw.extras;
    if (!isObject(extras)) return { error: `${path}: extras must be an object` };
    if (!isFiniteNumber(raw.createdAt)) return { error: `${path}: createdAt must be finite` };
    const stamp = readStamp(raw.updatedAt, now);
    if (stamp.error) return { error: `${path}: ${stamp.error}` };
    const value: DoseTemplate = {
        id: raw.id,
        name: raw.name,
        route: raw.route,
        ester: raw.ester,
        doseMG: cleanDoseMG(raw.doseMG),
        extras,
        createdAt: raw.createdAt,
    };
    if (stamp.value !== undefined) value.updatedAt = stamp.value;
    return { value };
};

const validateQuickDose = (raw: unknown, path: string): Validation<QuickDose> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (!isRoute(raw.route)) return { error: `${path}: unknown route` };
    if (!isDrugCode(raw.ester)) return { error: `${path}: ester must be a drug code` };
    if (!isFiniteNumber(raw.value)) return { error: `${path}: value must be finite` };
    if (!isFiniteNumber(raw.createdAt)) return { error: `${path}: createdAt must be finite` };
    return {
        value: {
            id: raw.id,
            route: raw.route,
            ester: raw.ester,
            value: raw.value,
            createdAt: raw.createdAt,
        },
    };
};

/** The production Pack object union. A string pack is never accepted. */
const validatePack = (raw: unknown, path: string): Validation<Pack> => {
    if (!isObject(raw)) return { error: `${path}: pack must be an object, not a string` };
    switch (raw.kind) {
        case 'vial':
            if (!isFiniteNumber(raw.ml) || raw.ml <= 0 || !isFiniteNumber(raw.mgPerMl) || raw.mgPerMl <= 0)
                return { error: `${path}: vial needs positive ml and mgPerMl` };
            return { value: { kind: 'vial', ml: raw.ml, mgPerMl: raw.mgPerMl } };
        case 'pill':
            if (!isFiniteNumber(raw.mg) || raw.mg <= 0) return { error: `${path}: pill needs a positive mg` };
            return { value: { kind: 'pill', mg: raw.mg } };
        case 'pump':
            if (!isFiniteNumber(raw.mg) || raw.mg <= 0) return { error: `${path}: pump needs a positive mg` };
            return { value: { kind: 'pump', mg: raw.mg } };
        case 'sachet':
            if (!isFiniteNumber(raw.mg) || raw.mg <= 0) return { error: `${path}: sachet needs a positive mg` };
            return { value: { kind: 'sachet', mg: raw.mg } };
        case 'patch':
            return { value: { kind: 'patch' } };
        case 'bulk':
            return { value: { kind: 'bulk' } };
        default:
            return { error: `${path}: unknown pack kind` };
    }
};

const validateSupply = (raw: unknown, path: string): Validation<Supply> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (!isRoute(raw.route)) return { error: `${path}: unknown route` };
    if (!isDrugCode(raw.ester)) return { error: `${path}: ester must be a drug code` };
    const pack = validatePack(raw.pack, `${path}.pack`);
    if (pack.value === undefined) return { error: pack.error ?? `${path}: invalid pack` };
    if (!isFiniteNumber(raw.count) || raw.count < 0) return { error: `${path}: count must be finite and >= 0` };
    if (!isFiniteNumber(raw.startedAt) || raw.startedAt <= 0)
        return { error: `${path}: startedAt must be a positive finite epoch-ms` };
    return {
        value: {
            id: raw.id,
            route: raw.route,
            ester: raw.ester,
            pack: pack.value,
            count: raw.count,
            startedAt: raw.startedAt,
        },
    };
};

const validatePlan = (raw: unknown, path: string): Validation<PlanItem> => {
    if (!isObject(raw)) return { error: `${path}: record must be an object` };
    if (!isRecordId(raw.id)) return { error: `${path}: id must be a non-empty string and not a prototype name` };
    if (!isRoute(raw.route)) return { error: `${path}: unknown route` };
    if (!isDrugCode(raw.ester)) return { error: `${path}: ester must be a drug code` };
    if (!isFiniteNumber(raw.doseMG) || raw.doseMG < 0) return { error: `${path}: doseMG must be finite and >= 0` };
    const extras = raw.extras === undefined || raw.extras === null ? {} : raw.extras;
    if (!isObject(extras)) return { error: `${path}: extras must be an object` };
    const everyDays = raw.everyDays;
    // Whole days only, apart from the 3.5-day patch preset: planStatus counts
    // calendar days while regimensFromPlan counts hours.
    const presetDays = FREQUENCIES.some(f => f.everyDays === everyDays);
    if (
        !isFiniteNumber(everyDays) ||
        everyDays < 1 ||
        everyDays > PLAN_EVERY_DAYS_MAX ||
        (!Number.isInteger(everyDays) && !presetDays)
    ) {
        return { error: `${path}: everyDays must be whole days between 1 and ${PLAN_EVERY_DAYS_MAX}` };
    }
    if (!isFiniteNumber(raw.timesPerDay) || !Number.isInteger(raw.timesPerDay) || raw.timesPerDay < 1) {
        return { error: `${path}: timesPerDay must be a whole number >= 1` };
    }
    const timesPerDay = raw.timesPerDay;
    if (timesPerDay > PLAN_TIMES_PER_DAY_MAX) {
        return { error: `${path}: timesPerDay must be between 1 and ${PLAN_TIMES_PER_DAY_MAX}` };
    }
    return {
        value: {
            id: raw.id,
            route: raw.route,
            ester: raw.ester,
            doseMG: raw.doseMG,
            extras: extras as PlanItem['extras'],
            everyDays,
            timesPerDay: everyDays > 1 ? 1 : timesPerDay,
        },
    };
};

// The table deliberately erases each validator's concrete record type; the
// category key is what keeps the arrays separated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VALIDATORS: Record<ArrayCategory, (raw: unknown, path: string, now?: number) => Validation<any>> = {
    events: validateEvent,
    labResults: validateLabResult,
    doseTemplates: validateTemplate,
    quickDoses: validateQuickDose,
    supplies: validateSupply,
    plan: validatePlan,
};

const validateArray = <T>(
    raw: unknown,
    path: string,
    validator: (value: unknown, path: string, now?: number) => Validation<T>,
    now?: number,
): { values: T[]; errors: string[] } => {
    if (!Array.isArray(raw)) return { values: [], errors: [`${path} must be an array`] };
    if (raw.length > MAX_IMPORT_ENTRIES) {
        return { values: [], errors: [`${path} exceeds the ${MAX_IMPORT_ENTRIES}-entry import limit`] };
    }
    const values: T[] = [];
    const errors: string[] = [];
    raw.forEach((item, index) => {
        const result = validator(item, `${path}[${index}]`, now);
        if (result.value !== undefined) values.push(result.value);
        else errors.push(result.error ?? `${path}[${index}]: invalid record`);
    });
    return { values, errors };
};

interface TombstoneDrops {
    future: string[];
    expired: string[];
    overCap: string[];
}

/** UI/report form for id lists: at most five ids, then "+N more". */
export const formatIds = (ids: string[]): string => {
    const shown = ids.slice(0, 5).join(', ');
    return ids.length > 5 ? `${shown}, +${ids.length - 5} more` : shown;
};

const validateTombstoneMap = (
    raw: unknown,
    path: string,
    now: number,
): { value: Record<string, number>; errors: string[]; drops: TombstoneDrops; notes: string[] } => {
    const drops: TombstoneDrops = { future: [], expired: [], overCap: [] };
    const notes: string[] = [];
    if (raw === undefined || raw === null) return { value: {}, errors: [], drops, notes };
    if (!isObject(raw)) return { value: {}, errors: [`${path} must be an object`], drops, notes };
    const live: [string, number][] = [];
    const errors: string[] = [];
    for (const [id, at] of Object.entries(raw)) {
        if (id === '') errors.push(`${path}: tombstone id must not be empty`);
        else if (FORBIDDEN_IDS.has(id)) errors.push(`${path}: tombstone id ${id} is not allowed`);
        else if (!isStamp(at)) errors.push(`${path}.${id}: tombstone time must be a positive finite number`);
        else if (at > now + ALLOWED_CLOCK_SKEW_MS) drops.future.push(id);
        else if (now - at >= TOMBSTONE_TTL_MS) drops.expired.push(id);
        else live.push([id, at]);
    }
    if (live.length > TOMBSTONE_MAX_PER_KIND) {
        live.sort((a, b) => b[1] - a[1]);
        drops.overCap = live.slice(TOMBSTONE_MAX_PER_KIND).map(([id]) => id);
        live.length = TOMBSTONE_MAX_PER_KIND;
    }
    if (drops.future.length) {
        notes.push(
            `${path}: dropped ${drops.future.length} tombstone(s) newer than the allowed clock skew (${formatIds(
                drops.future,
            )})`,
        );
    }
    if (drops.expired.length) {
        notes.push(
            `${path}: dropped ${drops.expired.length} tombstone(s) older than the 180-day TTL (${formatIds(
                drops.expired,
            )})`,
        );
    }
    if (drops.overCap.length) {
        notes.push(
            `${path}: dropped ${drops.overCap.length} tombstone(s) above the ${TOMBSTONE_MAX_PER_KIND}-per-kind cap (${formatIds(
                drops.overCap,
            )})`,
        );
    }
    return { value: Object.fromEntries(live), errors, drops, notes };
};

const validateTombstones = (
    raw: unknown,
    path: string,
    now: number,
): {
    value: Tombstones;
    errors: string[];
    drops: Record<RecordKind, TombstoneDrops>;
    notes: string[];
} => {
    if (raw === undefined || raw === null) {
        return {
            value: emptyTombstones(),
            errors: [],
            drops: {
                events: { future: [], expired: [], overCap: [] },
                labResults: { future: [], expired: [], overCap: [] },
                doseTemplates: { future: [], expired: [], overCap: [] },
            },
            notes: [],
        };
    }
    if (!isObject(raw)) {
        return {
            value: emptyTombstones(),
            errors: [`${path} must be an object`],
            drops: {
                events: { future: [], expired: [], overCap: [] },
                labResults: { future: [], expired: [], overCap: [] },
                doseTemplates: { future: [], expired: [], overCap: [] },
            },
            notes: [],
        };
    }
    const events = validateTombstoneMap(raw.events, `${path}.events`, now);
    const labResults = validateTombstoneMap(raw.labResults, `${path}.labResults`, now);
    const doseTemplates = validateTombstoneMap(raw.doseTemplates, `${path}.doseTemplates`, now);
    return {
        value: { events: events.value, labResults: labResults.value, doseTemplates: doseTemplates.value },
        errors: [...events.errors, ...labResults.errors, ...doseTemplates.errors],
        drops: { events: events.drops, labResults: labResults.drops, doseTemplates: doseTemplates.drops },
        notes: [...events.notes, ...labResults.notes, ...doseTemplates.notes],
    };
};

/**
 * Local storage is less trustworthy than a validated bundle. Drop empty and
 * prototype-named ids before any lookup, and copy into null-prototype maps so
 * an id inherited from `Object.prototype` can never be mistaken for a
 * tombstone.
 */
const readLocalTombstones = (storage: StorageLike, owner: string, mode: ModeKey): Tombstones => {
    const raw = readTombstonesFromStorage(storage, owner, mode);
    const clean = (map: TombstoneMap): TombstoneMap => {
        const out = nullMap<number>();
        for (const [id, at] of Object.entries(map)) {
            if (id !== '' && !FORBIDDEN_IDS.has(id) && isStamp(at)) out[id] = at;
        }
        return out;
    };
    return {
        events: clean(raw.events),
        labResults: clean(raw.labResults),
        doseTemplates: clean(raw.doseTemplates),
    };
};

const validateCalibration = (raw: unknown): { value?: CompleteBackupCalibration; errors: string[] } => {
    if (!isObject(raw)) return { errors: ['calibration must be an object'] };
    const errors: string[] = [];
    let method: CalibrationMethod | undefined;
    if (raw.method === 'average' || raw.method === 'adaptive' || isCalibrationMethodValue(raw.method)) {
        method = normalizeCalibrationMethod(raw.method as string);
    } else {
        errors.push('calibration.method is invalid');
    }
    let historyMode: CalibrationHistoryMode | undefined;
    if (isCalibrationHistoryMode(raw.historyMode)) historyMode = raw.historyMode;
    else errors.push('calibration.historyMode is invalid');
    if (!method || !historyMode) return { errors };
    return { value: { method, historyMode }, errors };
};

export function sanitizePortablePreferences(raw: unknown): {
    values: PortablePreferences;
    ignored: string[];
    invalid: string[];
} {
    const values: PortablePreferences = {};
    const ignored: string[] = [];
    const invalid: string[] = [];
    if (raw === undefined || raw === null) return { values, ignored, invalid };
    if (!isObject(raw)) {
        invalid.push('preferences');
        return { values, ignored, invalid };
    }
    for (const [key, value] of Object.entries(raw)) {
        switch (key) {
            case 'app-theme':
                if (isAppTheme(value)) values['app-theme'] = value;
                else invalid.push(key);
                break;
            case 'hrt-lang':
                if (isLang(value)) values['hrt-lang'] = value;
                else invalid.push(key);
                break;
            case 'app-show-prediction':
                if (typeof value === 'boolean') values['app-show-prediction'] = value;
                else invalid.push(key);
                break;
            case 'app-hide-site-label':
                if (typeof value === 'boolean') values['app-hide-site-label'] = value;
                else invalid.push(key);
                break;
            case 'hrt-supply-lead-days':
                if (isFiniteNumber(value) && value > 0 && value <= 3650) values['hrt-supply-lead-days'] = value;
                else invalid.push(key);
                break;
            default:
                // Unconfirmed, device-local, behavioural, and credential keys are
                // reported but never applied.
                ignored.push(key);
                break;
        }
    }
    return { values, ignored, invalid };
}

export function readPortablePreferences(storage: StorageLike): PortablePreferences {
    const values: PortablePreferences = {};
    const theme = storage.getItem('app-theme');
    if (isAppTheme(theme)) values['app-theme'] = theme;
    const lang = storage.getItem('hrt-lang');
    if (isLang(lang)) values['hrt-lang'] = lang;
    const prediction = storage.getItem('app-show-prediction');
    if (prediction === 'true' || prediction === 'false') values['app-show-prediction'] = prediction === 'true';
    const hideSiteLabel = storage.getItem('app-hide-site-label');
    if (hideSiteLabel === 'true' || hideSiteLabel === 'false') values['app-hide-site-label'] = hideSiteLabel === 'true';
    const leadDays = storage.getItem('hrt-supply-lead-days');
    if (leadDays !== null) {
        const n = Number(leadDays);
        if (isFiniteNumber(n) && n > 0 && n <= 3650) values['hrt-supply-lead-days'] = n;
    }
    return values;
}

export class CompleteBackupExportError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
        super(issues.join('; '));
        this.name = 'CompleteBackupExportError';
        this.issues = issues;
    }
}

export interface CompleteBackupExportReport {
    bundle: CompleteBackupBundle;
    /** Invalid records or stamps dropped, duplicate ids collapsed, tombstone bounds. */
    issues: string[];
    /** Records present in storage but absent from the bundle. */
    droppedRecords: number;
    /** The part of droppedRecords that failed validation, not a collapsed duplicate. */
    invalidRecords: number;
    duplicateIds: string[];
}

interface CleanExportRecords<T> {
    values: T[];
    issues: string[];
    droppedRecords: number;
    invalidRecords: number;
    duplicateIds: string[];
}

/**
 * Apply the same entry limit, id uniqueness and future-stamp bound the importer
 * uses. Invalid records are dropped with a report; duplicate ids are collapsed
 * to the newest copy (last copy when stamps are unavailable) so the exported
 * bundle cannot be rejected by this same importer.
 */
const cleanExportRecords = <T>(
    items: unknown,
    path: string,
    validator: (value: unknown, path: string, now?: number) => Validation<T>,
    now: number,
): CleanExportRecords<T> => {
    if (!Array.isArray(items)) {
        return {
            values: [],
            issues: [`${path}: expected an array`],
            droppedRecords: 0,
            invalidRecords: 0,
            duplicateIds: [],
        };
    }
    if (items.length > MAX_IMPORT_ENTRIES) {
        throw new CompleteBackupExportError([
            `${path}: ${items.length} entries exceeds the ${MAX_IMPORT_ENTRIES}-entry export limit`,
        ]);
    }
    const issues: string[] = [];
    const valid: { record: T; index: number }[] = [];
    items.forEach((item, index) => {
        const result = validator(item, `${path}[${index}]`, now);
        if (result.value !== undefined) valid.push({ record: result.value, index });
        else issues.push(result.error ?? `${path}[${index}]: invalid record`);
    });

    const byId = new Map<string, { record: T; index: number }>();
    const duplicateIds = new Set<string>();
    for (const entry of valid) {
        const id = (entry.record as unknown as { id: string }).id;
        const existing = byId.get(id);
        if (!existing) {
            byId.set(id, entry);
            continue;
        }
        duplicateIds.add(id);
        const existingStamp = recordStamp(existing.record);
        const incomingStamp = recordStamp(entry.record);
        if (existingStamp === undefined || incomingStamp === undefined || incomingStamp >= existingStamp) {
            byId.set(id, entry);
        }
    }
    const values = [...byId.values()].sort((a, b) => a.index - b.index).map(entry => entry.record);
    if (values.length > MAX_IMPORT_ENTRIES) {
        throw new CompleteBackupExportError([
            `${path}: ${values.length} unique entries exceeds the ${MAX_IMPORT_ENTRIES}-entry export limit`,
        ]);
    }
    const duplicates = [...duplicateIds];
    if (duplicates.length) issues.push(`${path}: collapsed duplicate id(s) ${formatIds(duplicates)}`);
    const invalidRecords = items.length - valid.length;
    if (invalidRecords > 0) issues.push(`${path}: dropped ${invalidRecords} invalid record(s)`);
    const droppedRecords = items.length - values.length;
    return { values, issues, droppedRecords, invalidRecords, duplicateIds: duplicates };
};

const cleanExportTombstoneMap = (raw: TombstoneMap, path: string, now: number, issues: string[]): TombstoneMap => {
    const live: [string, number][] = [];
    const future: string[] = [];
    const expired: string[] = [];
    const invalid: string[] = [];
    for (const [id, at] of Object.entries(raw)) {
        if (id === '' || FORBIDDEN_IDS.has(id) || !isStamp(at)) {
            invalid.push(id || '(empty)');
            continue;
        }
        if (at > now + ALLOWED_CLOCK_SKEW_MS) future.push(id);
        else if (now - at >= TOMBSTONE_TTL_MS) expired.push(id);
        else live.push([id, at]);
    }
    if (invalid.length) issues.push(`${path}: dropped invalid tombstone id(s) ${formatIds(invalid)}`);
    if (future.length) issues.push(`${path}: dropped ${future.length} tombstone(s) newer than the allowed clock skew`);
    if (expired.length) issues.push(`${path}: dropped ${expired.length} tombstone(s) older than the 180-day TTL`);
    if (live.length > TOMBSTONE_MAX_PER_KIND) {
        live.sort((a, b) => b[1] - a[1]);
        const overCap = live.slice(TOMBSTONE_MAX_PER_KIND).map(([id]) => id);
        live.length = TOMBSTONE_MAX_PER_KIND;
        issues.push(`${path}: dropped ${overCap.length} tombstone(s) above the ${TOMBSTONE_MAX_PER_KIND}-per-kind cap`);
    }
    return Object.fromEntries(live);
};

const cleanExportTombstones = (raw: Tombstones, path: string, now: number, issues: string[]): Tombstones => ({
    events: cleanExportTombstoneMap(raw.events, `${path}.events`, now, issues),
    labResults: cleanExportTombstoneMap(raw.labResults, `${path}.labResults`, now, issues),
    doseTemplates: cleanExportTombstoneMap(raw.doseTemplates, `${path}.doseTemplates`, now, issues),
});

const readBoundedStampString = (
    value: string | null,
    path: string,
    now: number,
    issues: string[],
): number | undefined => {
    const stamp = readStampString(value);
    if (stamp === undefined) return undefined;
    if (stamp > now + ALLOWED_CLOCK_SKEW_MS) {
        issues.push(`${path}: dropped timestamp in the future beyond the allowed clock skew`);
        return undefined;
    }
    return stamp;
};

/**
 * A mode the app is not showing, read the way the app would load it: supplies
 * saved before packs existed are upgraded, and cyproterone's old standalone
 * choice counts as the feminizing plan. Read raw, those would be left out of
 * the backup although the app shows them once the person switches modes.
 */
const readInactiveCategory = (storage: StorageLike, owner: string, mode: ModeKey, category: ArrayCategory): unknown => {
    const key = modeKeyFor(owner, mode, CATEGORY_SUFFIX[category]);
    if (category === 'plan' && mode === 'transfem' && storage.getItem(key) === null) {
        const cpa = legacyCpaItem(storage.getItem(nsFor(owner, 'cpa-plan')));
        if (cpa) return [cpa];
    }
    const raw = loadJSONFromStorage<unknown>(storage, key, []);
    if (!Array.isArray(raw)) return raw;
    // Anything the loader can't read is kept as it is, so the export report
    // still counts it as left out.
    if (category === 'supplies') return raw.map(item => normalizeSupply(item) ?? item);
    if (category === 'plan') return raw.map(item => normalizePlanItem(item) ?? item);
    return raw;
};

/**
 * Build a complete bundle from the current store, overlaying the active mode's
 * in-memory arrays (which can be newer than the persisted copy). The report
 * lists every record or stamp that could not be exported.
 */
export function buildCompleteBackupBundleReportFromStorage(
    storage: StorageLike,
    owner: string,
    activeMode: ModeKey,
    active: CompleteBackupActive,
    createdAt = new Date().toISOString(),
    now = Date.now(),
): CompleteBackupExportReport {
    const activeArrays: Record<ArrayCategory, unknown> = {
        events: active.events,
        labResults: active.labResults,
        doseTemplates: active.doseTemplates,
        quickDoses: active.quickDoses,
        supplies: active.supplies,
        plan: active.plan,
    };
    const envelopeIssues: string[] = [];
    if (!isIsoDate(createdAt)) envelopeIssues.push('createdAt must be an ISO date string');
    if (!isCalibrationMethodValue(active.calibrationMethod)) envelopeIssues.push('calibration.method is invalid');
    if (!isCalibrationHistoryMode(active.calibrationHistoryMode)) {
        envelopeIssues.push('calibration.historyMode is invalid');
    }
    if (envelopeIssues.length) throw new CompleteBackupExportError(envelopeIssues);

    const issues: string[] = [];
    const duplicateIds = new Set<string>();
    let droppedRecords = 0;
    let invalidRecords = 0;

    const readMode = (mode: ModeKey): CompleteBackupMode => {
        const block: CompleteBackupMode = {};
        for (const category of ARRAY_CATEGORIES) {
            const path = `${mode}.${category}`;
            const raw =
                mode === activeMode ? activeArrays[category] : readInactiveCategory(storage, owner, mode, category);
            const cleaned = cleanExportRecords(raw, path, VALIDATORS[category], now);
            block[category] = cleaned.values;
            issues.push(...cleaned.issues);
            droppedRecords += cleaned.droppedRecords;
            invalidRecords += cleaned.invalidRecords;
            cleaned.duplicateIds.forEach(id => duplicateIds.add(id));
        }
        block.deletions = cleanExportTombstones(
            readLocalTombstones(storage, owner, mode),
            `${mode}.deletions`,
            now,
            issues,
        );
        return block;
    };

    const weightKey = nsFor(owner, 'weight');
    const weightUpdatedAt = readBoundedStampString(
        storage.getItem(nsFor(owner, 'weight-at')),
        'weightUpdatedAt',
        now,
        issues,
    );
    const weight =
        storage.getItem(weightKey) !== null && isPlausibleBodyWeightKG(active.weight) ? active.weight : undefined;

    const pkKey = nsFor(owner, 'pk-params');
    const pkUpdatedAt = readBoundedStampString(
        storage.getItem(nsFor(owner, 'pk-params-at')),
        'pkParamsUpdatedAt',
        now,
        issues,
    );
    const sourceAccount = completeBackupAccountTag(owner);
    let pkParams: PKCustomParams | null | undefined;
    if (storage.getItem(pkKey) !== null || active.pkParams !== null) {
        const saved = loadJSONFromStorage<unknown>(storage, pkKey, null);
        pkParams = sanitizePKParams(saved ?? active.pkParams);
    } else if (pkUpdatedAt !== undefined) {
        // The key is removed when the user clears overrides; the timestamp is
        // the evidence that this was an explicit clear, not an old device.
        pkParams = null;
    }

    return {
        bundle: {
            format: COMPLETE_BACKUP_FORMAT,
            formatVersion: COMPLETE_BACKUP_FORMAT_VERSION,
            createdAt,
            mode: activeMode,
            ...(sourceAccount !== undefined ? { sourceAccount } : {}),
            modes: { transfem: readMode('transfem'), transmasc: readMode('transmasc') },
            ...(weight !== undefined ? { weight } : {}),
            ...(weightUpdatedAt !== undefined ? { weightUpdatedAt } : {}),
            ...(pkParams !== undefined ? { pkParams } : {}),
            ...(pkUpdatedAt !== undefined ? { pkParamsUpdatedAt: pkUpdatedAt } : {}),
            calibration: {
                method: active.calibrationMethod,
                historyMode: active.calibrationHistoryMode,
            },
            preferences: readPortablePreferences(storage),
        },
        issues,
        droppedRecords,
        invalidRecords,
        duplicateIds: [...duplicateIds],
    };
}

/** Bundle-only wrapper for callers that do not need the export report. */
export function buildCompleteBackupBundleFromStorage(
    storage: StorageLike,
    owner: string,
    activeMode: ModeKey,
    active: CompleteBackupActive,
    createdAt = new Date().toISOString(),
    now = Date.now(),
): CompleteBackupBundle {
    return buildCompleteBackupBundleReportFromStorage(storage, owner, activeMode, active, createdAt, now).bundle;
}

interface ParsedBundle {
    errors: string[];
    createdAt?: string;
    formatVersion?: number;
    sourceMode?: ModeKey;
    sourceAccount?: string;
    modes: Partial<Record<ModeKey, CompleteBackupMode>>;
    categoryErrors: Record<string, string[]>;
    categoryCounts: Record<string, number>;
    tombstoneDrops: Record<string, TombstoneDrops>;
    tombstoneNotes: string[];
    missing: string[];
    calibration?: CompleteBackupCalibration;
    preferences: { values: PortablePreferences; ignored: string[]; invalid: string[] };
    weight?: number;
    weightUpdatedAt?: number;
    pkParams?: PKCustomParams | null;
    pkParamsUpdatedAt?: number;
}

const parseBundle = (raw: unknown, now: number): ParsedBundle => {
    const errors: string[] = [];
    const categoryErrors: Record<string, string[]> = {};
    const categoryCounts: Record<string, number> = {};
    const tombstoneDrops: Record<string, TombstoneDrops> = {};
    const tombstoneNotes: string[] = [];
    const missing: string[] = [];
    const modes: Partial<Record<ModeKey, CompleteBackupMode>> = {};
    const preferences = sanitizePortablePreferences(undefined);

    if (!isObject(raw)) {
        return {
            errors: ['Backup root must be an object'],
            modes,
            categoryErrors,
            categoryCounts,
            tombstoneDrops,
            tombstoneNotes,
            missing,
            preferences,
        };
    }
    if (raw.format !== COMPLETE_BACKUP_FORMAT) errors.push('Unknown backup format');
    const formatVersion = raw.formatVersion;
    if (formatVersion !== COMPLETE_BACKUP_FORMAT_VERSION) {
        errors.push(
            typeof formatVersion === 'number'
                ? `Unsupported backup format version: ${formatVersion}`
                : 'Missing backup format version',
        );
    }
    if (!isIsoDate(raw.createdAt)) errors.push('createdAt must be an ISO date string');
    if (raw.mode !== 'transfem' && raw.mode !== 'transmasc') errors.push('mode must be transfem or transmasc');
    if (!isObject(raw.modes)) {
        errors.push('modes must be an object');
    }

    // A version we cannot read is not previewed further.
    if (errors.length > 0) {
        return {
            errors,
            createdAt: isIsoDate(raw.createdAt) ? raw.createdAt : undefined,
            formatVersion: typeof formatVersion === 'number' ? formatVersion : undefined,
            sourceMode: raw.mode === 'transfem' || raw.mode === 'transmasc' ? raw.mode : undefined,
            modes,
            categoryErrors,
            categoryCounts,
            tombstoneDrops,
            tombstoneNotes,
            missing,
            preferences,
        };
    }

    const modesRaw = raw.modes as Record<string, unknown>;
    for (const mode of MODE_KEYS) {
        const blockRaw = modesRaw[mode];
        if (!isObject(blockRaw)) {
            errors.push(`modes.${mode} must be an object`);
            continue;
        }
        const block: CompleteBackupMode = {};
        for (const category of ARRAY_CATEGORIES) {
            const path = `${mode}.${category}`;
            if (blockRaw[category] === undefined) {
                missing.push(path);
                continue;
            }
            categoryCounts[path] = Array.isArray(blockRaw[category]) ? blockRaw[category].length : 0;
            const result = validateArray(blockRaw[category], path, VALIDATORS[category], now);
            if (result.errors.length > 0) {
                categoryErrors[path] = result.errors;
                continue;
            }
            block[category] = result.values;
        }
        if (blockRaw.deletions === undefined) {
            missing.push(`${mode}.deletions`);
        } else {
            if (isObject(blockRaw.deletions)) {
                const total = ['events', 'labResults', 'doseTemplates'].reduce((sum, kind) => {
                    const map = blockRaw.deletions[kind];
                    const count = isObject(map) ? Object.keys(map).length : 0;
                    categoryCounts[`${mode}.deletions.${kind}`] = count;
                    return sum + count;
                }, 0);
                categoryCounts[`${mode}.deletions`] = total;
            }
            const tombstones = validateTombstones(blockRaw.deletions, `${mode}.deletions`, now);
            for (const kind of ['events', 'labResults', 'doseTemplates'] as const) {
                tombstoneDrops[`${mode}.deletions.${kind}`] = tombstones.drops[kind];
            }
            tombstoneNotes.push(...tombstones.notes);
            if (tombstones.errors.length > 0) categoryErrors[`${mode}.deletions`] = tombstones.errors;
            else block.deletions = tombstones.value;
        }
        // `planItems` is accepted as a read alias for `plan`; the writer always
        // emits `plan`.
        if (blockRaw.plan === undefined && blockRaw.planItems !== undefined) {
            const index = missing.indexOf(`${mode}.plan`);
            if (index >= 0) missing.splice(index, 1);
            categoryCounts[`${mode}.plan`] = Array.isArray(blockRaw.planItems) ? blockRaw.planItems.length : 0;
            const result = validateArray(blockRaw.planItems, `${mode}.planItems`, validatePlan, now);
            if (result.errors.length > 0) categoryErrors[`${mode}.plan`] = result.errors;
            else block.plan = result.values;
        }
        modes[mode] = block;
    }

    let calibration: CompleteBackupCalibration | undefined;
    if (raw.calibration === undefined) {
        missing.push('calibration');
        categoryErrors.calibration = ['calibration is missing'];
    } else {
        const result = validateCalibration(raw.calibration);
        if (result.value) calibration = result.value;
        else categoryErrors.calibration = result.errors;
    }

    if (raw.preferences !== undefined) {
        preferences.values = sanitizePortablePreferences(raw.preferences).values;
        preferences.ignored = sanitizePortablePreferences(raw.preferences).ignored;
        preferences.invalid = sanitizePortablePreferences(raw.preferences).invalid;
    } else {
        missing.push('preferences');
    }

    let weight: number | undefined;
    let weightUpdatedAt: number | undefined;
    if (raw.weight !== undefined) {
        if (isFiniteNumber(raw.weight) && raw.weight >= BODY_WEIGHT_KG_MIN && raw.weight <= BODY_WEIGHT_KG_MAX)
            weight = raw.weight;
        else categoryErrors.weight = ['weight must be a plausible body weight in kg'];
    } else {
        missing.push('weight');
    }
    if (raw.weightUpdatedAt !== undefined) {
        const stamp = readStamp(raw.weightUpdatedAt, now);
        if (stamp.error) categoryErrors.weight = [...(categoryErrors.weight ?? []), `weightUpdatedAt: ${stamp.error}`];
        else weightUpdatedAt = stamp.value;
    }

    let pkParams: PKCustomParams | null | undefined;
    let pkParamsUpdatedAt: number | undefined;
    if (raw.pkParams !== undefined) {
        if (raw.pkParams === null) {
            pkParams = null;
        } else {
            const sanitized = sanitizePKParams(raw.pkParams);
            if (sanitized === null) categoryErrors.pkParams = ['pkParams contains no usable numeric values'];
            else pkParams = sanitized;
        }
    } else {
        missing.push('pkParams');
    }
    if (raw.pkParamsUpdatedAt !== undefined) {
        const stamp = readStamp(raw.pkParamsUpdatedAt, now);
        if (stamp.error)
            categoryErrors.pkParams = [...(categoryErrors.pkParams ?? []), `pkParamsUpdatedAt: ${stamp.error}`];
        else pkParamsUpdatedAt = stamp.value;
    }

    return {
        errors,
        createdAt: raw.createdAt as string,
        formatVersion: raw.formatVersion as number,
        sourceMode: raw.mode as ModeKey,
        // Anything else in that field is ignored: the file then names no account.
        sourceAccount:
            typeof raw.sourceAccount === 'string' && ACCOUNT_TAG.test(raw.sourceAccount)
                ? raw.sourceAccount
                : undefined,
        modes,
        categoryErrors,
        categoryCounts,
        tombstoneDrops,
        tombstoneNotes,
        missing,
        calibration,
        preferences,
        weight,
        weightUpdatedAt,
        pkParams,
        pkParamsUpdatedAt,
    };
};

const zeroCounts = (): BundleCounts => ({
    events: 0,
    labResults: 0,
    doseTemplates: 0,
    deletions: 0,
    quickDoses: 0,
    supplies: 0,
    plan: 0,
});

const countTombstones = (t: Tombstones): number =>
    Object.keys(t.events).length + Object.keys(t.labResults).length + Object.keys(t.doseTemplates).length;

const localArrayFor = (context: CompleteBackupContext, mode: ModeKey, category: ArrayCategory): unknown[] => {
    if (mode === context.mode) return context.active[category];
    const raw = loadJSONFromStorage<unknown>(
        context.storage,
        modeKeyFor(context.owner, mode, CATEGORY_SUFFIX[category]),
        [],
    );
    return Array.isArray(raw) ? raw : [];
};

const duplicateIds = (records: { id: string }[]): string[] => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const record of records) {
        if (seen.has(record.id)) duplicates.add(record.id);
        else seen.add(record.id);
    }
    return [...duplicates];
};

const recordsById = (records: unknown[]): Map<string, Record<string, unknown>> => {
    const byId = new Map<string, Record<string, unknown>>();
    for (const record of records) {
        if (!isObject(record) || typeof record.id !== 'string') continue;
        byId.set(record.id, record);
    }
    return byId;
};

interface KindDeletionPlan {
    finalMap: Record<string, number>;
    accepted: Record<string, number>;
    removedLocalIds: string[];
    protectedIds: string[];
    droppedIncomingIds: string[];
}

interface ModeDeletionPlan {
    tombstones: Tombstones;
    kinds: Record<RecordKind, KindDeletionPlan>;
    impacts: CompleteBackupDeletionImpact[];
    writeNeeded: boolean;
    conflicts: string[];
}

const sameTombstoneMap = (a: TombstoneMap, b: TombstoneMap): boolean => {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every(id => hasOwn(b, id) && a[id] === b[id]);
};

/**
 * Decide what each incoming tombstone does without writing. Tombstones from the
 * future, older than the sync TTL, or above the per-kind cap are not imported.
 * A local record with a newer updatedAt is never deleted by an incoming
 * tombstone; that conflict is reported instead.
 */
const planDeletions = (
    parsed: ParsedBundle,
    context: CompleteBackupContext,
    mode: ModeKey,
    now: number,
    blocked: ReadonlySet<string>,
): ModeDeletionPlan | undefined => {
    const block = parsed.modes[mode];
    if (!block?.deletions) return undefined;

    const localTombstones = readLocalTombstones(context.storage, context.owner, mode);
    const kinds = {} as Record<RecordKind, KindDeletionPlan>;
    const tombstones = emptyTombstones();
    const impacts: CompleteBackupDeletionImpact[] = [];
    const conflicts: string[] = [];
    let writeNeeded = false;

    for (const kind of RECORD_KINDS) {
        const category = KIND_CATEGORY[kind];
        const path = `${mode}.deletions.${kind}`;
        const local = localArrayFor(context, mode, category);
        const localById = recordsById(local);
        const incomingRecords = (block[category] ?? []) as { id: string }[];
        const incomingById = recordsById(incomingRecords);
        const incomingMap = block.deletions[kind];
        const parseDrops = parsed.tombstoneDrops[path] ?? { future: [], expired: [], overCap: [] };
        const accepted = nullMap<number>();
        const protectedIds: string[] = [];
        const droppedIncomingIds = [...parseDrops.future, ...parseDrops.expired, ...parseDrops.overCap];

        if (blocked.has(`${mode}.${category}`)) {
            for (const id of Object.keys(incomingMap)) {
                droppedIncomingIds.push(id);
                conflicts.push(`${path}: ${category} category is blocked; tombstone for ${id} was not applied`);
            }
        } else {
            for (const [id, at] of Object.entries(incomingMap)) {
                const incomingRecord = incomingById.get(id);
                if (incomingRecord && (recordStamp(incomingRecord) ?? 0) > at) {
                    droppedIncomingIds.push(id);
                    conflicts.push(
                        `${path}: tombstone for ${id} is older than the record in the same bundle; tombstone ignored`,
                    );
                    continue;
                }
                const localRecord = localById.get(id);
                if (localRecord && (recordStamp(localRecord) ?? 0) > at) {
                    protectedIds.push(id);
                    conflicts.push(
                        `${path}: local record ${id} is newer than the incoming tombstone; local record kept`,
                    );
                    continue;
                }
                accepted[id] = at;
            }
        }

        const candidate = Object.assign(nullMap<number>(), localTombstones[kind]);
        for (const [id, at] of Object.entries(accepted)) {
            const existing = hasOwn(candidate, id) ? candidate[id] : 0;
            candidate[id] = Math.max(existing, at);
        }
        const finalMap = pruneTombstoneMap(candidate, now);
        for (const id of Object.keys(accepted)) {
            if (!hasOwn(finalMap, id)) {
                droppedIncomingIds.push(id);
                conflicts.push(`${path}: tombstone for ${id} was not retained after TTL/cap bounds`);
            }
        }
        const droppedLocal = Object.keys(candidate).filter(id => !hasOwn(finalMap, id) && !hasOwn(accepted, id));
        if (droppedLocal.length) {
            conflicts.push(`${path}: dropped ${droppedLocal.length} local tombstone(s) outside the TTL/cap bounds`);
        }
        // The pruned map is what the merge checks against, so it must replace
        // the stored map too. Otherwise an expired local tombstone is gone only
        // for this import and can delete the restored record on the next sync.
        const prunedLocal = pruneTombstoneMap(localTombstones[kind], now);
        if (droppedLocal.length > 0 || !sameTombstoneMap(prunedLocal, localTombstones[kind])) {
            writeNeeded = true;
        }

        const removedLocalIds: string[] = [];
        for (const id of Object.keys(accepted)) {
            if (hasOwn(finalMap, id) && localById.has(id) && !protectedIds.includes(id)) {
                removedLocalIds.push(id);
            }
        }

        const retainedAccepted = Object.keys(accepted).filter(id => hasOwn(finalMap, id)).length;
        if (retainedAccepted > 0) writeNeeded = true;
        const rawIncoming =
            parsed.categoryCounts[path] ??
            parseDrops.future.length +
                parseDrops.expired.length +
                parseDrops.overCap.length +
                Object.keys(incomingMap).length;

        kinds[kind] = { finalMap, accepted, removedLocalIds, protectedIds, droppedIncomingIds };
        tombstones[kind] = finalMap;
        impacts.push({
            mode,
            kind,
            incoming: rawIncoming,
            accepted: retainedAccepted,
            removedLocal: removedLocalIds.length,
            removedIds: [...removedLocalIds],
            protectedIds: [...protectedIds],
            droppedIds: [...new Set(droppedIncomingIds)],
        });
    }

    return { tombstones, kinds, impacts, writeNeeded, conflicts };
};

interface CategoryMergePlan {
    merged: unknown[];
    added: number;
    updated: number;
    skipped: number;
    clearedTombstoneIds: string[];
}

type CategoryMergeResult =
    | { plan: CategoryMergePlan; blocked?: undefined; conflicts: string[] }
    | { plan?: undefined; blocked: string; conflicts: string[] };

/**
 * Plan a record-array merge for one mode/category. Local tombstones are
 * authoritative when they are at least as new as the incoming record; an older
 * bundle must not resurrect a record and must not clear that tombstone.
 */
const planCategoryMerge = (
    context: CompleteBackupContext,
    mode: ModeKey,
    category: ArrayCategory,
    incoming: { id: string }[],
    localTombstones: Tombstones,
    deletionPlan: ModeDeletionPlan | undefined,
    path: string,
): CategoryMergeResult => {
    const local = localArrayFor(context, mode, category);
    const localById = recordsById(local);
    const seenLocalIds = new Set<string>();
    for (const record of local) {
        if (!isObject(record) || typeof record.id !== 'string') continue;
        if (seenLocalIds.has(record.id)) {
            return {
                blocked: `${path}: local data already contains duplicate id ${record.id}`,
                conflicts: [],
            };
        }
        seenLocalIds.add(record.id);
    }

    const kind = STAMPED_CATEGORIES.has(category) ? (category as RecordKind) : undefined;
    const removedLocal = new Set(kind ? (deletionPlan?.kinds[kind]?.removedLocalIds ?? []) : []);
    const merged = local.filter(
        record => !(isObject(record) && typeof record.id === 'string' && removedLocal.has(record.id)),
    );
    const mergedIndexById = new Map<string, number>();
    merged.forEach((record, index) => {
        if (isObject(record) && typeof record.id === 'string') mergedIndexById.set(record.id, index);
    });

    const clearedTombstoneIds: string[] = [];
    const conflicts: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const record of incoming) {
        const kindTombstones = kind ? localTombstones[kind] : undefined;
        const localTombstoneAt =
            kindTombstones && hasOwn(kindTombstones, record.id) ? kindTombstones[record.id] : undefined;

        if (
            kind &&
            deletionPlan &&
            hasOwn(deletionPlan.kinds[kind].accepted, record.id) &&
            hasOwn(deletionPlan.kinds[kind].finalMap, record.id)
        ) {
            // planDeletions only accepts a tombstone when the record in the same
            // bundle is not newer, so the surviving incoming tombstone wins.
            // Report the contradiction instead of dropping the record silently.
            skipped++;
            conflicts.push(
                `${path}: bundle contains id ${record.id} as both a record and a tombstone; the tombstone wins and the record was not restored`,
            );
            continue;
        }

        if (localTombstoneAt !== undefined) {
            const incomingStamp = recordStamp(record);
            if (incomingStamp === undefined || incomingStamp <= localTombstoneAt) {
                skipped++;
                conflicts.push(
                    `${path}: id ${record.id} is hidden by a local deletion at ${localTombstoneAt}; incoming record was not restored`,
                );
                continue;
            }
            clearedTombstoneIds.push(record.id);
            conflicts.push(
                `${path}: id ${record.id} is newer than the local deletion; incoming record restored and tombstone cleared`,
            );
        }

        const existing = localById.get(record.id);
        if (!existing) {
            merged.push(record);
            mergedIndexById.set(record.id, merged.length - 1);
            added++;
            continue;
        }
        if (!kind) {
            return {
                blocked: `${path}: id ${record.id} already exists and this category has no updatedAt`,
                conflicts: [],
            };
        }
        const incomingStamp = recordStamp(record);
        const localStamp = recordStamp(existing);
        if (incomingStamp === undefined || localStamp === undefined) {
            return {
                blocked: `${path}: id ${record.id} exists on both sides without a reliable updatedAt`,
                conflicts: [],
            };
        }
        if (incomingStamp > localStamp) {
            const index = mergedIndexById.get(record.id);
            if (index !== undefined) merged[index] = record;
            else {
                merged.push(record);
                mergedIndexById.set(record.id, merged.length - 1);
            }
            updated++;
        } else if (incomingStamp < localStamp) {
            skipped++;
        } else if (canonical(record) === canonical(existing)) {
            skipped++;
        } else {
            return {
                blocked: `${path}: id ${record.id} has equal updatedAt but different content`,
                conflicts: [],
            };
        }
    }

    return { plan: { merged, added, updated, skipped, clearedTombstoneIds }, conflicts };
};

interface ModeReconcileResult {
    categories: Partial<Record<ArrayCategory, CategoryMergePlan>>;
    tombstones: Tombstones;
    writeTombstones: boolean;
}

interface BundleReconcileResult {
    blocked: Set<string>;
    issues: string[];
    conflicts: string[];
    modes: Record<ModeKey, ModeReconcileResult>;
    stats: CompleteBackupPreview['stats'];
    deletionImpact: CompleteBackupDeletionImpact[];
    scalars: CompleteBackupScalarsPreview;
}

const sameCalibration = (a: CompleteBackupCalibration, b: CompleteBackupCalibration): boolean =>
    a.method === b.method && a.historyMode === b.historyMode;

const planScalars = (
    parsed: ParsedBundle,
    context: CompleteBackupContext,
    blocked: Set<string>,
): {
    preview: CompleteBackupScalarsPreview;
    conflicts: string[];
    weight?: { action: ScalarPreviewAction; value: number; stamp?: number };
    pkParams?: { action: ScalarPreviewAction; value: PKCustomParams | null; stamp?: number };
    calibration?: { action: 'unchanged' | 'overwrite' | 'blocked' };
} => {
    const conflicts: string[] = [];
    const preview: CompleteBackupScalarsPreview = {};

    let weightPlan: { action: ScalarPreviewAction; value: number; stamp?: number } | undefined;
    if (parsed.weight !== undefined) {
        const localRaw = context.storage.getItem(nsFor(context.owner, 'weight'));
        const localWeight =
            localRaw !== null && isFiniteNumber(Number(localRaw)) && localRaw.trim() !== ''
                ? Number(localRaw)
                : undefined;
        const localStamp = readStampString(context.storage.getItem(nsFor(context.owner, 'weight-at')));
        // Same rule as cloud sync: a value without a stamp counts as the floor
        // stamp, so a stamped value beats it. Every device stores the untouched
        // 70 kg default without a stamp; treating that as a conflict meant a
        // backup's weight could never be restored onto a new device.
        const incomingAt = parsed.weightUpdatedAt ?? UNSTAMPED_SCALAR_AT;
        const localAt = localStamp ?? UNSTAMPED_SCALAR_AT;
        let action: ScalarPreviewAction;
        if (blocked.has('weight')) {
            action = 'blocked';
        } else if (localWeight === undefined) {
            action = 'added';
        } else if (incomingAt < localAt) {
            action = 'skipped';
        } else if (incomingAt > localAt) {
            action = 'updated';
        } else if (localWeight === parsed.weight) {
            action = 'unchanged';
        } else {
            action = 'conflict';
            conflicts.push(
                parsed.weightUpdatedAt === undefined
                    ? 'weight exists on both sides without a reliable timestamp and the values differ'
                    : 'weight has equal updatedAt but different content',
            );
            blocked.add('weight');
        }
        preview.weight = { action, current: localWeight, incoming: parsed.weight };
        if (action === 'added' || action === 'updated') {
            weightPlan = { action, value: parsed.weight, stamp: parsed.weightUpdatedAt };
        }
    }

    let pkPlan: { action: ScalarPreviewAction; value: PKCustomParams | null; stamp?: number } | undefined;
    if (parsed.pkParams !== undefined) {
        const localRaw = context.storage.getItem(nsFor(context.owner, 'pk-params'));
        const localStamp = readStampString(context.storage.getItem(nsFor(context.owner, 'pk-params-at')));
        let localValue: PKCustomParams | null | undefined;
        if (localRaw !== null) {
            try {
                localValue = JSON.parse(localRaw) as PKCustomParams | null;
            } catch {
                localValue = undefined;
            }
        } else if (localStamp !== undefined) {
            localValue = null;
        }
        const incomingAt = parsed.pkParamsUpdatedAt ?? UNSTAMPED_SCALAR_AT;
        const localAt = localStamp ?? UNSTAMPED_SCALAR_AT;
        let action: ScalarPreviewAction;
        if (blocked.has('pkParams')) {
            action = 'blocked';
        } else if (localValue === undefined) {
            action = 'added';
        } else if (incomingAt < localAt) {
            action = 'skipped';
        } else if (incomingAt > localAt) {
            action = 'updated';
        } else if (canonical(localValue) === canonical(parsed.pkParams)) {
            action = 'unchanged';
        } else {
            action = 'conflict';
            conflicts.push(
                parsed.pkParamsUpdatedAt === undefined
                    ? 'pkParams exists on both sides without a reliable timestamp and the values differ'
                    : 'pkParams has equal updatedAt but different content',
            );
            blocked.add('pkParams');
        }
        preview.pkParams = { action, current: localValue, incoming: parsed.pkParams };
        if (action === 'added' || action === 'updated') {
            pkPlan = { action, value: parsed.pkParams, stamp: parsed.pkParamsUpdatedAt };
        }
    }

    let calibrationPlan: { action: 'unchanged' | 'overwrite' | 'blocked' } | undefined;
    if (parsed.calibration) {
        const current: CompleteBackupCalibration = {
            method: context.active.calibrationMethod,
            historyMode: context.active.calibrationHistoryMode,
        };
        const action: 'unchanged' | 'overwrite' | 'blocked' = blocked.has('calibration')
            ? 'blocked'
            : sameCalibration(current, parsed.calibration)
              ? 'unchanged'
              : 'overwrite';
        preview.calibration = { action, current, incoming: parsed.calibration };
        calibrationPlan = { action };
    }

    return {
        preview,
        conflicts,
        weight: weightPlan,
        pkParams: pkPlan,
        calibration: calibrationPlan,
    };
};

const reconcileBundle = (parsed: ParsedBundle, context: CompleteBackupContext, now: number): BundleReconcileResult => {
    const blocked = new Set(Object.keys(parsed.categoryErrors));
    const issues = [...Object.values(parsed.categoryErrors).flat(), ...parsed.tombstoneNotes];
    const conflicts: string[] = [];
    const deletionImpact: CompleteBackupDeletionImpact[] = [];
    const modes = {} as Record<ModeKey, ModeReconcileResult>;
    let added = 0;
    let updated = 0;
    let skipped = 0;
    let removed = 0;

    for (const mode of MODE_KEYS) {
        const block = parsed.modes[mode];
        const categories: Partial<Record<ArrayCategory, CategoryMergePlan>> = {};
        const localTombstonesBefore = readLocalTombstones(context.storage, context.owner, mode);
        // Expired local tombstones are not authoritative: a row past its TTL
        // must not keep an older incoming record from being restored.
        const localTombstonesPruned = pruneTombstones(localTombstonesBefore, now);
        let tombstones = localTombstonesBefore;
        let writeTombstones = false;
        let clearedAnyTombstone = false;
        const deletionPlan = planDeletions(parsed, context, mode, now, blocked);
        if (deletionPlan) {
            tombstones = deletionPlan.tombstones;
            writeTombstones = deletionPlan.writeNeeded;
            conflicts.push(...deletionPlan.conflicts);
            deletionImpact.push(...deletionPlan.impacts);
            removed += deletionPlan.impacts.reduce((total, impact) => total + impact.removedLocal, 0);
        } else {
            // The bundle may omit `deletions` entirely. There is nothing to
            // import, but an expired local map still has to stop existing:
            // otherwise it survives this merge and deletes a restored record
            // on the next sync.
            const prunedLocal = pruneTombstones(localTombstonesBefore, now);
            const localChanged = RECORD_KINDS.some(
                kind => !sameTombstoneMap(prunedLocal[kind], localTombstonesBefore[kind]),
            );
            if (localChanged) {
                tombstones = prunedLocal;
                writeTombstones = true;
            }
        }
        const acceptedTombstonesRemain = (): boolean =>
            RECORD_KINDS.some(kind => {
                const kindPlan = deletionPlan?.kinds[kind];
                if (!kindPlan) return false;
                return Object.keys(kindPlan.accepted).some(id => hasOwn(kindPlan.finalMap, id));
            });

        if (block) {
            for (const category of ARRAY_CATEGORIES) {
                const path = `${mode}.${category}`;
                if (blocked.has(path)) continue;
                const incoming = block[category] as { id: string }[] | undefined;
                if (!incoming) continue;
                const duplicates = duplicateIds(incoming);
                if (duplicates.length) {
                    blocked.add(path);
                    issues.push(`${path}: duplicate id ${formatIds(duplicates)}`);
                    continue;
                }
                const result = planCategoryMerge(
                    context,
                    mode,
                    category,
                    incoming,
                    localTombstonesPruned,
                    deletionPlan,
                    path,
                );
                if (!result.plan) {
                    blocked.add(path);
                    conflicts.push(result.blocked);
                    continue;
                }
                categories[category] = result.plan;
                conflicts.push(...result.conflicts);
                added += result.plan.added;
                updated += result.plan.updated;
                skipped += result.plan.skipped;
            }

            // A tombstone can delete a local record even when the bundle omits
            // that record array. Write the filtered array so the UI and storage
            // agree, but never touch a category blocked by invalid records.
            for (const kind of RECORD_KINDS) {
                const category = KIND_CATEGORY[kind];
                const path = `${mode}.${category}`;
                if (categories[category] || blocked.has(path)) continue;
                const removedIds = new Set(deletionPlan?.kinds[kind]?.removedLocalIds ?? []);
                if (removedIds.size === 0) continue;
                const local = localArrayFor(context, mode, category);
                categories[category] = {
                    merged: local.filter(
                        record => !(isObject(record) && typeof record.id === 'string' && removedIds.has(record.id)),
                    ),
                    added: 0,
                    updated: 0,
                    skipped: 0,
                    clearedTombstoneIds: [],
                };
            }

            for (const kind of RECORD_KINDS) {
                const plan = categories[KIND_CATEGORY[kind]];
                if (!plan) continue;
                for (const id of plan.clearedTombstoneIds) {
                    delete tombstones[kind][id];
                    writeTombstones = true;
                    clearedAnyTombstone = true;
                }
            }

            // A category can become blocked during reconciliation (for example
            // an equal-time conflict). Do not delete local records or import
            // tombstones for a category whose merge was aborted.
            for (const kind of RECORD_KINDS) {
                const path = `${mode}.${KIND_CATEGORY[kind]}`;
                const kindPlan = deletionPlan?.kinds[kind];
                if (!blocked.has(path) || !kindPlan) continue;
                const acceptedIds = Object.keys(kindPlan.accepted);
                if (acceptedIds.length === 0) continue;
                for (const id of acceptedIds) {
                    const original = hasOwn(localTombstonesBefore[kind], id)
                        ? localTombstonesBefore[kind][id]
                        : undefined;
                    if (original === undefined) delete tombstones[kind][id];
                    else tombstones[kind][id] = original;
                }
                const impact = deletionPlan.impacts.find(item => item.kind === kind);
                if (impact) {
                    impact.accepted = 0;
                    impact.removedLocal = 0;
                    impact.removedIds = [];
                    impact.droppedIds = [...new Set([...impact.droppedIds, ...acceptedIds])];
                }
                removed -= kindPlan.removedLocalIds.length;
                kindPlan.accepted = {};
                kindPlan.removedLocalIds = [];
                writeTombstones = writeTombstones || clearedAnyTombstone || acceptedTombstonesRemain();
            }
        } else {
            // Envelope/mode-level errors skip this mode entirely; still record
            // tombstone pruning and scalar previews below.
        }

        modes[mode] = { categories, tombstones, writeTombstones };
    }

    const scalarPlan = planScalars(parsed, context, blocked);
    conflicts.push(...scalarPlan.conflicts);

    return {
        blocked,
        issues,
        conflicts,
        modes,
        stats: { added, updated, skipped, removed },
        deletionImpact,
        scalars: scalarPlan.preview,
    };
};

/**
 * Validate a bundle and compare it with the current store without writing
 * anything. Counts, deletion ids and conflicts are what the confirmation dialog
 * shows.
 */
export function inspectCompleteBackupBundle(raw: unknown, context: CompleteBackupContext): CompleteBackupPreview {
    const now = context.now ?? Date.now();
    const parsed = parseBundle(raw, now);
    const counts: Record<ModeKey, BundleCounts> = { transfem: zeroCounts(), transmasc: zeroCounts() };

    for (const mode of MODE_KEYS) {
        const block = parsed.modes[mode];
        for (const category of ARRAY_CATEGORIES) {
            const path = `${mode}.${category}`;
            counts[mode][category] = parsed.categoryCounts[path] ?? block?.[category]?.length ?? 0;
        }
        counts[mode].deletions =
            parsed.categoryCounts[`${mode}.deletions`] ?? (block?.deletions ? countTombstones(block.deletions) : 0);
    }

    const reconciled = reconcileBundle(parsed, context, now);
    const ownTag = completeBackupAccountTag(context.owner);

    return {
        ok: parsed.errors.length === 0,
        errors: parsed.errors,
        formatVersion: parsed.formatVersion,
        createdAt: parsed.createdAt,
        sourceMode: parsed.sourceMode,
        currentMode: context.mode,
        targetOwner: context.owner,
        account: !parsed.sourceAccount || !ownTag ? 'unknown' : parsed.sourceAccount === ownTag ? 'same' : 'other',
        counts,
        missing: parsed.missing,
        blocked: [...reconciled.blocked],
        issues: reconciled.issues,
        conflicts: reconciled.conflicts,
        stats: reconciled.stats,
        preferences: parsed.preferences,
        calibration: parsed.calibration,
        weight: parsed.weight,
        weightUpdatedAt: parsed.weightUpdatedAt,
        pkParams: parsed.pkParams,
        pkParamsUpdatedAt: parsed.pkParamsUpdatedAt,
        deletionImpact: reconciled.deletionImpact,
        scalars: reconciled.scalars,
    };
}

/**
 * Stable comparison for a preview taken when a dialog opened and a fresh
 * preview taken when the user confirms. If this changes, the user is shown the
 * new counts/conflicts before anything is written.
 */
export function completeBackupPreviewFingerprint(preview: CompleteBackupPreview): string {
    return JSON.stringify({
        ok: preview.ok,
        errors: preview.errors,
        formatVersion: preview.formatVersion,
        createdAt: preview.createdAt,
        sourceMode: preview.sourceMode,
        currentMode: preview.currentMode,
        targetOwner: preview.targetOwner,
        account: preview.account,
        counts: preview.counts,
        missing: [...preview.missing].sort(),
        blocked: [...preview.blocked].sort(),
        issues: preview.issues,
        conflicts: preview.conflicts,
        stats: preview.stats,
        preferences: preview.preferences,
        calibration: preview.calibration,
        weight: preview.weight,
        weightUpdatedAt: preview.weightUpdatedAt,
        pkParams: preview.pkParams,
        pkParamsUpdatedAt: preview.pkParamsUpdatedAt,
        deletionImpact: preview.deletionImpact,
        scalars: preview.scalars,
    });
}

interface PlannedWrite {
    key: string;
    value: string | null;
}

/**
 * Merge the safe categories. Writes are snapshotted before the first write and
 * rolled back if a later write throws. That rollback is application-level, not
 * a localStorage transaction; if restoring the snapshot also fails, the error
 * message says partial writes may have occurred.
 */
export function mergeCompleteBackupBundleToStorage(
    raw: unknown,
    context: CompleteBackupContext,
): CompleteBackupMergeResult {
    const now = context.now ?? Date.now();
    const parsed = parseBundle(raw, now);
    if (parsed.errors.length > 0) {
        throw new Error(`Invalid complete backup: ${parsed.errors.join('; ')}`);
    }
    const reconciled = reconcileBundle(parsed, context, now);
    const result: CompleteBackupMergeResult = {
        applied: [],
        blocked: [...reconciled.blocked],
        skipped: [],
        added: reconciled.stats.added,
        updated: reconciled.stats.updated,
        removed: reconciled.stats.removed,
        modes: {},
        preferences: parsed.preferences.values,
    };
    const writes: PlannedWrite[] = [];

    for (const mode of MODE_KEYS) {
        const modePlan = reconciled.modes[mode];
        const modeResult: CompleteBackupMode = {};
        for (const category of ARRAY_CATEGORIES) {
            const path = `${mode}.${category}`;
            const plan = modePlan.categories[category];
            if (!plan || reconciled.blocked.has(path)) continue;
            const key = modeKeyFor(context.owner, mode, CATEGORY_SUFFIX[category]);
            writes.push({ key, value: JSON.stringify(plan.merged) });
            (modeResult as Record<string, unknown>)[category] = plan.merged;
            result.applied.push(path);
        }
        if (modePlan.writeTombstones) {
            writes.push({
                key: modeKeyFor(context.owner, mode, 'deletions'),
                value: JSON.stringify(modePlan.tombstones),
            });
            modeResult.deletions = modePlan.tombstones;
            result.applied.push(`${mode}.deletions`);
        }
        result.modes[mode] = modeResult;
    }

    const scalarPlan = planScalars(parsed, context, new Set(reconciled.blocked));
    if (scalarPlan.weight) {
        const key = nsFor(context.owner, 'weight');
        writes.push({ key, value: String(scalarPlan.weight.value) });
        writes.push({
            key: nsFor(context.owner, 'weight-at'),
            value: scalarPlan.weight.stamp !== undefined ? String(scalarPlan.weight.stamp) : null,
        });
        result.weight = scalarPlan.weight.value;
        result.applied.push('weight');
    } else if (reconciled.scalars.weight?.action === 'skipped') {
        result.skipped.push('weight');
    }
    if (scalarPlan.pkParams) {
        writes.push({
            key: nsFor(context.owner, 'pk-params'),
            value: scalarPlan.pkParams.value === null ? null : JSON.stringify(scalarPlan.pkParams.value),
        });
        writes.push({
            key: nsFor(context.owner, 'pk-params-at'),
            value: scalarPlan.pkParams.stamp !== undefined ? String(scalarPlan.pkParams.stamp) : null,
        });
        result.pkParams = scalarPlan.pkParams.value;
        result.applied.push('pkParams');
    } else if (reconciled.scalars.pkParams?.action === 'skipped') {
        result.skipped.push('pkParams');
    }
    if (parsed.calibration && scalarPlan.calibration?.action === 'overwrite') {
        writes.push({ key: nsFor(context.owner, 'cal-method'), value: parsed.calibration.method });
        writes.push({ key: nsFor(context.owner, 'cal-history-mode'), value: parsed.calibration.historyMode });
        result.calibration = parsed.calibration;
        result.applied.push('calibration');
    } else if (scalarPlan.calibration?.action === 'blocked') {
        result.skipped.push('calibration');
    }

    if (writes.length === 0) return result;

    const snapshot = new Map<string, string | null>();
    for (const write of writes) snapshot.set(write.key, context.storage.getItem(write.key));
    try {
        for (const write of writes) {
            if (write.value === null) context.storage.removeItem(write.key);
            else context.storage.setItem(write.key, write.value);
        }
    } catch (err) {
        let rollbackFailed = false;
        for (const [key, value] of snapshot) {
            try {
                if (value === null) context.storage.removeItem(key);
                else context.storage.setItem(key, value);
            } catch {
                rollbackFailed = true;
            }
        }
        if (rollbackFailed) throw new Error(PARTIAL_WRITE_MESSAGE, { cause: err });
        throw err;
    }

    return result;
}

/** Ids this device holds for a category, in React state or in storage. */
const heldIds = (context: CompleteBackupContext, mode: ModeKey, category: ArrayCategory): string[] => {
    const stored = loadJSONFromStorage<unknown>(
        context.storage,
        modeKeyFor(context.owner, mode, CATEGORY_SUFFIX[category]),
        [],
    );
    const records = [
        ...(Array.isArray(stored) ? stored : []),
        ...(mode === context.mode ? context.active[category] : []),
    ];
    return records.flatMap(record => (isObject(record) && isRecordId(record.id) ? [record.id] : []));
};

/**
 * The deletions a replace leaves behind, by the rule the regular replace
 * import uses: whatever this device holds that the backup leaves out is
 * deleted now, so the next sync cannot bring it back from the cloud or another
 * device; ids the backup brings back lose any tombstone; deletions this device
 * or the backup already knew about stay.
 */
const replacementTombstones = (
    context: CompleteBackupContext,
    mode: ModeKey,
    block: CompleteBackupMode,
    now: number,
): Tombstones => {
    const local = readLocalTombstones(context.storage, context.owner, mode);
    const incoming = block.deletions ?? emptyTombstones();
    const out = emptyTombstones();
    for (const kind of RECORD_KINDS) {
        const category = KIND_CATEGORY[kind];
        const map = nullMap<number>();
        for (const source of [local[kind], incoming[kind]]) {
            for (const [id, at] of Object.entries(source)) {
                if (!hasOwn(map, id) || at > map[id]) map[id] = at;
            }
        }
        for (const id of heldIds(context, mode, category)) map[id] = now;
        for (const record of block[category] ?? []) delete map[record.id];
        out[kind] = pruneTombstoneMap(map, now);
    }
    return out;
};

export interface CompleteBackupReplaceResult {
    applied: string[];
    /** The exact arrays written to each mode, for the active-mode React state. */
    modes: Partial<Record<ModeKey, CompleteBackupMode>>;
    weight?: number;
    pkParams?: PKCustomParams | null;
    calibration: CompleteBackupCalibration;
    preferences: PortablePreferences;
}

/**
 * Replace the target owner's record store with a complete bundle through the
 * crash-recoverable journal. Merge-specific conflicts are irrelevant here, but
 * a bundle that cannot represent the whole store is refused: every category,
 * both tombstone maps, and calibration must be present, no record may have
 * been dropped by validation, and no category may contain duplicate ids.
 *
 * Records this device holds that the bundle leaves out are tombstoned, as a
 * regular replace import does, or cloud sync would merge them straight back.
 *
 * Scalars the bundle omits are left alone. A supplied weight or PK value
 * replaces the local value and is stamped now, as setting it by hand would be,
 * so a newer value in the cloud does not win it back on the next sync; a
 * missing scalar does not mean "clear" in the complete-backup contract.
 */
export function replaceCompleteBackupBundleToStorage(
    raw: unknown,
    context: CompleteBackupContext,
): CompleteBackupReplaceResult {
    const now = context.now ?? Date.now();
    const parsed = parseBundle(raw, now);
    const errors = [...parsed.errors];

    for (const [path, messages] of Object.entries(parsed.categoryErrors)) {
        errors.push(`${path}: ${messages.join('; ')}`);
    }
    for (const [path, drops] of Object.entries(parsed.tombstoneDrops)) {
        if (drops.future.length || drops.expired.length || drops.overCap.length) {
            errors.push(`${path}: tombstones were dropped by the importer's bounds`);
        }
    }

    for (const mode of MODE_KEYS) {
        const block = parsed.modes[mode];
        if (!block) {
            errors.push(`modes.${mode} is required for replace`);
            continue;
        }
        for (const category of ARRAY_CATEGORIES) {
            const records = block[category];
            if (records === undefined) {
                errors.push(`${mode}.${category} is required for replace`);
                continue;
            }
            const seen = new Set<string>();
            for (const record of records) {
                if (!isObject(record) || typeof record.id !== 'string') continue;
                if (seen.has(record.id)) {
                    errors.push(`${mode}.${category}: duplicate id ${record.id} is not replaceable`);
                }
                seen.add(record.id);
            }
        }
        if (block.deletions === undefined) errors.push(`${mode}.deletions is required for replace`);
    }
    if (!parsed.calibration) errors.push('calibration is required for replace');

    if (errors.length > 0) {
        throw new Error(`Invalid complete backup for replace: ${errors.join('; ')}`);
    }

    const writes: ReplaceJournalEntry[] = [];
    const result: CompleteBackupReplaceResult = {
        applied: [],
        modes: {},
        calibration: parsed.calibration!,
        preferences: parsed.preferences.values,
    };

    for (const mode of MODE_KEYS) {
        const block = parsed.modes[mode]!;
        const modeResult: CompleteBackupMode = {};
        for (const category of ARRAY_CATEGORIES) {
            const records = block[category] ?? [];
            writes.push({
                key: modeKeyFor(context.owner, mode, CATEGORY_SUFFIX[category]),
                value: JSON.stringify(records),
            });
            (modeResult as Record<string, unknown>)[category] = records;
            result.applied.push(`${mode}.${category}`);
        }
        const tombstones = replacementTombstones(context, mode, block, now);
        writes.push({
            key: modeKeyFor(context.owner, mode, 'deletions'),
            value: JSON.stringify(tombstones),
        });
        modeResult.deletions = tombstones;
        result.applied.push(`${mode}.deletions`);
        result.modes[mode] = modeResult;
    }

    if (parsed.weight !== undefined) {
        writes.push({ key: nsFor(context.owner, 'weight'), value: String(parsed.weight) });
        writes.push({ key: nsFor(context.owner, 'weight-at'), value: String(now) });
        result.weight = parsed.weight;
        result.applied.push('weight');
    }
    if (parsed.pkParams !== undefined) {
        writes.push({
            key: nsFor(context.owner, 'pk-params'),
            value: parsed.pkParams === null ? null : JSON.stringify(parsed.pkParams),
        });
        writes.push({ key: nsFor(context.owner, 'pk-params-at'), value: String(now) });
        result.pkParams = parsed.pkParams;
        result.applied.push('pkParams');
    }

    const calibration = parsed.calibration!;
    writes.push({ key: nsFor(context.owner, 'cal-method'), value: calibration.method });
    writes.push({ key: nsFor(context.owner, 'cal-history-mode'), value: calibration.historyMode });
    result.applied.push('calibration');

    applyReplaceJournal(context.storage, context.owner, writes);
    return result;
}
