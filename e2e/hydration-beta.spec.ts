import { expect, test } from '@playwright/test';
import { baseStorage, nowHours, seedStorage } from './helpers';

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

test.describe('hydration beta home card', () => {
    test('shows the card, adds a cup, and keeps the count after reload', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-physiology-beta': 'true',
                'hrt-hydration': emptyHydration,
            }),
        );
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Hydration Beta' })).toBeVisible();
        await expect(page.getByText(/0 cups/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add a cup (500 mL)' })).toBeVisible();

        await page.getByRole('button', { name: 'Add a cup (500 mL)' }).click();

        await expect(page.getByText(/1 cups/)).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Hydration Beta' })).toBeVisible();

        await page.reload();

        await expect(page.getByText(/1 cups/)).toBeVisible();
        await expect(page.getByRole('button', { name: 'Add a cup (500 mL)' })).toBeVisible();
    });

    test('hides the card when the beta is off', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-physiology-beta': 'false',
                'hrt-hydration': emptyHydration,
            }),
        );
        await page.goto('/');

        await expect(page.getByRole('heading', { name: 'Hydration Beta' })).toBeHidden();
        await expect(page.getByRole('button', { name: 'Add a cup (500 mL)' })).toBeHidden();
    });
});

test.describe('hydration beta chart', () => {
    test('draws the adjusted dashed curve and the difference panel', async ({ page, context }) => {
        const h = nowHours();
        await seedStorage(
            context,
            baseStorage({
                'hrt-physiology-beta': 'true',
                'hrt-events': JSON.stringify([
                    { id: 'hydration-chart-dose', route: 'oral', ester: 'E2', doseMG: 4, timeH: h - 48, extras: {} },
                ]),
                'hrt-hydration': JSON.stringify({
                    water: [{ id: 'hydration-chart-cup', timeH: h - 2, cups: 2 }],
                    urineColor: null,
                    bodyFatPercent: null,
                    alpha: 1,
                }),
            }),
        );
        await page.goto('/');

        await expect(page.locator('svg path[stroke-dasharray="6 4"]').first()).toBeVisible();
        await expect(page.getByText('Hydration-adjusted (Beta)').first()).toBeVisible();
        await expect(page.getByText('Difference from main line')).toBeVisible();
    });
});
