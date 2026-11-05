import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

test('pharmacokinetic visualization renders, switches model and animates', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('tab', { name: 'About' }).click();
    await page.getByRole('button', { name: 'Pharmacokinetic visualization', exact: true }).click();

    await expect(page.getByText('Pharmacokinetic visualization').first()).toBeVisible();

    const viz = page.locator('[data-explain-math]');
    await expect(viz).toBeVisible();
    const budget = await viz.getAttribute('data-animation-budget-ms');
    expect(Number(budget)).toBeLessThanOrEqual(1500);

    await page.getByRole('tab', { name: 'Testosterone gel' }).click();
    const dose = page.locator('#pk-dose');
    await dose.fill('5');
    await expect(viz).toBeVisible();
});
