import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

test('reports malformed pasted JSON without logging an uncaught stack', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', error => errors.push(error.message));

    await seedStorage(context, baseStorage());
    await gotoApp(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'Data management' }).click();
    await page.getByRole('button', { name: 'Import data' }).click();
    await page.getByRole('button', { name: /Paste JSON text/ }).click();
    await page.getByRole('textbox', { name: 'Paste JSON content here...' }).fill('{bad json');
    await page.getByRole('button', { name: 'Import', exact: true }).click();

    await expect(page.locator('[data-prompt="alert"]')).toContainText(
        'Import failed. Please check that the file is valid.',
    );
    await page.locator('[data-prompt="alert"]').getByRole('button', { name: 'OK', exact: true }).click();

    // The alert is the user-facing report; the console should not also carry a
    // raw JSON.parse stack from the expected rejection.
    expect(errors.filter(message => message.includes('SyntaxError'))).toEqual([]);
});
