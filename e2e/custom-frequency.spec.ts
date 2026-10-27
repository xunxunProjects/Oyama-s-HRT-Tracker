import { expect, test, type Page } from '@playwright/test';
import { baseStorage, gotoApp, seedStorage } from './helpers';

/** Plan → Injection → the usual drug → dose → the frequency question. */
const openFrequencyStep = async (page: Page) => {
    await page.getByRole('button', { name: 'Medication plan', exact: true }).click();
    await page.getByRole('heading', { name: 'How do you take it?' }).waitFor();
    await page.getByRole('button', { name: 'Injection', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page
        .getByRole('button', { name: /valerate/i })
        .first()
        .click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('heading', { name: 'How often?' }).waitFor();
};

test('tabbing through the custom fields does not change the chosen rhythm', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);
    await openFrequencyStep(page);

    await page.getByRole('button', { name: 'Other', exact: true }).click();
    const every = page.getByRole('spinbutton', { name: 'Once every N days' });
    // The tapped row goes inert, so focus must land in the form it revealed.
    await expect(every).toBeFocused();
    await every.fill('4');

    const radios = page.getByRole('radiogroup').getByRole('radio');
    await expect(radios.nth(0)).toBeChecked();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();

    // Past the radio and into "times a day": focus alone must not switch the
    // saved rhythm, whose field is still empty.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(radios.nth(0)).toBeChecked();
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();
});

test('an invalid custom value leaves Back and Next usable on the earlier steps', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);
    await openFrequencyStep(page);

    await page.getByRole('button', { name: 'Other', exact: true }).click();
    await page.getByRole('spinbutton', { name: 'Once every N days' }).fill('4.5');
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await expect(add).toBeDisabled();

    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(add).toBeDisabled();
});

test('opening Other seeds the custom fields from the selected preset', async ({ page, context }) => {
    await seedStorage(context, baseStorage());
    await gotoApp(page);
    await openFrequencyStep(page);

    await page.getByRole('button', { name: 'every 5 days', exact: true }).click();
    await page.getByRole('button', { name: 'Other', exact: true }).click();
    await expect(page.getByRole('spinbutton', { name: 'Once every N days' })).toHaveValue('5');

    await page.getByRole('spinbutton', { name: 'N times a day' }).fill('2');
    await expect(page.getByRole('radiogroup').getByRole('radio').nth(1)).toBeChecked();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByText('2 times a day', { exact: false }).waitFor();

    // The edit form seeds the same way when the select changes.
    await page
        .getByRole('button', { name: /valerate 5 mg/i })
        .first()
        .click();
    await page.getByRole('button', { name: /^How often/ }).click();
    await page.getByRole('option', { name: 'weekly' }).click();
    await page.getByRole('button', { name: /^How often/ }).click();
    await page.getByRole('option', { name: 'Custom…' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Once every N days' })).toHaveValue('7');
});
