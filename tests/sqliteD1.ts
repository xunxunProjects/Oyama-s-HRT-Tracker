// A real SQLite engine (node:sqlite) with every migration applied, behind a
// thin D1-shaped adapter, for the tests that drive worker.fetch() end to end.
// This checks the SQL and the flow, not D1's deployment behavior.

export interface SqliteDatabase {
    exec(sql: string): void;
    prepare(sql: string): {
        get(...values: unknown[]): unknown;
        run(...values: unknown[]): { changes: number | bigint };
        all(...values: unknown[]): unknown[];
    };
}

const sqliteSpecifier = 'node:sqlite';
const fsSpecifier = 'node:fs';
let sqliteModule: { DatabaseSync: new (path: string, options?: Record<string, unknown>) => SqliteDatabase } | null =
    null;
let fsModule: { readdirSync: (path: URL) => string[]; readFileSync: (path: URL, encoding: 'utf8') => string } | null =
    null;
try {
    sqliteModule = (await import(/* @vite-ignore */ sqliteSpecifier)) as typeof sqliteModule;
} catch {
    sqliteModule = null;
}
try {
    fsModule = (await import(/* @vite-ignore */ fsSpecifier)) as typeof fsModule;
} catch {
    fsModule = null;
}

/** False on a Node without node:sqlite. */
export const hasSqlite = sqliteModule !== null && fsModule !== null;

/** A fresh in-memory database with every migration in migrations/ applied, in order. */
export function migratedDatabase(): SqliteDatabase {
    const db = new sqliteModule!.DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
    const migrationDir = new URL('../migrations/', import.meta.url);
    for (const file of fsModule!
        .readdirSync(migrationDir)
        .filter(name => name.endsWith('.sql'))
        .sort()) {
        db.exec(fsModule!.readFileSync(new URL(file, migrationDir), 'utf8'));
    }
    return db;
}

/** The subset of D1's API the Worker uses. */
export function d1(db: SqliteDatabase) {
    return {
        async batch(statements: Array<{ run(): Promise<unknown> }>) {
            const results = [];
            for (const statement of statements) results.push(await statement.run());
            return results;
        },
        prepare(sql: string) {
            // D1 accepts ?1/?2 numbered parameters; node:sqlite does not, so
            // rewrite them to plain ? and reorder the bound values.
            const order: number[] = [];
            const rewritten = sql.replace(/\?(\d+)/g, (_match, index: string) => {
                order.push(Number(index));
                return '?';
            });
            let args: unknown[] = [];
            const statement = {
                bind(...values: unknown[]) {
                    args = order.length > 0 ? order.map(index => values[index - 1]) : values;
                    return statement;
                },
                async first() {
                    return db.prepare(rewritten).get(...args) ?? null;
                },
                async run() {
                    const result = db.prepare(rewritten).run(...args);
                    return { success: true, meta: { changes: Number(result.changes) } };
                },
                async all() {
                    return { success: true, results: db.prepare(rewritten).all(...args) };
                },
            };
            return statement;
        },
    };
}
