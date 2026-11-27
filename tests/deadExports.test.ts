import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('dead exports from the 1.6-rc audit', () => {
    const sources: Array<[string, string]> = [
        ['../src/server/trocador.ts', 'ANONPAY_STATUS_PREFIX'],
        ['../tests/helpers.ts', 'VD_CPA_ML'],
        ['../src/components/icons/index.tsx', 'ChevronUp'],
    ];

    it.each(sources)('%s no longer exports %s', (path, symbol) => {
        expect(readFileSync(new URL(path, import.meta.url), 'utf8')).not.toContain(symbol);
    });
});
