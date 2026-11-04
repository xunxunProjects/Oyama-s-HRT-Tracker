import type { TombstoneMap, Tombstones } from './types';
import { TOMBSTONE_MAX_PER_KIND, TOMBSTONE_TTL_MS, hasOwn, nullMap } from './types';

export function asTimestamp(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
}

export function sanitizeTombstoneMap(raw: unknown): TombstoneMap {
    const out: TombstoneMap = nullMap();
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
    const out = nullMap<number>();
    for (const [id, at] of live) out[id] = at;
    return out;
}

export function pruneTombstones(t: Tombstones, now: number): Tombstones {
    return {
        events: pruneTombstoneMap(t.events, now),
        labResults: pruneTombstoneMap(t.labResults, now),
        doseTemplates: pruneTombstoneMap(t.doseTemplates, now),
    };
}

export function mergeTombstoneMaps(a: TombstoneMap, b: TombstoneMap): TombstoneMap {
    const out: TombstoneMap = nullMap();
    for (const [id, at] of Object.entries(a)) out[id] = at;
    for (const [id, at] of Object.entries(b)) {
        if (!hasOwn(out, id) || at > out[id]) out[id] = at;
    }
    return out;
}
