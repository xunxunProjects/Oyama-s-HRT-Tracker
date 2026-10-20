import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

test('collapsed add forms are inert, not only visually hidden', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /Supplies/ }).click();
    const disclosure = page.locator('.disclosure').first();

    await expect(disclosure).toHaveAttribute('inert', '');
    expect(await disclosure.evaluate(element => (element as HTMLElement).inert)).toBe(true);
});
