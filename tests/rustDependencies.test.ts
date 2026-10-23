import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The Tauri 1.8 tree is frozen at its old major, so its transitive crates
// need the fixed patch releases from the 2026 RustSec advisories. `cargo
// audit` is the source of truth; this guard keeps a lockfile refresh from
// silently reintroducing a vulnerable version during review.
const MINIMUMS: Record<string, string> = {
    bytes: '1.11.1', // RUSTSEC-2026-0007 / CVE-2026-25541
    'crossbeam-epoch': '0.9.20', // RUSTSEC-2026-0204
    tar: '0.4.45', // RUSTSEC-2026-0067 / CVE-2026-33056, RUSTSEC-2026-0068 / CVE-2026-33055
    time: '0.3.47', // RUSTSEC-2026-0009 / CVE-2026-25727
    'quick-xml': '0.41.0', // RUSTSEC-2026-0194, RUSTSEC-2026-0195
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = readFileSync(resolve(root, 'src-tauri/Cargo.lock'), 'utf8');

function versionsOf(name: string): string[] {
    const pattern = new RegExp(`name = "${name}"\\nversion = "([^"]+)"`, 'g');
    return [...lock.matchAll(pattern)].map(match => match[1]);
}

function atLeast(actual: string, minimum: string): boolean {
    const a = actual.split('.').map(Number);
    const b = minimum.split('.').map(Number);
    for (let index = 0; index < Math.max(a.length, b.length); index++) {
        const left = a[index] ?? 0;
        const right = b[index] ?? 0;
        if (left !== right) return left > right;
    }
    return true;
}

describe('Rust dependency security floor', () => {
    for (const [crate, minimum] of Object.entries(MINIMUMS)) {
        it(`${crate} stays at ${minimum} or later`, () => {
            const versions = versionsOf(crate);
            expect(versions.length, `${crate} is missing from Cargo.lock`).toBeGreaterThan(0);
            for (const version of versions) {
                expect(atLeast(version, minimum), `${crate} ${version} is below ${minimum}`).toBe(true);
            }
        });
    }
});
