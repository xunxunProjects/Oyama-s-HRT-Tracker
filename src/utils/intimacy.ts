import { v4 as uuidv4 } from 'uuid';
import { EVENT_TIME_H_MAX, EVENT_TIME_H_MIN } from '../../logic';

/**
 * Sexual activity records (beta, off unless switched on in Settings).
 *
 * Written for everyone: nothing here assumes a body, a partner's gender or an
 * orientation. A record says who it was with in the broadest terms and, only
 * if the person wants to note them, a few things anybody can answer.
 */
export type IntimacyKind = 'solo' | 'partnered' | 'other';
export const INTIMACY_KINDS: readonly IntimacyKind[] = ['solo', 'partnered', 'other'];

export interface IntimacyRecord {
    id: string;
    /** Hours since 1970, like a dose. */
    timeH: number;
    kind: IntimacyKind;
    /** Absent = not noted. */
    orgasm?: boolean;
    /** Minutes. Absent = not noted. */
    durationMin?: number;
    /** 1 to 5. Absent = not noted. */
    satisfaction?: number;
    note?: string;
    /** Epoch ms of the last edit, for sync. */
    updatedAt?: number;
}

export const INTIMACY_NOTE_MAX = 500;
export const INTIMACY_DURATION_MAX = 24 * 60;
export const INTIMACY_MAX_ENTRIES = 20000;

/** The Settings switch. Kept on this device, like the other display choices. */
export const INTIMACY_BETA_KEY = 'app-intimacy-beta';

export const isIntimacyKind = (v: unknown): v is IntimacyKind =>
    typeof v === 'string' && (INTIMACY_KINDS as readonly string[]).includes(v);

/** One record from storage, a file or the cloud; null when it can't be read as one. */
export const normalizeIntimacyRecord = (raw: unknown): IntimacyRecord | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const timeH = Number(r.timeH);
    if (!Number.isFinite(timeH) || timeH < EVENT_TIME_H_MIN || timeH > EVENT_TIME_H_MAX) return null;
    if (!isIntimacyKind(r.kind)) return null;
    const out: IntimacyRecord = {
        id: typeof r.id === 'string' && r.id ? r.id : uuidv4(),
        timeH,
        kind: r.kind,
    };
    if (typeof r.orgasm === 'boolean') out.orgasm = r.orgasm;
    const duration = Number(r.durationMin);
    if (r.durationMin !== undefined && r.durationMin !== null && Number.isFinite(duration) && duration > 0) {
        out.durationMin = Math.min(INTIMACY_DURATION_MAX, Math.round(duration));
    }
    const sat = Number(r.satisfaction);
    if (Number.isInteger(sat) && sat >= 1 && sat <= 5) out.satisfaction = sat;
    if (typeof r.note === 'string' && r.note.trim()) out.note = r.note.slice(0, INTIMACY_NOTE_MAX);
    const at = Number(r.updatedAt);
    if (Number.isFinite(at) && at > 0) out.updatedAt = at;
    return out;
};

export const sanitizeImportedIntimacy = (raw: unknown): IntimacyRecord[] => {
    if (!Array.isArray(raw)) return [];
    if (raw.length > INTIMACY_MAX_ENTRIES) throw new Error('Too many entries');
    return raw.map(normalizeIntimacyRecord).filter((x): x is IntimacyRecord => x !== null);
};
