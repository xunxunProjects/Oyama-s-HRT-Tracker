/**
 * Compare local records against a cloud backup.
 *
 * The startup check used to be a set-difference on ids alone, which answered
 * "does either side have an id the other lacks" and nothing else. Two things
 * fell through it:
 *
 *   - **Edits were invisible.** Change a dose's amount or time on one device and
 *     the id is unchanged, so both sides looked identical. The divergence was
 *     never surfaced, and whichever device auto-backed-up next silently
 *     overwrote the other's edit.
 *   - **Events and lab results shared one id pool**, so a collision between the
 *     two kinds (possible via import, which accepts arbitrary string ids)
 *     miscounted both.
 *
 * This compares per kind and by content, so an edited record is reported as
 * `changed` rather than passing as identical.
 *
 * A note on what this deliberately does NOT claim: with no per-record
 * modification time and no tombstones, "present in cloud, absent locally" is
 * genuinely ambiguous — it is either a record added on another device or one
 * deleted on this one. `onlyCloud` reports the fact without guessing which.
 */

export interface KindDiff {
    onlyLocal: number;
    onlyCloud: number;
    changed: number;
}

export interface BackupDiff {
    events: KindDiff;
    labResults: KindDiff;
    onlyLocal: number;
    onlyCloud: number;
    changed: number;
    hasDifference: boolean;
}

type AnyRecord = Record<string, unknown>;

const EMPTY: KindDiff = { onlyLocal: 0, onlyCloud: 0, changed: 0 };

/** Fields that define a record's identity-of-content, in a fixed order. */
const FIELDS: Record<'events' | 'labResults', readonly string[]> = {
    events: ['route', 'ester', 'doseMG', 'timeH', 'extras'],
    labResults: ['unit', 'concValue', 'timeH'],
};

function stable(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (typeof value === 'object') {
        // Sort keys so `extras` written in a different order still compares equal.
        const o = value as AnyRecord;
        return `{${Object.keys(o).sort().map(k => `${k}:${stable(o[k])}`).join(',')}}`;
    }
    // Normalise numerics so 4 and 4.0 — and the string "4" a hand-edited import
    // may carry — don't read as an edit.
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const n = Number(value);
    return Number.isFinite(n) && String(value).trim() !== '' ? String(n) : String(value);
}

function fingerprint(kind: 'events' | 'labResults', record: AnyRecord): string {
    return FIELDS[kind].map(f => stable(record[f])).join('|');
}

function indexById(list: unknown, kind: 'events' | 'labResults'): Map<string, string> {
    const out = new Map<string, string>();
    if (!Array.isArray(list)) return out;
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as AnyRecord;
        const id = typeof rec.id === 'string' ? rec.id : null;
        if (!id) continue;
        // Last write wins on duplicate ids, matching how the app itself would
        // render them; counting a duplicate as a difference would be noise.
        out.set(id, fingerprint(kind, rec));
    }
    return out;
}

function compare(local: Map<string, string>, cloud: Map<string, string>): KindDiff {
    let onlyLocal = 0;
    let changed = 0;
    for (const [id, fp] of local) {
        const other = cloud.get(id);
        if (other === undefined) onlyLocal++;
        else if (other !== fp) changed++;
    }
    let onlyCloud = 0;
    for (const id of cloud.keys()) if (!local.has(id)) onlyCloud++;
    return { onlyLocal, onlyCloud, changed };
}

/**
 * Pull one kind out of a payload, across both HRT modes and both payload
 * versions. v2 nests under `modes.{transfem,transmasc}`; v1 is flat and
 * describes only whichever mode was active when it was written.
 */
function collect(payload: unknown, kind: 'events' | 'labResults'): unknown[] {
    if (!payload || typeof payload !== 'object') return [];
    const p = payload as AnyRecord;
    const modes = p.modes as AnyRecord | undefined;
    if (modes && typeof modes === 'object') {
        const out: unknown[] = [];
        for (const m of ['transfem', 'transmasc'] as const) {
            const block = modes[m] as AnyRecord | undefined;
            const list = block && typeof block === 'object' ? block[kind] : undefined;
            if (Array.isArray(list)) out.push(...list);
        }
        return out;
    }
    const flat = p[kind];
    return Array.isArray(flat) ? flat : [];
}

export function diffBackup(localPayload: unknown, cloudPayload: unknown): BackupDiff {
    const kinds = (['events', 'labResults'] as const).map(kind => [
        kind,
        compare(
            indexById(collect(localPayload, kind), kind),
            indexById(collect(cloudPayload, kind), kind),
        ),
    ] as const);

    const byKind = Object.fromEntries(kinds) as { events: KindDiff; labResults: KindDiff };
    const events = byKind.events ?? EMPTY;
    const labResults = byKind.labResults ?? EMPTY;

    const onlyLocal = events.onlyLocal + labResults.onlyLocal;
    const onlyCloud = events.onlyCloud + labResults.onlyCloud;
    const changed = events.changed + labResults.changed;

    return {
        events,
        labResults,
        onlyLocal,
        onlyCloud,
        changed,
        hasDifference: onlyLocal + onlyCloud + changed > 0,
    };
}
