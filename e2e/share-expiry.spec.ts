import { expect, test } from '@playwright/test';
import { gotoApp, nowHours, registerUser, seedStorage, signedInStorage, stamp, type DoseEventFixture } from './helpers';

const event: DoseEventFixture = {
    id: 'share-expiry-dose',
    route: 'injection',
    ester: 'EV',
    doseMG: 5,
    timeH: nowHours() - 24,
    extras: {},
    updatedAt: stamp(),
};

test.describe('share link expiry (L3 browser)', () => {
    test('offers expiry through 2100 and warns beyond the 365-day security window', async ({
        page,
        context,
        request,
    }) => {
        const user = await registerUser(request, 'share-expiry');
        await seedStorage(
            context,
            signedInStorage(user, {
                'hrt-events': JSON.stringify([event]),
            }),
        );
        await gotoApp(page);

        await page.getByRole('button', { name: 'Share', exact: true }).click();
        await expect(page.getByRole('button', { name: /Share dosage details/ })).toBeVisible();

        await page.getByRole('button', { name: /Expiration date/ }).click();
        // The calendar's year is typed beside the month; a whole year typed
        // moves the chosen date there, keeping its month and day.
        const year = page.getByRole('textbox', { name: 'Year', exact: true });
        await year.fill('2030');

        // The reported 2030 date is now valid, but outside the 365-day
        // security window.
        await expect(page.getByRole('status')).toContainText(
            'Security is not guaranteed beyond 365 days. Anyone with the link can open it until it expires.',
        );

        // The picker stops at 2100: a later year is brought back to it.
        await year.fill('2101');
        await expect(year).toHaveValue('2100');
        await expect(page.getByRole('status')).toContainText('Security is not guaranteed beyond 365 days.');

        // Creating the link proves the worker accepts an expiry far beyond the
        // old 365-day cap, not just that the form displays a warning.
        await page.getByRole('button', { name: 'Create link', exact: true }).click();
        await expect(page.getByText('Your share link is ready')).toBeVisible();

        await page.screenshot({ path: 'test-results/share-expiry-2100.png', fullPage: true });
    });
});
