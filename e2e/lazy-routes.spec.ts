import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

test('a lazy page survives Back and Forward after its chunk loads', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('tab', { name: 'Data management' }).click();
    await page.getByRole('button', { name: 'Export data', exact: true }).click();
    await expect(page.getByRole('button', { name: /Complete backup/ })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Data management' })).toBeVisible();

    await page.goForward();
    await expect(page.getByRole('button', { name: /Complete backup/ })).toBeVisible();
});
