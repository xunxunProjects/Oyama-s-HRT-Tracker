import { expect, test } from '@playwright/test';
import { gotoApp, registerUser, seedStorage, signedInStorage } from './helpers';

test('hides the hrt-tool sign-in entry when the Worker capability is off', async ({ page, context, request }) => {
    const user = await registerUser(request, 'hrt-cap');
    await seedStorage(context, signedInStorage(user));

    await gotoApp(page);
    await page.getByRole('button', { name: 'Account' }).click();

    // The local Worker has no HRT_RAW_ENABLED/HRT_SERVICE_TOKEN, so the page
    // would answer 404 to every hrt endpoint. Offering the entry anyway leaves
    // the reader on a "Not found" screen and logs four failed requests.
    await expect(page.getByRole('button', { name: /hrt-tool sign-in/ })).toHaveCount(0);
});
