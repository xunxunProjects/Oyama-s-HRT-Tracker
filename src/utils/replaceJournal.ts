/**
 * Crash-recoverable Replace journal for localStorage.
 *
 * localStorage has no multi-key transaction. A Replace writes one journal key
 * first, containing both the snapshot of every key it will touch and the new
 * values. If the process dies while applying, the next app start restores the
 * snapshot before any state is read. After every write lands the journal moves
 * to `committed`, and recovery then only removes it.
 *
 * This is an application-level transaction, not a browser primitive. The
 * checksum is FNV-1a for accidental-corruption detection only; it is not an
 * authentication tag. A same-origin attacker who can rewrite localStorage can
 * also rewrite the journal.
 */

export interface ReplaceJournalStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface ReplaceJournalEntry {
    key: string;
    value: string | null;
}

export type ReplaceJournalPhase = 'prepared' | 'applying' | 'committed';

export interface ReplaceJournal {
    v: 1;
    phase: ReplaceJournalPhase;
    createdAt: number;
    owner: string;
    writes: ReplaceJournalEntry[];
    snapshot: ReplaceJournalEntry[];
    checksum: string;
}

export const REPLACE_JOURNAL_KEY = 'hrt-replace-journal-v1';
export const REPLACE_PARTIAL_MESSAGE = 'Complete backup replace failed; partial writes may have occurred.';

const PHASES: ReadonlySet<string> = new Set(['prepared', 'applying', 'committed']);

const isEntryArray = (value: unknown): value is ReplaceJournalEntry[] =>
    Array.isArray(value) &&
    value.every(
        entry =>
            !!entry &&
            typeof entry === 'object' &&
            typeof (entry as ReplaceJournalEntry).key === 'string' &&
            ((entry as ReplaceJournalEntry).value === null || typeof (entry as ReplaceJournalEntry).value === 'string'),
    );

/** FNV-1a over the exact JSON we persist; corruption detection, not a MAC. */
export const journalChecksum = (writes: ReplaceJournalEntry[], snapshot: ReplaceJournalEntry[]): string => {
    const text = JSON.stringify({ writes, snapshot });
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
};

const persist = (storage: ReplaceJournalStorage, journal: ReplaceJournal): void => {
    storage.setItem(REPLACE_JOURNAL_KEY, JSON.stringify(journal));
};

const snapshotFor = (storage: ReplaceJournalStorage, writes: ReplaceJournalEntry[]): ReplaceJournalEntry[] =>
    writes.map(write => ({ key: write.key, value: storage.getItem(write.key) }));

const restore = (storage: ReplaceJournalStorage, snapshot: ReplaceJournalEntry[]): boolean => {
    let ok = true;
    for (const entry of snapshot) {
        try {
            if (entry.value === null) storage.removeItem(entry.key);
            else storage.setItem(entry.key, entry.value);
        } catch {
            ok = false;
        }
    }
    return ok;
};

/**
 * Apply a set of localStorage writes through a journal. The caller validates
 * the bundle first; this function only owns the crash/rollback boundary.
 * Returns after the journal is removed. Throws before the first target write if
 * the journal itself cannot be stored.
 */
export function applyReplaceJournal(
    storage: ReplaceJournalStorage,
    owner: string,
    writes: ReplaceJournalEntry[],
): void {
    if (writes.length === 0) return;
    const snapshot = snapshotFor(storage, writes);
    const journal: ReplaceJournal = {
        v: 1,
        phase: 'prepared',
        createdAt: Date.now(),
        owner,
        writes,
        snapshot,
        checksum: journalChecksum(writes, snapshot),
    };

    // One key, before any target: a quota failure here leaves the device
    // untouched.
    persist(storage, journal);
    journal.phase = 'applying';
    persist(storage, journal);

    try {
        for (const write of writes) {
            if (write.value === null) storage.removeItem(write.key);
            else storage.setItem(write.key, write.value);
        }
        journal.phase = 'committed';
        persist(storage, journal);
        try {
            storage.removeItem(REPLACE_JOURNAL_KEY);
        } catch {
            // Recovery sees `committed` and only removes the journal.
        }
    } catch (err) {
        if (restore(storage, snapshot)) {
            try {
                storage.removeItem(REPLACE_JOURNAL_KEY);
            } catch {
                // A committed journal cannot be written here; recovery would
                // see `applying` and restore the snapshot again, which is
                // idempotent.
            }
            throw err;
        }
        throw new Error(REPLACE_PARTIAL_MESSAGE, { cause: err });
    }
}

const parseJournal = (raw: string): ReplaceJournal => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Replace journal is not valid JSON; refusing to read partial data.');
    }
    if (!parsed || typeof parsed !== 'object') throw new Error('Replace journal is not an object.');
    const journal = parsed as Partial<ReplaceJournal>;
    if (
        journal.v !== 1 ||
        typeof journal.phase !== 'string' ||
        !PHASES.has(journal.phase) ||
        typeof journal.createdAt !== 'number' ||
        typeof journal.owner !== 'string' ||
        !isEntryArray(journal.writes) ||
        !isEntryArray(journal.snapshot) ||
        typeof journal.checksum !== 'string'
    ) {
        throw new Error('Replace journal has an unsupported shape.');
    }
    const checksum = journalChecksum(journal.writes, journal.snapshot);
    if (checksum !== journal.checksum) {
        throw new Error('Replace journal checksum does not match; refusing to read partial data.');
    }
    return journal as ReplaceJournal;
};

/**
 * Run before the app reads any storage. Missing journal = nothing to do.
 * `committed` finishes a replace that had already written every key; any other
 * phase restores the pre-replace snapshot.
 */
export function recoverReplaceJournal(storage: ReplaceJournalStorage): 'none' | 'rolled-back' | 'completed' {
    const raw = storage.getItem(REPLACE_JOURNAL_KEY);
    if (raw === null) return 'none';
    const journal = parseJournal(raw);
    if (journal.phase === 'committed') {
        storage.removeItem(REPLACE_JOURNAL_KEY);
        return 'completed';
    }
    if (!restore(storage, journal.snapshot)) {
        throw new Error('Could not restore the pre-replace snapshot; the journal was kept for another attempt.');
    }
    storage.removeItem(REPLACE_JOURNAL_KEY);
    return 'rolled-back';
}
