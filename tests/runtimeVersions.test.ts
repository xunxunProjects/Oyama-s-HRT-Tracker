import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Node 22.23.4 is the 2026-10-21 security release for CVE-2026-111497
// (Brotli RCE), CVE-2026-105482 (DNS NUL truncation) and CVE-2026-106069
// (TLS hostname bypass). Build and runtime images must not float on 22.
const MIN_NODE = [22, 23, 4] as const;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function atLeastMinimum(version: string): boolean {
    const parts = version.split('.').map(part => Number.parseInt(part, 10));
    for (let index = 0; index < MIN_NODE.length; index++) {
        const actual = parts[index] ?? 0;
        if (actual !== MIN_NODE[index]) return actual > MIN_NODE[index];
    }
    return true;
}

function versionsIn(file: string, pattern: RegExp): string[] {
    const source = readFileSync(resolve(root, file), 'utf8');
    return [...source.matchAll(pattern)].map(match => match[1]);
}

describe('Node security baseline', () => {
    it('pins both Docker stages to the patched Node 22 release', () => {
        const versions = versionsIn('Dockerfile', /^FROM node:(\d+\.\d+\.\d+)-bookworm-slim/gm);
        expect(versions).toHaveLength(2);
        for (const version of versions) {
            expect(atLeastMinimum(version), `Dockerfile uses Node ${version}`).toBe(true);
        }
    });

    it('never drops the workflows below Node 22', () => {
        // `node-version: 22` resolves to the latest 22.x, which includes the
        // October 2026 security release. An exact pin is preferable, but the
        // shipped Docker runtime is the artifact that must never float.
        for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
            const versions = versionsIn(file, /node-version:\s*['"]?([0-9.]+)['"]?/g);
            expect(versions.length, `${file} has no node-version`).toBeGreaterThan(0);
            for (const version of versions) {
                expect(Number.parseInt(version, 10), `${file} uses Node ${version}`).toBeGreaterThanOrEqual(22);
            }
        }
    });
});
