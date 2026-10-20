import { expect, test } from '@playwright/test';
import { downloadCompleteBackup, gotoApp, registerUser, seedStorage, signedInStorage } from './helpers';

test('adopts the signed-out plan and supplies into a first sign-in', async ({ page, context, request }) => {
    const user = await registerUser(request, 'adopt');
    const startedAt = Date.now() - 3_600_000;
    const plan = [
        {
            id: 'adopt-plan-1',
            route: 'injection',
            ester: 'EV',
            doseMG: 5,
            extras: {},
            everyDays: 7,
            timesPerDay: 1,
        },
    ];
    const supplies = [
        {
            id: 'adopt-supply-1',
            route: 'injection',
            ester: 'EV',
            pack: { kind: 'vial', ml: 5, mgPerMl: 10 },
            count: 2,
            startedAt,
        },
    ];

    await seedStorage(
        context,
        signedInStorage(user, {
            'hrt-plan': JSON.stringify(plan),
            'hrt-supplies': JSON.stringify(supplies),
        }),
    );

    await gotoApp(page);

    const prefix = `hrt-u${user.user.id}-`;
    const read = (key: string) => page.evaluate(k => localStorage.getItem(k), key);

    // The signed-out entries move into the account namespace, not a copy.
    await expect.poll(() => read(`${prefix}plan`)).not.toBeNull();
    const adoptedPlan = JSON.parse((await read(`${prefix}plan`)) ?? '[]');
    expect(adoptedPlan).toHaveLength(1);
    expect(adoptedPlan[0]).toMatchObject({
        id: 'adopt-plan-1',
        route: 'injection',
        ester: 'EV',
        doseMG: 5,
        everyDays: 7,
    });

    const adoptedSupplies = JSON.parse((await read(`${prefix}supplies`)) ?? '[]');
    expect(adoptedSupplies).toHaveLength(1);
    expect(adoptedSupplies[0]).toMatchObject({
        id: 'adopt-supply-1',
        route: 'injection',
        ester: 'EV',
        count: 2,
    });
    expect(await read('hrt-plan')).toBeNull();
    expect(await read('hrt-supplies')).toBeNull();

    // The adopted plan is visible on the Overview and can drive quick logging.
    await expect(page.getByText('Due today', { exact: true })).toBeVisible();

    // The complete backup is built from the account namespace, so it must carry
    // the adopted plan and supplies rather than exporting empty categories.
    const bundle = await downloadCompleteBackup(page);
    expect(bundle.modes.transfem.plan).toHaveLength(1);
    expect(bundle.modes.transfem.supplies).toHaveLength(1);
});
