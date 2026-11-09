import { expect, test } from '@playwright/test';
import { baseStorage, seedStorage } from './helpers';

const CASES = [
    { lang: 'zh', settings: '设置', about: '关于', opsec: '日常操作与安全' },
    { lang: 'en', settings: 'Settings', about: 'About', opsec: 'Everyday Operations & Security' },
] as const;

for (const testCase of CASES) {
    test(`OpSec IRC diagrams render as SVG (${testCase.lang})`, async ({ page, context }) => {
        await seedStorage(context, baseStorage({ 'hrt-lang': testCase.lang }));
        await page.goto('/');

        await page.getByRole('button', { name: testCase.settings, exact: true }).click();
        await page.getByRole('tab', { name: testCase.about, exact: true }).click();
        await page.getByRole('button', { name: testCase.opsec, exact: true }).click();

        const section = page.locator('#extended-irc');
        await expect(section).toBeVisible();
        await section.scrollIntoViewIfNeeded();

        await expect(section.locator('.opsec-mermaid svg')).toHaveCount(2, { timeout: 30_000 });
        await expect(section.locator('.opsec-mermaid-fallback')).toHaveCount(0);
    });
}
