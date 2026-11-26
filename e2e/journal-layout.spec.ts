import { expect, test } from '@playwright/test';
import { baseStorage, gotoApp, nowHours, seedStorage } from './helpers';

// The Oyama Journal layout: five tabs, the Journal first, a medicine's own page,
// the Journal's panels, the account inside Settings, and a real address for
// every page, kept across a reload and walked back with Back.

const seeded = () =>
    baseStorage({
        'hrt-events': JSON.stringify([
            { id: 'e2e-ev-1', route: 'injection', ester: 'EV', doseMG: 5, timeH: nowHours() - 72, extras: {} },
        ]),
    });

test('opens on the Journal, and Search finds a medicine by what it is sold as', async ({ page, context }) => {
    await seedStorage(context, seeded());
    await gotoApp(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();

    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);

    await page.getByRole('combobox', { name: 'Search medicines' }).fill('Progynova');
    const hit = page.getByRole('button', { name: /Estradiol valerate/ });
    await expect(hit).toBeVisible();
    await hit.click();

    // A medicine's address names no medicine: it lands in browser history.
    await expect(page).toHaveURL(/\/meds$/);
    await expect(page.getByText('How long')).toBeVisible();
    await expect(page.getByText('At its highest')).toBeVisible();
});

test("the Journal's panels have their own addresses, kept across a reload", async ({ page, context }) => {
    await seedStorage(context, seeded());
    await gotoApp(page);

    await expect(page).toHaveURL(/\/$/);
    await page.getByRole('tab', { name: 'Stats' }).click();
    await expect(page).toHaveURL(/\/journal\/stats$/);
    await expect(page.getByText('Most used')).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/journal\/stats$/);
    await expect(page.getByText('Most used')).toBeVisible();
});

test('the account opens from Settings, and Back returns there', async ({ page, context }) => {
    await seedStorage(context, seeded());
    await gotoApp(page);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await page.getByRole('button', { name: /^Account/ }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
});

test('a page opened from its address has its tab under it for Back', async ({ page, context }) => {
    await seedStorage(context, seeded());
    await page.goto('/settings/language');
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/language$/);

    await page.goBack();
    await expect(page).toHaveURL(/\/settings$/);
});
