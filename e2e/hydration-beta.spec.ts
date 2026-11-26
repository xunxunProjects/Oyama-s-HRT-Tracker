import { expect, test } from '@playwright/test';
import { baseStorage, seedStorage } from './helpers';

const emptyHydration = JSON.stringify({
    water: [],
    urineColor: null,
    bodyFatPercent: null,
    alpha: 0.5,
});

const openSettings = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
};

test.describe('hydration beta settings', () => {
    test('shows the switch and log page when the beta is on', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-physiology-beta': 'true',
                'hrt-hydration': emptyHydration,
            }),
        );
        await openSettings(page);

        await expect(page.getByRole('switch', { name: 'Hydration Beta' })).toHaveAttribute('aria-checked', 'true');
        await page.getByRole('button', { name: 'Hydration log' }).click();

        await expect(page.getByRole('button', { name: /Hydration Beta.*Back/ })).toBeVisible();
        await expect(page.getByRole('slider', { name: 'Dilution sensitivity α' })).toBeVisible();
        await expect(
            page.getByText('Model hypothesis, not a lab result; urine color is a hydration reference, not hormone clearance.'),
        ).toBeVisible();
    });

    test('hides the log row when off and steps away if the page is opened by Forward', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-physiology-beta': 'false',
                'hrt-hydration': emptyHydration,
            }),
        );
        await openSettings(page);

        await expect(page.getByRole('switch', { name: 'Hydration Beta' })).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByRole('button', { name: 'Hydration log' })).toBeHidden();

        // Turn it on, open the page, go back and turn it off again; a browser
        // Forward still lands on the guarded page and must step up to Settings.
        await page.getByRole('switch', { name: 'Hydration Beta' }).click();
        await page.getByRole('button', { name: 'Hydration log' }).click();
        await expect(page.getByRole('button', { name: /Hydration Beta.*Back/ })).toBeVisible();
        await page.getByRole('button', { name: /Hydration Beta.*Back/ }).click();
        await expect(page.getByRole('switch', { name: 'Hydration Beta' })).toBeVisible();
        await page.getByRole('switch', { name: 'Hydration Beta' }).click();
        await page.goForward();

        await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
        await expect(page.getByRole('button', { name: /Hydration Beta.*Back/ })).toBeHidden();
    });
});
