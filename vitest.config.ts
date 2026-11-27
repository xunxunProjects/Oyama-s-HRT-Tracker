import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts so the tests load none of the app's build
// plugins (React, PWA): they only exercise plain TypeScript modules.
export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['tests/setup.ts'],
        // F-01: heavy calibration/simulation cases exceeded Vitest's 5 s
        // default under parallel load while passing in isolation.
        testTimeout: 15_000,
    },
});
