/**
 * Cloud backup retention, shared by the worker and the client.
 *
 * The worker prunes each account to this many revisions after every upload;
 * the Account page shows "n/MAX" next to the backup button. It lives in its
 * own module rather than in logic.ts so the worker bundle doesn't have to
 * pull the pharmacokinetic model in to learn one number.
 *
 * Every revision is a full copy of the user's data, so this count is what
 * sets the size of the `content` table. At ten it was ~95% of the production
 * D1 database and drove it into the size cap, where inserts fail with
 * "Exceeded maximum DB size". The client only ever probes the newest three
 * (MAX_BACKUP_PROBES in useCloudSync), so five leaves headroom.
 */
export const MAX_CLOUD_BACKUPS = 5;
