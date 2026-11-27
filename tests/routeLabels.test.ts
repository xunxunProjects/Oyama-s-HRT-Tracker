import { describe, expect, it } from 'vitest';
import { Route } from '../logic';
import { TRANSLATIONS } from '../src/i18n/translations';

const routes = Object.values(Route);

describe('route labels', () => {
    it('translates every Route value in every locale pack', () => {
        for (const [lang, pack] of Object.entries(TRANSLATIONS)) {
            const labels = pack as Record<string, string>;
            for (const route of routes) {
                const key = `route.${route}`;
                const label = labels[key];
                expect(label, `${lang} is missing ${key}`).toBeTruthy();
                expect(label, `${lang} shows the raw key for ${key}`).not.toBe(key);
            }
        }
    });
});
