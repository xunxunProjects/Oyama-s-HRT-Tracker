// An older Docker/Cloudflare volume can acquire 0017's column through the
// worker's lazy donation DDL before the migration ledger records 0017. The
// reconciliation must mark it applied, or the unconditional ADD COLUMN in 0017
// fails and startup stops.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasSqlite } from './sqliteD1';

interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
        all(...values: unknown[]): unknown[];
        get(...values: unknown[]): unknown;
        run(...values: unknown[]): unknown;
    };
}

let databaseSync: (new (path: string) => SqliteDatabase) | null = null;
if (hasSqlite) {
    const sqlite = (await import(/* @vite-ignore */ 'node:sqlite')) as unknown as {
        DatabaseSync: new (path: string) => SqliteDatabase;
    };
    databaseSync = sqlite.DatabaseSync;
}

const migrationsDir = new URL('../migrations/', import.meta.url);
const markerSql = readFileSync(new URL('../docker/mark-applied-migrations.sql', import.meta.url), 'utf8');
const migrationNames = readdirSync(fileURLToPath(migrationsDir))
    .filter(name => name.endsWith('.sql'))
    .sort();

/** A volume that ran migrations up to 0016 and then let the worker add 0017's column lazily. */
const oldVolume = (): SqliteDatabase => {
    const db = new databaseSync!(':memory:');
    db.exec(`CREATE TABLE d1_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`);
    for (const name of migrationNames.filter(name => name < '0017_donation_trocador.sql')) {
        db.exec(readFileSync(new URL(name, migrationsDir), 'utf8'));
        db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
    }
    db.exec(
        `ALTER TABLE donation_addresses ADD COLUMN monero_payout_address TEXT NOT NULL DEFAULT '';
         CREATE TABLE IF NOT EXISTS donation_trades (
             id TEXT PRIMARY KEY,
             status TEXT NOT NULL,
             ticker_from TEXT,
             network_from TEXT,
             amount_from TEXT,
             amount_to TEXT,
             payload TEXT,
             created_at INTEGER NOT NULL DEFAULT (unixepoch()),
             updated_at INTEGER NOT NULL DEFAULT (unixepoch())
         );`,
    );
    return db;
};

/** Reproduce `wrangler d1 migrations apply`: run only what the ledger says is pending. */
const applyPending = (db: SqliteDatabase): void => {
    const applied = new Set(
        db
            .prepare('SELECT name FROM d1_migrations')
            .all()
            .map(row => (row as { name: string }).name),
    );
    for (const name of migrationNames) {
        if (!applied.has(name)) db.exec(readFileSync(new URL(name, migrationsDir), 'utf8'));
    }
};

describe('Docker migration reconciliation', () => {
    it.skipIf(!hasSqlite)('lets an old volume with a lazily added donation column upgrade cleanly', () => {
        const db = oldVolume();
        db.exec(markerSql);
        expect(() => applyPending(db)).not.toThrow();
    });

    it.skipIf(!hasSqlite)('keeps all migrations pending on a fresh database', () => {
        const db = new databaseSync!(':memory:');
        db.exec(markerSql);
        expect(db.prepare('SELECT name FROM d1_migrations').all()).toEqual([]);
        expect(() => applyPending(db)).not.toThrow();
    });
});
