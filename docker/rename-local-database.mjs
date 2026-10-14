// Keep a local D1 database when wrangler.toml stopped carrying its ID.
//
// Wrangler names a local D1 file after a hash of the binding's `database_id`,
// or of the binding name when there is no ID. wrangler.toml used to list the
// production ID, so a Docker volume or a local `.wrangler/state` made before
// that change keeps its data in the file for the old ID, and Wrangler now
// looks for the file named after "DB". This renames the old file to the new
// name. It runs before Wrangler opens anything, and does nothing once the
// old file is gone, so it is safe on every start.
//
//   node docker/rename-local-database.mjs [persist dir, default .wrangler/state]
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const OLD = '34752014049e12507d327341e4be71f47c6ff86827c51bb086ac8d8ed138930b';
const NEW = 'e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d';

const dir = join(process.argv[2] ?? '.wrangler/state', 'v3', 'd1', 'miniflare-D1DatabaseObject');
const file = (hash, suffix = '') => join(dir, `${hash}.sqlite${suffix}`);

if (existsSync(file(OLD))) {
    if (existsSync(file(NEW))) {
        console.error(
            `Two local databases found in ${dir}: ${OLD}.sqlite (from before the move) and ${NEW}.sqlite. ` +
                `Leaving both alone; the app uses ${NEW}.sqlite. Move the one you want to keep into place by hand.`,
        );
    } else {
        // The -wal file can hold writes not yet in the main file; move it too.
        for (const suffix of ['', '-wal', '-shm']) {
            if (existsSync(file(OLD, suffix))) renameSync(file(OLD, suffix), file(NEW, suffix));
        }
        console.log(`Moved the local database in ${dir} to its new file name.`);
    }
}
