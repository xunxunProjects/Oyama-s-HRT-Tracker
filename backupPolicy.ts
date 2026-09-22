/**
 * Cloud backup policy, shared by the worker and the client.
 *
 * Its own module rather than part of logic.ts so the worker bundle doesn't
 * have to pull the pharmacokinetic model in for a few numbers.
 *
 * Every revision is a full copy of the user's data, so what is kept here is
 * what sets the size of the `content` table. At ten copies per user, retained
 * purely by count, the table was ~95% of the production D1 database and drove
 * it into the size cap, where inserts fail with "Exceeded maximum DB size".
 */

/** Revisions kept per account. The Account page shows "n/MAX_CLOUD_BACKUPS". */
export const MAX_CLOUD_BACKUPS = 5;

/**
 * Largest request body the backup endpoint accepts. The client checks its own
 * payload against this before uploading, so an account that has outgrown it is
 * told so, instead of retrying a 413 forever.
 */
export const MAX_CLOUD_BACKUP_BYTES = 2 * 1024 * 1024;

/**
 * How far behind the newest revision each retained generation should sit, in
 * seconds. One slot each for "about an hour ago", "yesterday", "last week" and
 * "last month"; whatever slots are left over hold the most recent revisions.
 *
 * Retaining by count alone made the list a burst log: the client uploads a
 * few seconds after every edit, so five edits in a minute evicted every
 * snapshot from before the mistake the user was trying to undo.
 */
export const BACKUP_RETENTION_HORIZONS_S: readonly number[] = [
    60 * 60,
    24 * 60 * 60,
    7 * 24 * 60 * 60,
    30 * 24 * 60 * 60,
];

export interface BackupRevision {
    id: string;
    /** Unix seconds. */
    created_at: number;
}

/**
 * Which of an account's revisions to keep after a new one has been written.
 *
 * The newest is always kept. Each horizon then claims the newest revision at
 * least that far behind it, and any slots still free go to the most recent
 * revisions not yet claimed, until `max` are held. A horizon with nothing old
 * enough behind it claims nothing, so a new account keeps its `max` newest
 * and the generational spread appears as history accumulates.
 *
 * `justWrittenId` is the revision this prune follows. Timestamps are whole
 * seconds, so two devices writing in the same second tie, and the row that
 * was just written must not lose that tie: the client remembers its id as
 * the revision it reconciled with, and the data in it is the newest there is.
 */
export function selectBackupsToKeep(
    revisions: readonly BackupRevision[],
    justWrittenId: string | null = null,
    max: number = MAX_CLOUD_BACKUPS,
): Set<string> {
    const keep = new Set<string>();
    if (revisions.length === 0 || max <= 0) return keep;

    const newestFirst = [...revisions].sort((a, b) =>
        (b.id === justWrittenId ? 1 : 0) - (a.id === justWrittenId ? 1 : 0)
        || b.created_at - a.created_at
        || (a.id < b.id ? 1 : -1));
    const newest = newestFirst[0];
    keep.add(newest.id);

    for (const horizon of BACKUP_RETENTION_HORIZONS_S) {
        if (keep.size >= max) break;
        const cutoff = newest.created_at - horizon;
        const candidate = newestFirst.find(r => r.created_at <= cutoff && !keep.has(r.id));
        if (candidate) keep.add(candidate.id);
    }

    for (const r of newestFirst) {
        if (keep.size >= max) break;
        keep.add(r.id);
    }
    return keep;
}
