import { expect, test } from '@playwright/test';
import { gotoApp, nowHours, registerUser, seedStorage, signedInStorage, stamp, type DoseEventFixture } from './helpers';

const event: DoseEventFixture = {
    id: 'entropy-xss-dose',
    route: 'injection',
    ester: 'EV',
    doseMG: 5,
    timeH: nowHours() - 24,
    extras: {},
    updatedAt: stamp(),
};

const payloads = ['<img src=x onerror=alert(1)>', '</span><script>alert(1)</script>', '"><svg/onload=alert(1)>'];

test.describe('share password entropy display (L3 browser)', () => {
    test('renders XSS payloads as text and never executes them', async ({ page, context, request }) => {
        const user = await registerUser(request, 'entropy-xss');
        await seedStorage(
            context,
            signedInStorage(user, {
                'hrt-events': JSON.stringify([event]),
            }),
        );
        await gotoApp(page);

        await page.getByRole('button', { name: 'Share', exact: true }).click();
        await expect(page.getByRole('button', { name: /Share dosage details/ })).toBeVisible();
        await page.getByRole('switch', { name: 'Protect with a password' }).click();

        const password = page.locator('#share-password');
        await expect(password).toBeVisible();

        const dialogs: string[] = [];
        page.on('dialog', async dialog => {
            dialogs.push(dialog.message());
            await dialog.dismiss();
        });

        for (const payload of payloads) {
            await password.fill(payload);
            await expect(password).toHaveValue(payload);
            await expect(page.getByRole('progressbar', { name: 'Entropy estimate' })).toBeVisible();
            await expect(page.locator('img[src="x"]')).toHaveCount(0);
            await expect(page.locator('svg[onload]')).toHaveCount(0);
            await expect(page.locator('script').filter({ hasText: 'alert(1)' })).toHaveCount(0);
        }

        expect(dialogs).toEqual([]);
    });
});
