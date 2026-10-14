import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { databaseIdsFor, fillDatabaseIds, NOT_IN_BRANCH_BUILDS } from '../scripts/cloudflare-ids.mjs';

const PROD = '11111111-2222-3333-4444-555555555555';
const PREVIEW = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

const idOf = (out: string, anchor: string) => {
    const lines = out.split('\n');
    const start = lines.findIndex(line => line.trim() === anchor);
    const next = lines.findIndex((line, i) => i > start && line.trim().startsWith('['));
    return lines
        .slice(start, next === -1 ? undefined : next)
        .find(line => line.startsWith('database_id'))
        ?.match(/"(.*)"/)?.[1];
};

describe('Cloudflare database IDs', () => {
    it('keeps no database ID in wrangler.toml', () => {
        expect(toml).not.toMatch(/^\s*(database_id|account_id)\s*=/m);
    });

    it('does nothing outside Workers Builds', () => {
        expect(databaseIdsFor({ PRODUCTION_D1_DATABASE_ID: PROD, PREVIEW_D1_DATABASE_ID: PREVIEW })).toBeNull();
    });

    it('gives main both databases, each in its own binding', () => {
        const env = {
            WORKERS_CI: '1',
            WORKERS_CI_BRANCH: 'main',
            PRODUCTION_D1_DATABASE_ID: PROD,
            PREVIEW_D1_DATABASE_ID: PREVIEW,
        };
        const out = fillDatabaseIds(toml, databaseIdsFor(env));
        expect(idOf(out, '[[d1_databases]]')).toBe(PROD);
        expect(idOf(out, '[[previews.d1_databases]]')).toBe(PREVIEW);
        expect(fillDatabaseIds(out, databaseIdsFor(env))).toBe(out);
    });

    it('never gives a branch build the production database', () => {
        const env = {
            WORKERS_CI: '1',
            WORKERS_CI_BRANCH: 'claude/some-branch',
            PRODUCTION_D1_DATABASE_ID: PROD,
            PREVIEW_D1_DATABASE_ID: PREVIEW,
        };
        const out = fillDatabaseIds(toml, databaseIdsFor(env));
        expect(out).not.toContain(PROD);
        expect(idOf(out, '[[d1_databases]]')).toBe(NOT_IN_BRANCH_BUILDS);
        expect(idOf(out, '[[previews.d1_databases]]')).toBe(PREVIEW);
    });

    it('stops the build when an ID is missing, malformed or shared', () => {
        const base = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' };
        expect(() => databaseIdsFor({ ...base, PREVIEW_D1_DATABASE_ID: PREVIEW })).toThrow(/PRODUCTION_D1_DATABASE_ID/);
        expect(() => databaseIdsFor({ ...base, PRODUCTION_D1_DATABASE_ID: PROD })).toThrow(/PREVIEW_D1_DATABASE_ID/);
        expect(() =>
            databaseIdsFor({ ...base, PRODUCTION_D1_DATABASE_ID: 'hrt-tracker-prod', PREVIEW_D1_DATABASE_ID: PREVIEW }),
        ).toThrow(/UUID/);
        expect(() =>
            databaseIdsFor({ ...base, PRODUCTION_D1_DATABASE_ID: PROD, PREVIEW_D1_DATABASE_ID: PROD }),
        ).toThrow(/same/);
        expect(() => databaseIdsFor({ WORKERS_CI: '1', PREVIEW_D1_DATABASE_ID: PREVIEW })).toThrow(/branch/);
    });

    it('refuses a wrangler.toml that already names another database ID', () => {
        const other = toml.replace(
            'database_name = "hrt-tracker-prod"',
            'database_name = "hrt-tracker-prod"\ndatabase_id = "99999999-9999-9999-9999-999999999999"',
        );
        expect(() => fillDatabaseIds(other, { 'hrt-tracker-prod': PROD, 'hrt-tracker-preview': PREVIEW })).toThrow(
            /another ID/,
        );
    });
});
