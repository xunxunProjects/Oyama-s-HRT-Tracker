// Reconcile a D1 database that predates `wrangler d1 migrations apply`, so the
// numbered migrations can run on it. The Docker entrypoint runs this on every
// start; a Cloudflare deployment runs it through `npm run
// wrangler:migrate:reconcile`. Safe to run any number of times, on any
// database.
//
//   node docker/reconcile.mjs <database> --local --persist-to <dir>
//   node docker/reconcile.mjs <database> --remote
//
// Arguments after the database name go to every `wrangler d1 execute` call.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [database, ...target] = process.argv.slice(2);
if (!database) {
    console.error('Usage: node docker/reconcile.mjs <database> (--local [--persist-to <dir>] | --remote)');
    process.exit(2);
}

// Run wrangler's own script with this node, so the same call works in the
// container, from npm scripts and on Windows.
const wrangler = join(dirname(createRequire(import.meta.url).resolve('wrangler/package.json')), 'bin', 'wrangler.js');
const execute = (args, capture = false) =>
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', database, ...target, '--yes', ...args], {
        encoding: 'utf8',
        stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'],
    });

// A database can hold half of 0005. docker/schema.sql created users.totp_secret,
// but totp_last_step was only added by the worker the first time it checked a
// TOTP code, so a volume from an older image can have the one column and not
// the other. 0005 adds both and fails on the one that exists, and the marker
// records 0005 as applied only when totp_last_step is there. Adding the missing
// column first lets the marker take it.
const columns = JSON.parse(
    execute(
        [
            '--json',
            '--command',
            "SELECT name FROM pragma_table_info('users') WHERE name IN ('totp_secret', 'totp_last_step')",
        ],
        true,
    ),
)[0].results.map(row => row.name);
if (columns.includes('totp_secret') && !columns.includes('totp_last_step')) {
    execute(['--command', 'ALTER TABLE users ADD COLUMN totp_last_step INTEGER']);
}

execute(['--file', fileURLToPath(new URL('mark-applied-migrations.sql', import.meta.url))]);
