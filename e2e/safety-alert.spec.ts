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

const highDose = (): DoseEventFixture => ({
    id: 'safety-high-dose',
    route: 'oral',
    ester: 'E2',
    doseMG: 20,
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

    test('shows the existing home dose advisory when safety reminders are on', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([highDose()]),
            }),
        );
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();

        await expect(page.getByText('Your recent estradiol dose looks a bit high.')).toBeVisible();
    });

    test('does not show the existing home dose advisory when safety reminders are off', async ({ page, context }) => {
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([highDose()]),
                'hrt-safety-reminder-enabled': 'false',
            }),
        );
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Settings', exact: true }).first()).toBeVisible();

        await expect(page.getByText('Your recent estradiol dose looks a bit high.')).toBeHidden();
    });

    test('shows the dose guidance in the quick-add form when safety reminders are on', async ({ page, context }) => {
        await seedStorage(context, baseStorage());
        await gotoApp(page);
        await page.getByRole('button', { name: 'History', exact: true }).click();
        await page.getByRole('button', { name: 'Add dose', exact: true }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole('spinbutton', { name: 'Dose (mg)' }).fill('20');

        await expect(page.getByText('Dose guidance', { exact: true })).toBeVisible();
    });

    test('hides the dose guidance in the quick-add form when safety reminders are off', async ({ page, context }) => {
        await seedStorage(context, baseStorage({ 'hrt-safety-reminder-enabled': 'false' }));
        await gotoApp(page);
        await page.getByRole('button', { name: 'History', exact: true }).click();
        await page.getByRole('button', { name: 'Add dose', exact: true }).first().click();
        await page.waitForTimeout(300);
        await page.getByRole('spinbutton', { name: 'Dose (mg)' }).fill('20');

        await expect(page.getByText('Dose guidance', { exact: true })).toBeHidden();
    });
});
