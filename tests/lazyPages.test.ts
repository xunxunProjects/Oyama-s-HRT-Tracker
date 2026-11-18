import { describe, expect, it } from 'vitest';
import * as pages from '../src/routes/lazyPages';

describe('lazy page routes', () => {
    it('exports only React.lazy components', () => {
        for (const [name, page] of Object.entries(pages)) {
            expect((page as { $$typeof?: symbol }).$$typeof, name).toBe(Symbol.for('react.lazy'));
        }
    });
});
