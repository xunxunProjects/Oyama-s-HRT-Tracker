// Write the D1 database IDs into wrangler.toml during a Cloudflare Workers
// Builds run, so the repository itself carries no Cloudflare IDs. `npm run
// build` calls this first. Outside Workers Builds (local builds, GitHub CI,
// Docker, Tauri) it does nothing.
//
// Workers Builds sets WORKERS_CI and WORKERS_CI_BRANCH. The IDs come from two
// build variables set once in the Worker's Settings > Build:
//
//   PRODUCTION_D1_DATABASE_ID  hrt-tracker-prod, used by builds of main
//   PREVIEW_D1_DATABASE_ID     hrt-tracker-preview, used by every other branch
//
// A missing or malformed ID stops the build here, before `wrangler deploy` or
// `wrangler preview` runs. Without this, Wrangler would look the database up by
// name, and create a new empty one if that lookup ever found nothing.
//
// Branch builds never get the production ID. Their top-level binding gets a
// value Cloudflare rejects instead, so a command that deploys the top-level
// bindings from a branch (the old `wrangler versions upload`) fails rather than
// binding production data.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_BRANCH = 'main';
export const NOT_IN_BRANCH_BUILDS = 'no-production-database-in-branch-builds';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const DATABASES = [
    { anchor: '[[d1_databases]]', name: 'hrt-tracker-prod' },
    { anchor: '[[previews.d1_databases]]', name: 'hrt-tracker-preview' },
];

function requireId(env, variable, databaseName) {
    const value = (env[variable] ?? '').trim();
    if (!value) {
        throw new Error(
            `${variable} is not set. Add it under Settings > Build > Variables and secrets of the ` +
                `Worker, with the ID of the D1 database "${databaseName}".`,
        );
    }
    if (!UUID.test(value)) {
        throw new Error(`${variable} must be a D1 database ID (a UUID), got "${value}".`);
    }
    return value;
}

// Returns the IDs to write for this build, or null outside Workers Builds.
export function databaseIdsFor(env) {
    if (!env.WORKERS_CI) return null;
    const branch = env.WORKERS_CI_BRANCH;
    if (!branch) throw new Error('WORKERS_CI is set but WORKERS_CI_BRANCH is not, so the branch is unknown.');
    const preview = requireId(env, 'PREVIEW_D1_DATABASE_ID', 'hrt-tracker-preview');
    if (branch !== PRODUCTION_BRANCH) {
        return { 'hrt-tracker-prod': NOT_IN_BRANCH_BUILDS, 'hrt-tracker-preview': preview };
    }
    const production = requireId(env, 'PRODUCTION_D1_DATABASE_ID', 'hrt-tracker-prod');
    if (production === preview) {
        throw new Error('PRODUCTION_D1_DATABASE_ID and PREVIEW_D1_DATABASE_ID are the same; previews need their own.');
    }
    return { 'hrt-tracker-prod': production, 'hrt-tracker-preview': preview };
}

// Adds `database_id` under each binding's `database_name` line. Running it again
// on its own output changes nothing; any other `database_id` is an error.
export function fillDatabaseIds(toml, ids) {
    const lines = toml.split('\n');
    for (const { anchor, name } of DATABASES) {
        const id = ids[name];
        const nameLine = `database_name = "${name}"`;
        const idLine = `database_id = "${id}"`;
        const at = lines.flatMap((line, i) => (line.trim() === nameLine ? [i] : []));
        if (at.length !== 1) throw new Error(`Expected one \`${nameLine}\` line in wrangler.toml, found ${at.length}.`);
        const header = lines.slice(0, at[0]).findLast(line => line.trim().startsWith('['));
        if (header?.trim() !== anchor) throw new Error(`\`${nameLine}\` must sit under ${anchor} in wrangler.toml.`);
        const next = lines[at[0] + 1]?.trim() ?? '';
        if (next === idLine) continue;
        if (next.startsWith('database_id')) throw new Error(`wrangler.toml already has another ID for "${name}".`);
        lines.splice(at[0] + 1, 0, idLine);
    }
    const out = lines.join('\n');
    const idCount = out.split('\n').filter(line => line.trim().startsWith('database_id')).length;
    if (idCount !== DATABASES.length) {
        throw new Error(`wrangler.toml should end up with ${DATABASES.length} database_id lines, has ${idCount}.`);
    }
    return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const ids = databaseIdsFor(process.env);
        if (ids) {
            const path = new URL('../wrangler.toml', import.meta.url);
            writeFileSync(path, fillDatabaseIds(readFileSync(path, 'utf8'), ids));
            const kind = process.env.WORKERS_CI_BRANCH === PRODUCTION_BRANCH ? 'production and preview' : 'preview';
            console.log(`cloudflare-ids: wrote the ${kind} D1 database IDs into wrangler.toml`);
        }
    } catch (error) {
        console.error(`cloudflare-ids: ${error.message}`);
        process.exit(1);
    }
}
