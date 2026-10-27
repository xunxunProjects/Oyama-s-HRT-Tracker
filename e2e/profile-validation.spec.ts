import { expect, test } from '@playwright/test';
import { gotoApp, registerUser, seedStorage, signedInStorage } from './helpers';

test('rejects an invalid username before the server round trip', async ({ page, context, request }) => {
    const user = await registerUser(request, 'profile');
    await seedStorage(context, signedInStorage(user));

    await gotoApp(page);
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Edit username' }).click();

    const input = page.getByRole('textbox', { name: 'New username' });
    const save = page.getByRole('button', { name: 'Save', exact: true });
    const rules = page.getByText('Use 3–30 letters, numbers, underscores or hyphens.');

    await input.fill('a');
    await expect(save).toBeDisabled();
    await expect(rules).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');

    await input.fill('valid_name');
    await expect(save).toBeEnabled();
    await expect(rules).toHaveCount(0);
});
