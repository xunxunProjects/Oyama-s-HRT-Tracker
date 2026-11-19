import { expect, test } from '@playwright/test';
import { baseStorage, seedStorage } from './helpers';

test.use({ locale: 'en-US', timezoneId: 'Asia/Taipei' });

test('aligns the localized update time and shows anonymous registrations with valid times', async ({
    page,
    context,
}) => {
    await seedStorage(context, baseStorage({ 'hrt-lang': 'zh-TW' }));
    await page.clock.setFixedTime(new Date('2026-11-19T06:00:56Z'));
    const now = 1_800_000_000;
    await page.route('**/api/transparency', route =>
        route.fulfill({
            json: {
                server_time: now,
                recent_registrations: [now - 3600, { created_at: now - 2 * 86400, anon_id: 'abcd' }, null, {}],
            },
        }),
    );

    await page.goto('/');
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await page.getByRole('tab', { name: '關於', exact: true }).click();
    await page.getByRole('button', { name: '透明度中心', exact: true }).click();

    const updated = page.getByText(/^最後更新於/);
    await expect(updated).toHaveText('最後更新於 下午2:00:56');
    const totalUsers = page.getByText('總使用者數', { exact: true });

    const registrations = page.getByRole('heading', { name: '最近註冊' }).locator('+ div');
    await expect(registrations.locator('span')).toHaveText(['user_***', '1 小時前', 'user_***', '2 天前']);

    for (const viewport of [
        { width: 1756, height: 927 },
        { width: 390, height: 844 },
    ]) {
        await page.setViewportSize(viewport);
        await expect.poll(async () => (await updated.boundingBox())?.x).toBe((await totalUsers.boundingBox())?.x);
    }
});
