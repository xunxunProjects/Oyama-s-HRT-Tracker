import { expect, test } from '@playwright/test';
import { downloadCompleteBackup, gotoApp, registerUser, seedStorage, signedInStorage } from './helpers';

test('keeps signed-out plan and supplies out of a first sign-in', async ({ page, context, request }) => {
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

    // Signed-out entries stay in the anonymous namespace. They are never
    // copied or moved into whichever account signs in next.
    expect(JSON.parse((await read('hrt-plan')) ?? '[]')).toHaveLength(1);
    expect(JSON.parse((await read('hrt-supplies')) ?? '[]')).toHaveLength(1);
    expect(JSON.parse((await read(`${prefix}plan`)) ?? '[]')).toHaveLength(0);
    expect(JSON.parse((await read(`${prefix}supplies`)) ?? '[]')).toHaveLength(0);

    // The account view does not render the anonymous plan.
    await expect(page.getByText('Due today', { exact: true })).toHaveCount(0);

    // A complete backup is scoped to the account, so it must not carry the
    // anonymous plan or supplies.
    const bundle = await downloadCompleteBackup(page);
    expect(bundle.modes.transfem.plan).toHaveLength(0);
    expect(bundle.modes.transfem.supplies).toHaveLength(0);
});
