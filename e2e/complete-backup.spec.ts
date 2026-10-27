import { expect, test } from '@playwright/test';
import {
    CREDENTIAL_KEYS,
    assertNoCredentials,
    baseStorage,
    confirmDialog,
    dismissAlert,
    downloadCompleteBackup,
    gotoApp,
    makeBundle,
    nowHours,
    pasteAndImport,
    readStorage,
    registerUser,
    seedStorage,
    signedInStorage,
    stableBundle,
    stamp,
    type BundleFixture,
    type DoseEventFixture,
} from './helpers';

const event = (id: string, doseMG: number, updatedAt: number, timeH = nowHours() - 24): DoseEventFixture => ({
    id,
    route: 'injection',
    ester: 'EV',
    doseMG,
    timeH,
    extras: {},
    updatedAt,
});

test.describe('complete backup export (L3 browser)', () => {
    test('exports every category, both modes and only allowlisted preferences', async ({ page, context }) => {
        const at = stamp();
        const localEvent = event('tf-dose-1', 5, at);
        const mascEvent: DoseEventFixture = {
            id: 'tm-dose-1',
            route: 'injection',
            ester: 'TC',
            doseMG: 50,
            timeH: nowHours() - 48,
            extras: {},
            updatedAt: at,
        };
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([localEvent]),
                'hrt-lab-results': JSON.stringify([
                    { id: 'tf-lab-1', timeH: nowHours() - 72, concValue: 188, unit: 'pg/ml', updatedAt: at },
                ]),
                'hrt-dose-templates': JSON.stringify([
                    {
                        id: 'tf-template-1',
                        name: 'Weekly EV',
                        route: 'injection',
                        ester: 'EV',
                        doseMG: 5,
                        extras: {},
                        createdAt: at,
                        updatedAt: at,
                    },
                ]),
                'hrt-quick-doses': JSON.stringify([
                    { id: 'tf-quick-1', route: 'oral', ester: 'E2', value: 2, createdAt: at },
                ]),
                'hrt-supplies': JSON.stringify([
                    {
                        id: 'tf-supply-1',
                        route: 'injection',
                        ester: 'EV',
                        pack: { kind: 'vial', ml: 5, mgPerMl: 10 },
                        count: 3,
                        startedAt: at,
                    },
                ]),
                'hrt-plan': JSON.stringify([
                    {
                        id: 'tf-plan-1',
                        route: 'injection',
                        ester: 'EV',
                        doseMG: 5,
                        extras: {},
                        everyDays: 7,
                        timesPerDay: 1,
                    },
                ]),
                'hrt-masc-events': JSON.stringify([mascEvent]),
                'hrt-weight': '68.4',
                'hrt-weight-at': String(at),
                'hrt-pk-params': JSON.stringify({ e2_kClear: 0.42 }),
                'hrt-pk-params-at': String(at),
                'hrt-cal-method': 'ekf',
                'hrt-cal-history-mode': 'forward',
                'app-theme': 'dark',
                'app-show-prediction': 'true',
                'app-hide-site-label': 'true',
                'hrt-supply-lead-days': '21',
                // None of these may reach the bundle, even as a value.
                auth_user: JSON.stringify({ id: 'sentinel', username: 'not-signed-in' }),
                login_device_passes: JSON.stringify({ sentinel: 'SECRET-DEVICE-PASS' }),
            }),
        );

        await gotoApp(page);
        const bundle = await downloadCompleteBackup(page);

        expect(bundle.format).toBe('oyama-hrt-complete-backup');
        expect(bundle.formatVersion).toBe(1);
        expect(bundle.mode).toBe('transfem');
        expect(bundle.modes.transfem.events).toEqual([localEvent]);
        expect(bundle.modes.transfem.labResults).toHaveLength(1);
        expect(bundle.modes.transfem.doseTemplates?.[0]?.name).toBe('Weekly EV');
        expect(bundle.modes.transfem.quickDoses).toHaveLength(1);
        expect(bundle.modes.transfem.supplies?.[0]?.pack).toEqual({ kind: 'vial', ml: 5, mgPerMl: 10 });
        expect(bundle.modes.transfem.plan).toHaveLength(1);
        expect(bundle.modes.transmasc.events).toEqual([mascEvent]);
        expect(bundle.weight).toBe(68.4);
        expect(bundle.weightUpdatedAt).toBe(at);
        expect(bundle.pkParams?.e2_kClear).toBe(0.42);
        expect(bundle.pkParamsUpdatedAt).toBe(at);
        expect(bundle.calibration).toEqual({ method: 'ekf', historyMode: 'forward' });
        expect(bundle.preferences).toEqual({
            'app-theme': 'dark',
            'hrt-lang': 'en',
            'app-show-prediction': true,
            'app-hide-site-label': true,
            'hrt-supply-lead-days': 21,
        });

        assertNoCredentials(bundle);
        for (const key of CREDENTIAL_KEYS) expect(bundle.preferences).not.toHaveProperty(key);
        expect(await page.evaluate(() => document.body.innerText)).not.toContain('SECRET-DEVICE-PASS');
    });
});

test.describe('complete backup import (L3 browser)', () => {
    test('previews, merges records and scalars, confirms calibration, then reloads and re-exports identically', async ({
        page,
        context,
    }) => {
        const old = stamp(7_200_000);
        const newer = stamp(60_000);
        const keep = event('keep-1', 3, old);
        const gone = event('gone-1', 2, old);
        const sharedBefore = event('shared-1', 4, old);
        const mascKeep: DoseEventFixture = {
            id: 'masc-keep-1',
            route: 'injection',
            ester: 'TC',
            doseMG: 40,
            timeH: nowHours() - 72,
            extras: {},
            updatedAt: old,
        };
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([keep, sharedBefore, gone]),
                'hrt-masc-events': JSON.stringify([mascKeep]),
                'hrt-weight': '70',
                'hrt-weight-at': String(old),
                'hrt-pk-params': JSON.stringify({ e2_kClear: 0.41 }),
                'hrt-pk-params-at': String(old),
            }),
        );

        const incoming: BundleFixture = makeBundle({
            modes: {
                transfem: {
                    events: [event('new-1', 6, newer), event('shared-1', 8, newer)],
                    deletions: { events: { 'gone-1': newer }, labResults: {}, doseTemplates: {} },
                },
                transmasc: {},
            },
            weight: 66,
            weightUpdatedAt: newer,
            pkParams: { e2_kClear: 0.43 },
            pkParamsUpdatedAt: newer,
            calibration: { method: 'off', historyMode: 'forward' },
            preferences: { 'app-theme': 'dark', 'hrt-lang': 'en' },
        });

        await gotoApp(page);
        await pasteAndImport(page, JSON.stringify(incoming));

        const preview = page.locator('[data-prompt="confirm"]');
        await expect(preview).toBeVisible();
        await expect(preview).toContainText('This backup is from');
        await expect(preview).toContainText('adds 1 record and updates 1');
        await expect(preview).toContainText('1 record deleted in the backup will be deleted here too.');
        await expect(preview).toContainText("It also applies the backup's display settings.");
        await expect(preview).toContainText('Make sure this backup is yours.');
        await confirmDialog(page, 'Merge');

        const calibration = page.locator('[data-prompt="confirm"]');
        await expect(calibration).toContainText("Use the backup's calibration too?");
        await confirmDialog(page, "Use the backup's");

        await expect(page.locator('[data-prompt="alert"]')).toContainText('Backup merged.');
        await dismissAlert(page);

        await expect
            .poll(async () => (await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.map(e => e.id).sort())
            .toEqual(['keep-1', 'new-1', 'shared-1']);
        const merged = await readStorage<DoseEventFixture[]>(page, 'hrt-events');
        expect(merged?.find(e => e.id === 'shared-1')?.doseMG).toBe(8);
        expect(merged?.find(e => e.id === 'gone-1')).toBeUndefined();
        // A bundle with no transmasc categories must not touch that mode.
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-masc-events'))?.map(e => e.id)).toEqual([
            'masc-keep-1',
        ]);

        await expect.poll(async () => await readStorage(page, 'hrt-weight')).toBe(66);
        expect(await readStorage(page, 'hrt-weight-at')).toBe(newer);
        expect((await readStorage<Record<string, number>>(page, 'hrt-pk-params'))?.e2_kClear).toBe(0.43);
        expect(await readStorage(page, 'hrt-cal-method')).toBe('off');
        expect(await readStorage(page, 'hrt-cal-history-mode')).toBe('forward');
        await expect.poll(() => page.evaluate(() => localStorage.getItem('app-theme'))).toBe('dark');

        // No staging keys or credentials survive the restore.
        const keys = await page.evaluate(() => Object.keys(localStorage));
        expect(keys.filter(key => /staging|__e2e|auth_device/i.test(key))).toEqual([]);
        expect(keys).not.toContain('login_device_passes');

        await page.reload();
        await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
        const exportedAgain = await downloadCompleteBackup(page);
        expect(exportedAgain.preferences['app-theme']).toBe('dark');
        expect(exportedAgain.preferences['hrt-lang']).toBe('en');
        expect(exportedAgain.pkParams?.e2_kClear).toBe(0.43);

        expect(stableBundle(exportedAgain)).toEqual(
            stableBundle({
                ...makeBundle({
                    modes: {
                        transfem: {
                            events: [keep, event('new-1', 6, newer), event('shared-1', 8, newer)],
                            labResults: [],
                            doseTemplates: [],
                            quickDoses: [],
                            supplies: [],
                            plan: [],
                            deletions: { events: { 'gone-1': newer }, labResults: {}, doseTemplates: {} },
                        },
                        transmasc: {
                            events: [mascKeep],
                            labResults: [],
                            doseTemplates: [],
                            quickDoses: [],
                            supplies: [],
                            plan: [],
                            deletions: { events: {}, labResults: {}, doseTemplates: {} },
                        },
                    },
                    weight: 66,
                    weightUpdatedAt: newer,
                    pkParams: exportedAgain.pkParams,
                    pkParamsUpdatedAt: newer,
                    calibration: { method: 'off', historyMode: 'forward' },
                    preferences: exportedAgain.preferences,
                }),
            }),
        );
    });

    test('names the signed-in account and never writes another account or local namespace', async ({
        page,
        context,
        request,
    }) => {
        const user = await registerUser(request, 'target');
        const old = stamp();
        const newer = stamp(60_000);
        const ownEvent = event('own-1', 4, old);
        const localSentinel = event('local-sentinel', 1, old);
        const otherSentinel = event('other-sentinel', 2, old);
        const accountPrefix = `hrt-u${user.user.id}-`;

        await seedStorage(
            context,
            signedInStorage(user, {
                [`${accountPrefix}events`]: JSON.stringify([ownEvent]),
                [`${accountPrefix}weight`]: '70',
                [`${accountPrefix}weight-at`]: String(old),
                [`${accountPrefix}cal-method`]: 'mipd',
                [`${accountPrefix}cal-history-mode`]: 'retrospective',
                'hrt-events': JSON.stringify([localSentinel]),
                'hrt-weight': '69',
                'hrt-weight-at': String(old),
                'hrt-ufake-other-events': JSON.stringify([otherSentinel]),
            }),
        );

        const incoming = makeBundle({
            modes: {
                transfem: { events: [event('own-new', 5, newer)] },
                transmasc: {},
            },
            weight: 64,
            weightUpdatedAt: newer,
            calibration: { method: 'mipd', historyMode: 'retrospective' },
        });

        await gotoApp(page);
        await pasteAndImport(page, JSON.stringify(incoming));
        await expect(page.locator('[data-prompt="confirm"]')).toContainText(
            `It merges into the account ${user.user.username}`,
        );
        await confirmDialog(page, 'Merge');
        await expect(page.locator('[data-prompt="alert"]')).toContainText('Backup merged.');
        await dismissAlert(page);

        await expect
            .poll(async () =>
                (await readStorage<DoseEventFixture[]>(page, `${accountPrefix}events`))?.map(e => e.id).sort(),
            )
            .toEqual(['own-1', 'own-new']);
        expect(await readStorage(page, `${accountPrefix}weight`)).toBe(64);
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.map(e => e.id)).toEqual(['local-sentinel']);
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-ufake-other-events'))?.map(e => e.id)).toEqual([
            'other-sentinel',
        ]);
        expect(await readStorage(page, 'hrt-weight')).toBe(69);
    });

    test('says whether a backup came from the signed-in account or another one', async ({ page, context, request }) => {
        const user = await registerUser(request, 'source');
        await seedStorage(
            context,
            signedInStorage(user, {
                [`hrt-u${user.user.id}-events`]: JSON.stringify([event('own-1', 4, stamp())]),
            }),
        );

        await gotoApp(page);
        const exported = await downloadCompleteBackup(page);
        // The file names its account only by a hash, never by id or username.
        expect(exported.sourceAccount).toMatch(/^[0-9a-f]{64}$/);
        expect(JSON.stringify(exported)).not.toContain(user.user.id);
        expect(JSON.stringify(exported)).not.toContain(user.user.username);

        const dialog = page.locator('[data-prompt="confirm"]');
        await pasteAndImport(page, JSON.stringify(exported));
        await expect(dialog).toContainText(`It was exported from the account ${user.user.username}.`);
        await expect(dialog).not.toContainText('make sure');
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

        await pasteAndImport(page, JSON.stringify({ ...exported, sourceAccount: 'f'.repeat(64) }));
        await expect(dialog).toContainText(
            `It was exported from another account and merges into ${user.user.username}, so make sure that's what you want.`,
        );
    });

    test('rolls back every write when a committed write throws', async ({ page, context }) => {
        const old = stamp();
        const newer = stamp(60_000);
        const keep = event('rollback-keep', 4, old);
        await seedStorage(
            context,
            baseStorage({
                'hrt-events': JSON.stringify([keep]),
                'hrt-weight': '71',
                'hrt-weight-at': String(old),
            }),
        );

        const incoming = makeBundle({
            modes: { transfem: { events: [event('rollback-new', 5, newer)] }, transmasc: {} },
            weight: 62,
            weightUpdatedAt: newer,
            calibration: { method: 'ekf', historyMode: 'retrospective' },
        });

        await gotoApp(page);
        await pasteAndImport(page, JSON.stringify(incoming));
        await expect(page.locator('[data-prompt="confirm"]')).toContainText('adds 1 record');

        // Fail the second scalar write (weight-at) after the record array has
        // already been written. The app must restore the snapshot, not just
        // report an error.
        await page.evaluate(() => {
            const original = Storage.prototype.setItem;
            let fired = false;
            Storage.prototype.setItem = function (key: string, value: string) {
                if (!fired && key === 'hrt-weight-at') {
                    fired = true;
                    throw new DOMException('synthetic quota failure', 'QuotaExceededError');
                }
                return original.call(this, key, value);
            };
        });

        await confirmDialog(page, 'Merge');
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'The import failed. Nothing on this device was changed.',
        );
        await dismissAlert(page);

        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.map(e => e.id)).toEqual(['rollback-keep']);
        expect(await readStorage(page, 'hrt-weight')).toBe(71);
        expect(await readStorage(page, 'hrt-weight-at')).toBe(old);
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.find(e => e.id === 'rollback-new')).toBe(
            undefined,
        );
    });

    test('blocks an equal-time same-id conflict instead of guessing', async ({ page, context }) => {
        const at = stamp();
        const local = event('conflict-1', 4, at);
        await seedStorage(context, baseStorage({ 'hrt-events': JSON.stringify([local]) }));

        const incoming = makeBundle({
            modes: { transfem: { events: [event('conflict-1', 9, at)] }, transmasc: {} },
            calibration: { method: 'ekf', historyMode: 'retrospective' },
        });

        await gotoApp(page);
        await pasteAndImport(page, JSON.stringify(incoming));
        const preview = page.locator('[data-prompt="confirm"]');
        await expect(preview).toContainText(/These can't be merged and stay as they are: .*doses/);
        await confirmDialog(page, 'Merge');
        await expect(page.locator('[data-prompt="alert"]')).toContainText('Nothing in the backup could be merged.');
        await dismissAlert(page);

        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual([local]);
    });

    test('rejects malformed, wrong-format and newer-version files without writing', async ({ page, context }) => {
        const at = stamp();
        const keep = event('invalid-keep', 4, at);
        await seedStorage(context, baseStorage({ 'hrt-events': JSON.stringify([keep]) }));
        await gotoApp(page);

        // Malformed JSON: the generic import error.
        await pasteAndImport(page, '{not json');
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'Import failed. Please check that the file is valid.',
        );
        await dismissAlert(page);

        // A complete-backup envelope this build cannot read is refused before
        // any merge.
        await pasteAndImport(
            page,
            JSON.stringify({
                format: 'oyama-hrt-complete-backup',
                formatVersion: 1,
                createdAt: 'not-a-date',
                mode: 'transfem',
                modes: {},
                calibration: { method: 'ekf', historyMode: 'retrospective' },
                preferences: {},
            }),
        );
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'This is not a complete backup file this app can read.',
        );
        await dismissAlert(page);

        // A version this build cannot read gets its own message.
        await pasteAndImport(
            page,
            JSON.stringify(makeBundle({ formatVersion: 99, modes: { transfem: {}, transmasc: {} }, preferences: {} })),
        );
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'This complete backup comes from a newer version. Update the app first.',
        );
        await dismissAlert(page);

        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual([keep]);
    });

    test('renders imported record names as text, not as markup', async ({ page, context }) => {
        const newer = stamp(60_000);
        const payload = '<img src=x onerror="window.__backupXss=(window.__backupXss||0)+1">';
        await seedStorage(context, baseStorage());
        const incoming = makeBundle({
            modes: {
                transfem: {
                    events: [event(payload, 4, newer)],
                    doseTemplates: [
                        {
                            id: 'xss-template',
                            name: payload,
                            route: 'injection',
                            ester: 'EV',
                            doseMG: 5,
                            extras: {},
                            createdAt: newer,
                            updatedAt: newer,
                        },
                    ],
                },
                transmasc: {},
            },
            calibration: { method: 'ekf', historyMode: 'retrospective' },
        });

        await gotoApp(page);
        await pasteAndImport(page, JSON.stringify(incoming));
        await confirmDialog(page, 'Merge');
        await expect(page.locator('[data-prompt="alert"]')).toContainText('Backup merged.');
        await dismissAlert(page);

        await page.getByRole('button', { name: 'History', exact: true }).click();
        await page.getByRole('button', { name: 'Add dose', exact: true }).first().click();
        await page.waitForTimeout(300);

        expect(await page.evaluate(() => (window as unknown as { __backupXss?: number }).__backupXss)).toBeUndefined();
        await expect(page.locator('img[src="x"]')).toHaveCount(0);
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.[0]?.id).toBe(payload);
    });
});
