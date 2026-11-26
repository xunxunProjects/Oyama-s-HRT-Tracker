import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, nowHours, seedStorage, type DoseEventFixture } from './helpers';

const hugeDose = (): DoseEventFixture => ({
    id: 'safety-extreme-dose',
    route: 'oral',
    ester: 'E2',
    doseMG: 500,
    timeH: nowHours() - 1,
    extras: {},
    updatedAt: Date.now(),
});

test.describe('safety alert modal', () => {
    test('shows for an extreme dose and stays dismissed after reload', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([hugeDose()]),
            }),
        );
        await page.goto('/');

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('If you feel unwell, please seek medical attention.')).toBeVisible();

        await page.getByRole('button', { name: 'Close', exact: true }).first().click();
        await expect(dialog).toBeHidden();

        await page.reload();
        await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();
        await expect(page.getByRole('dialog')).toBeHidden();
    });

    test('does not show when safety reminders are off', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([hugeDose()]),
                'hrt-safety-reminder-enabled': 'false',
            }),
        );
        await gotoApp(page);

        await expect(page.getByRole('dialog')).toBeHidden();
    });
});
