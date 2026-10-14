// The shape of a dosage share snapshot, and the check that rebuilds one from
// untrusted input. The worker used to be the only place this ran. Snapshots
// are now encrypted in the sender's browser, so the server cannot look inside
// them any more: the sender runs this before encrypting, so no stray
// account or profile field is ever sealed into a link, and the viewer runs it
// after decrypting, so a page never renders a payload it does not expect.

export const MAX_SHARE_EVENTS = 10_000;
export const MAX_SHARE_SIMULATION_POINTS = 100_000;
export const SHARE_ROUTES = new Set(['sublingual', 'injection', 'patchApply', 'patchRemove', 'gel', 'oral']);
export const SHARE_ESTERS = new Set([
    'E2',
    'EB',
    'EV',
    'EC',
    'EN',
    'EU',
    'CPA',
    'SPIRO',
    'BICA',
    'MPA',
    'LEUP',
    'TRIP',
    'RLX',
    'T',
    'TC',
    'TE',
    'TU',
]);
export const TRANSFEM_ESTERS = new Set([
    'E2',
    'EB',
    'EV',
    'EC',
    'EN',
    'EU',
    'CPA',
    'SPIRO',
    'BICA',
    'MPA',
    'LEUP',
    'TRIP',
    'RLX',
]);
export const TRANSMASC_ESTERS = new Set(['T', 'TC', 'TE', 'TU']);
export const SHARE_EXTRA_KEYS = new Set([
    'concentrationMGmL',
    'areaCM2',
    'releaseRateUGPerDay',
    'sublingualTheta',
    'sublingualTier',
    'gelSite',
    'patchWearH',
]);

export interface DosageShareSnapshot {
    version: 1;
    mode: 'transfem' | 'transmasc';
    timezone: string;
    createdAt: number;
    events: Array<{
        id: string;
        route: string;
        timeH: number;
        doseMG: number;
        ester: string;
        extras: Record<string, number>;
    }>;
    simulation: null | {
        timeH: number[];
        concPGmL: number[];
        concPGmL_E2: number[];
        concPGmL_CPA: number[];
        concNGdL_T: number[];
        auc: number;
    };
}

export function isJsonObject(value: unknown): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isValidIanaTimezone(value: unknown): value is string {
    if (typeof value !== 'string' || value.length < 1 || value.length > 100) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);
        return true;
    } catch {
        return false;
    }
}

export function sanitizeShareSnapshot(raw: unknown): { snapshot?: DosageShareSnapshot; error?: string } {
    if (!isJsonObject(raw)) return { error: 'snapshot must be an object' };
    if (raw.version !== 1) return { error: 'snapshot.version must be 1' };
    if (raw.mode !== 'transfem' && raw.mode !== 'transmasc') return { error: 'snapshot.mode is invalid' };
    if (!isValidIanaTimezone(raw.timezone)) return { error: 'snapshot.timezone must be a valid IANA timezone' };
    if (
        typeof raw.createdAt !== 'number' ||
        !Number.isSafeInteger(raw.createdAt) ||
        raw.createdAt <= 0 ||
        raw.createdAt > 8_640_000_000_000_000
    ) {
        return { error: 'snapshot.createdAt must be a valid epoch-millisecond timestamp' };
    }
    if (!Array.isArray(raw.events)) return { error: 'snapshot.events must be an array' };
    if (raw.events.length > MAX_SHARE_EVENTS)
        return { error: `snapshot.events may contain at most ${MAX_SHARE_EVENTS} entries` };

    const modeEsters = raw.mode === 'transfem' ? TRANSFEM_ESTERS : TRANSMASC_ESTERS;
    const eventIds = new Set<string>();
    const events: DosageShareSnapshot['events'] = [];
    for (let i = 0; i < raw.events.length; i++) {
        const event = raw.events[i];
        const path = `snapshot.events[${i}]`;
        if (!isJsonObject(event)) return { error: `${path} must be an object` };
        if (typeof event.id !== 'string' || event.id.length < 1 || event.id.length > 128)
            return { error: `${path}.id is invalid` };
        if (eventIds.has(event.id)) return { error: `${path}.id must be unique` };
        eventIds.add(event.id);
        if (typeof event.route !== 'string' || !SHARE_ROUTES.has(event.route))
            return { error: `${path}.route is invalid` };
        if (typeof event.ester !== 'string' || !SHARE_ESTERS.has(event.ester) || !modeEsters.has(event.ester))
            return { error: `${path}.ester is invalid for this mode` };
        if (typeof event.timeH !== 'number' || !Number.isFinite(event.timeH) || Math.abs(event.timeH) > 100_000_000)
            return { error: `${path}.timeH is invalid` };
        if (
            typeof event.doseMG !== 'number' ||
            !Number.isFinite(event.doseMG) ||
            event.doseMG < 0 ||
            event.doseMG > 1_000_000
        )
            return { error: `${path}.doseMG is invalid` };
        if (!isJsonObject(event.extras)) return { error: `${path}.extras must be an object` };

        const extras: Record<string, number> = {};
        for (const [key, value] of Object.entries(event.extras)) {
            if (!SHARE_EXTRA_KEYS.has(key)) return { error: `${path}.extras contains an unsupported field` };
            if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1_000_000_000)
                return { error: `${path}.extras.${key} is invalid` };
            extras[key] = value;
        }
        events.push({
            id: event.id,
            route: event.route,
            timeH: event.timeH,
            doseMG: event.doseMG,
            ester: event.ester,
            extras,
        });
    }

    let simulation: DosageShareSnapshot['simulation'] = null;
    if (raw.simulation !== null) {
        if (!isJsonObject(raw.simulation)) return { error: 'snapshot.simulation must be an object or null' };
        const arrayFields = ['timeH', 'concPGmL', 'concPGmL_E2', 'concPGmL_CPA', 'concNGdL_T'] as const;
        const arrays: Record<(typeof arrayFields)[number], number[]> = {} as any;
        let pointCount: number | null = null;
        for (const field of arrayFields) {
            const values = raw.simulation[field];
            if (!Array.isArray(values)) return { error: `snapshot.simulation.${field} must be an array` };
            if (values.length > MAX_SHARE_SIMULATION_POINTS)
                return { error: `snapshot.simulation may contain at most ${MAX_SHARE_SIMULATION_POINTS} points` };
            if (pointCount === null) pointCount = values.length;
            if (values.length !== pointCount) return { error: 'snapshot.simulation arrays must have equal lengths' };
            const clean: number[] = [];
            for (let i = 0; i < values.length; i++) {
                const value = values[i];
                if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e20) {
                    return { error: `snapshot.simulation.${field}[${i}] is invalid` };
                }
                clean.push(value);
            }
            arrays[field] = clean;
        }
        for (let i = 1; i < arrays.timeH.length; i++) {
            if (arrays.timeH[i] < arrays.timeH[i - 1]) return { error: 'snapshot.simulation.timeH must be sorted' };
        }
        if (
            typeof raw.simulation.auc !== 'number' ||
            !Number.isFinite(raw.simulation.auc) ||
            Math.abs(raw.simulation.auc) > 1e30
        ) {
            return { error: 'snapshot.simulation.auc is invalid' };
        }
        simulation = {
            timeH: arrays.timeH,
            concPGmL: arrays.concPGmL,
            concPGmL_E2: arrays.concPGmL_E2,
            concPGmL_CPA: arrays.concPGmL_CPA,
            concNGdL_T: arrays.concNGdL_T,
            auc: raw.simulation.auc,
        };
    }

    return {
        snapshot: {
            version: 1,
            mode: raw.mode,
            timezone: raw.timezone,
            createdAt: raw.createdAt,
            events,
            simulation,
        },
    };
}

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Ceiling on a sealed snapshot's ciphertext. A little under the 2 MiB request
 * limit the plaintext form had, so the envelope and the rest of the request
 * body still fit around it.
 */
export const MAX_ENCRYPTED_SHARE_BYTES = 2 * 1024 * 1024 - 64 * 1024;

/**
 * A snapshot sealed in the sender's browser with AES-256-GCM. The key lives
 * only in the share link's fragment, which browsers never send to a server.
 * `z` says whether the JSON was gzip-compressed before sealing.
 */
export interface EncryptedShareSnapshot {
    e2ee: 1;
    z: 0 | 1;
    iv: string;
    data: string;
}

export function sanitizeEncryptedShareSnapshot(raw: unknown): { envelope?: EncryptedShareSnapshot; error?: string } {
    if (!isJsonObject(raw)) return { error: 'encryptedSnapshot must be an object' };
    if (raw.e2ee !== 1) return { error: 'encryptedSnapshot.e2ee must be 1' };
    if (raw.z !== 0 && raw.z !== 1) return { error: 'encryptedSnapshot.z must be 0 or 1' };
    // 12 random bytes, base64.
    if (typeof raw.iv !== 'string' || raw.iv.length !== 16 || !BASE64_REGEX.test(raw.iv))
        return { error: 'encryptedSnapshot.iv is invalid' };
    if (
        typeof raw.data !== 'string' ||
        raw.data.length < 24 ||
        raw.data.length > MAX_ENCRYPTED_SHARE_BYTES ||
        raw.data.length % 4 !== 0 ||
        !BASE64_REGEX.test(raw.data)
    )
        return { error: 'encryptedSnapshot.data is invalid' };
    return { envelope: { e2ee: 1, z: raw.z, iv: raw.iv, data: raw.data } };
}
