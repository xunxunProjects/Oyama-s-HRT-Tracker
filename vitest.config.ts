import { defineConfig } from 'vitest/config';

// Kept apart from vite.config.ts so the tests load none of the app's build
// plugins (React, PWA): they only exercise plain TypeScript modules.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
  },
});
