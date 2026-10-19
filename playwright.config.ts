import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Local runs may have a browser cached under an older revision than the
 * Playwright package expects. Point at it explicitly when asked; CI installs
 * the matching browser instead.
 */
const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    [
        join(homedir(), '.cache/ms-playwright/chromium-1247/chrome-linux64/chrome'),
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
    ].find(path => existsSync(path));

export default defineConfig({
    testDir: './e2e',
    // One worker: every test talks to the same isolated D1 database and the
    // local Worker has per-account rate limits.
    workers: 1,
    fullyParallel: false,
    timeout: 90_000,
    expect: { timeout: 15_000 },
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        launchOptions: executablePath ? { executablePath } : {},
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
        },
    ],
    webServer: [
        {
            command: 'bash e2e/start-worker.sh',
            url: 'http://127.0.0.1:8787/api/notice',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
        },
        {
            command: 'npx vite --host 127.0.0.1 --port 3000',
            url: 'http://127.0.0.1:3000/',
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
        },
    ],
});
