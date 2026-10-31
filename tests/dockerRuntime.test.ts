import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The runtime Docker image copies a whitelist of TypeScript modules rather
// than the whole build context. A new local import in worker.ts (as
// contentStore.ts and toolApi.ts were) otherwise builds fine in CI but makes
// the shipped image fail at startup with "Could not resolve". This walks the
// local import graph and proves every reachable module is copied.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');

const copied = new Set<string>();
for (const line of dockerfile.split('\n')) {
    const match = /^COPY --from=build \/app\/(\S+) \.\/(.+)$/.exec(line.trim());
    if (match) copied.add(match[2].trim());
}

function localImports(file: string): string[] {
    const source = readFileSync(resolve(root, file), 'utf8');
    const imports: string[] = [];
    for (const match of source.matchAll(/(?:from\s+|import\s+)['"](\.[^'"]+)['"]/g)) {
        let target = resolve(root, dirname(file), match[1]);
        if (!target.endsWith('.ts')) target += '.ts';
        const relative = target.slice(root.length + 1);
        imports.push(relative);
    }
    return imports;
}

function reachableModules(entry: string): Set<string> {
    const seen = new Set<string>();
    const pending = [entry];
    while (pending.length > 0) {
        const file = pending.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const next of localImports(file)) {
            expect(existsSync(resolve(root, next)), `import ${next} from ${file} must exist`).toBe(true);
            pending.push(next);
        }
    }
    return seen;
}

describe('Docker runtime image', () => {
    it('copies every module reachable from worker.ts', () => {
        const modules = [...reachableModules('worker.ts')].sort();
        const missing = modules.filter(file => !copied.has(file));
        expect(missing).toEqual([]);
    });

    it('disables Wrangler Local Explorer in the shipped runtime', () => {
        const entrypoint = readFileSync(resolve(root, 'docker/entrypoint.sh'), 'utf8');
        // `wrangler dev` serves an unauthenticated D1/R2 admin API on the same
        // listener. The Docker image must not expose it.
        expect(entrypoint).toMatch(/^export X_LOCAL_EXPLORER=false$/m);
        expect(entrypoint).toMatch(/^export X_LOCAL_OBSERVABILITY=false$/m);
    });

    it('defaults a self-hosted container to no trusted client-IP header', () => {
        const entrypoint = readFileSync(resolve(root, 'docker/entrypoint.sh'), 'utf8');
        expect(entrypoint).toContain('dotenv_line TRUSTED_IP_SOURCE "${TRUSTED_IP_SOURCE:-none}"');
    });

    it('keeps the committed Cloudflare configuration on the CF header', () => {
        const wrangler = readFileSync(resolve(root, 'wrangler.toml'), 'utf8');
        expect(wrangler).toMatch(/\[vars\][\s\S]*TRUSTED_IP_SOURCE = "cf"/);
    });
});
