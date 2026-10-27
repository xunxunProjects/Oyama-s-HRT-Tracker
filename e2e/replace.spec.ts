import { expect, test } from '@playwright/test';
import { journalChecksum, REPLACE_JOURNAL_KEY } from '../src/utils/replaceJournal';
import {
    baseStorage,
    confirmDialog,
    dismissAlert,
    downloadCompleteBackup,
    gotoApp,
    makeBundle,
    nowHours,
    pasteAndReplace,
    readStorage,
    seedStorage,
    stamp,
    type BundleMode,
    type DoseEventFixture,
} from './helpers';

const event = (id: string, doseMG: number, updatedAt: number): DoseEventFixture => ({
    id,
    route: 'injection',
    ester: 'EV',
    doseMG,
    timeH: nowHours() - 24,
    extras: {},
    updatedAt,
});

const fullMode = (prefix: string, at: number, doseMG: number): BundleMode => ({
    events: [event(`${prefix}-event`, doseMG, at)],
    labResults: [{ id: `${prefix}-lab`, timeH: nowHours() - 72, concValue: 180, unit: 'pg/ml', updatedAt: at }],
    doseTemplates: [
        {
            id: `${prefix}-template`,
            name: `${prefix} template`,
            route: 'injection',
            ester: 'EV',
            doseMG,
            extras: {},
            createdAt: at,
            updatedAt: at,
        },
    ],
    quickDoses: [{ id: `${prefix}-quick`, route: 'oral', ester: 'E2', value: 2, createdAt: at }],
    supplies: [
        {
            id: `${prefix}-supply`,
            route: 'injection',
            ester: 'EV',
            pack: { kind: 'vial', ml: 5, mgPerMl: 10 },
            count: 3,
            startedAt: at,
        },
    ],
    plan: [
        {
            id: `${prefix}-plan`,
            route: 'injection',
            ester: 'EV',
            doseMG,
            extras: {},
            everyDays: 7,
            timesPerDay: 1,
        },
    ],
    deletions: { events: {}, labResults: {}, doseTemplates: {} },
});

const seedOld = (at: number): Record<string, string> =>
    baseStorage({
        'hrt-events': JSON.stringify([event('old-local', 2, at)]),
        'hrt-masc-events': JSON.stringify([event('old-masc', 30, at)]),
        'hrt-masc-lab-results': JSON.stringify([
            { id: 'old-masc-lab', timeH: nowHours() - 96, concValue: 5, unit: 'ng/dl', updatedAt: at },
        ]),
        'hrt-weight': '70',
        'hrt-weight-at': String(at),
        'hrt-pk-params': JSON.stringify({ e2_kClear: 0.5 }),
        'hrt-pk-params-at': String(at),
        'hrt-cal-method': 'mipd',
        'hrt-cal-history-mode': 'retrospective',
        auth_user: JSON.stringify({ id: 'sentinel', username: 'not-signed-in' }),
        login_device_passes: JSON.stringify({ sentinel: 'SECRET-DEVICE-PASS' }),
    });

test.describe('complete backup replace (L3 browser)', () => {
    test('replaces both modes and scalars, keeps credentials, and survives reload', async ({ page, context }) => {
        const old = stamp(7_200_000);
        const newer = stamp(60_000);
        await seedStorage(context, seedOld(old));
        const incoming = makeBundle({
            modes: {
                transfem: fullMode('tf', newer, 6),
                transmasc: fullMode('tm', newer, 50),
            },
            weight: 66,
            weightUpdatedAt: newer,
            pkParams: { e2_kClear: 0.43 },
            pkParamsUpdatedAt: newer,
            calibration: { method: 'off', historyMode: 'forward' },
            preferences: { 'app-theme': 'dark', 'hrt-lang': 'en' },
        });

        await gotoApp(page);
        await pasteAndReplace(page, JSON.stringify(incoming));

        const dialog = page.locator('[data-prompt="confirm"]');
        await expect(dialog).toContainText('Replace this device from a complete backup?');
        await expect(dialog).toContainText('This backup is from');
        await expect(dialog).toContainText('and holds 12 records.');
        await expect(dialog).toContainText(
            'The records and settings on this device will be replaced by the ones in it, and with cloud sync on, your other devices change too.',
        );
        await expect(dialog).toContainText('Make sure this backup is yours.');
        await expect(dialog).not.toContainText('journal');
        await confirmDialog(page, 'Replace everything');

        await expect(page.locator('[data-prompt="alert"]')).toContainText('Complete backup restored.');
        await dismissAlert(page);

        await expect
            .poll(async () => (await readStorage<DoseEventFixture[]>(page, 'hrt-events'))?.map(e => e.id))
            .toEqual(['tf-event']);
        expect((await readStorage<DoseEventFixture[]>(page, 'hrt-masc-events'))?.map(e => [e.id, e.doseMG])).toEqual([
            ['tm-event', 50],
        ]);
        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-masc-lab-results')).toHaveLength(1);
        expect(await readStorage(page, 'hrt-weight')).toBe(66);
        // Stamped at the replace, so a cloud value cannot win it back.
        expect(await readStorage<number>(page, 'hrt-weight-at')).toBeGreaterThan(newer);
        expect((await readStorage<Record<string, number>>(page, 'hrt-pk-params'))?.e2_kClear).toBe(0.43);
        expect(await readStorage(page, 'hrt-cal-method')).toBe('off');
        expect(await readStorage(page, 'hrt-cal-history-mode')).toBe('forward');
        expect(await readStorage(page, 'auth_user')).toEqual({ id: 'sentinel', username: 'not-signed-in' });
        expect(await readStorage(page, 'login_device_passes')).toEqual({ sentinel: 'SECRET-DEVICE-PASS' });
        expect(await readStorage(page, REPLACE_JOURNAL_KEY)).toBeNull();

        await page.reload();
        await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
        const exported = await downloadCompleteBackup(page);
        expect(exported.modes.transfem.events?.map(e => e.id)).toEqual(['tf-event']);
        expect(exported.modes.transmasc.events?.map(e => e.id)).toEqual(['tm-event']);
        assertNoOldData(exported);
    });

    test('refuses files that cannot describe the whole device, before writing', async ({ page, context }) => {
        const old = stamp(7_200_000);
        await seedStorage(context, seedOld(old));
        await gotoApp(page);

        const incomplete = makeBundle({
            modes: {
                transfem: fullMode('tf', stamp(60_000), 6),
                transmasc: { events: [event('tm-event', 50, stamp(60_000))] },
            },
            calibration: { method: 'off', historyMode: 'forward' },
        });
        await pasteAndReplace(page, JSON.stringify(incomplete));
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'This is not a complete backup file this app can read.',
        );
        await dismissAlert(page);

        // A regular records payload is not a replaceable complete backup.
        await pasteAndReplace(page, JSON.stringify({ events: [] }));
        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'This is not a complete backup file this app can read.',
        );
        await dismissAlert(page);

        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual([event('old-local', 2, old)]);
        expect(await readStorage(page, 'hrt-weight')).toBe(70);
    });

    test('rolls back every key when a target write throws', async ({ page, context }) => {
        const old = stamp(7_200_000);
        const newer = stamp(60_000);
        await seedStorage(context, seedOld(old));
        const incoming = makeBundle({
            modes: { transfem: fullMode('tf', newer, 6), transmasc: fullMode('tm', newer, 50) },
            weight: 66,
            weightUpdatedAt: newer,
            calibration: { method: 'off', historyMode: 'forward' },
        });

        await gotoApp(page);
        await pasteAndReplace(page, JSON.stringify(incoming));
        await expect(page.locator('[data-prompt="confirm"]')).toBeVisible();
        await page.evaluate(() => {
            const original = Storage.prototype.setItem;
            let fired = false;
            Storage.prototype.setItem = function (key: string, value: string) {
                if (!fired && key === 'hrt-cal-method') {
                    fired = true;
                    throw new DOMException('synthetic quota failure', 'QuotaExceededError');
                }
                return original.call(this, key, value);
            };
        });
        await confirmDialog(page, 'Replace everything');

        await expect(page.locator('[data-prompt="alert"]')).toContainText(
            'Restore failed. Nothing on this device was changed.',
        );
        await dismissAlert(page);
        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual([event('old-local', 2, old)]);
        expect(await readStorage(page, 'hrt-weight')).toBe(70);
        expect(await readStorage(page, 'hrt-masc-events')).toEqual([event('old-masc', 30, old)]);
        expect(await readStorage(page, REPLACE_JOURNAL_KEY)).toBeNull();
    });

    test('recovers an interrupted replace before rendering, and finishes a committed one', async ({
        page,
        context,
    }) => {
        const old = stamp(7_200_000);
        await seedStorage(context, seedOld(old));
        await gotoApp(page);

        // Simulate a crash after the journal reached `applying` and some target
        // keys were already overwritten.
        const snapshot = await page.evaluate(() => ({
            events: localStorage.getItem('hrt-events'),
            weight: localStorage.getItem('hrt-weight'),
        }));
        const writes = [
            { key: 'hrt-events', value: JSON.stringify([event('partial-new', 9, stamp(60_000))]) },
            { key: 'hrt-weight', value: '55' },
        ];
        const snap = [
            { key: 'hrt-events', value: snapshot.events },
            { key: 'hrt-weight', value: snapshot.weight },
        ];
        const journal = {
            v: 1,
            phase: 'applying',
            createdAt: Date.now(),
            owner: 'local',
            writes,
            snapshot: snap,
            checksum: journalChecksum(writes, snap),
        };
        await page.evaluate(
            ({ journal, writes }) => {
                for (const write of writes) localStorage.setItem(write.key, write.value);
                localStorage.setItem('hrt-replace-journal-v1', JSON.stringify(journal));
            },
            { journal, writes },
        );

        await page.reload();
        await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual([event('old-local', 2, old)]);
        expect(await readStorage(page, 'hrt-weight')).toBe(70);
        expect(await readStorage(page, REPLACE_JOURNAL_KEY)).toBeNull();

        // A committed journal means every key landed; recovery only removes it.
        const newEvents = [event('committed-new', 8, stamp(60_000))];
        const committed = {
            v: 1,
            phase: 'committed',
            createdAt: Date.now(),
            owner: 'local',
            writes: [{ key: 'hrt-events', value: JSON.stringify(newEvents) }],
            snapshot: [{ key: 'hrt-events', value: JSON.stringify([event('old-local', 2, old)]) }],
            checksum: journalChecksum(
                [{ key: 'hrt-events', value: JSON.stringify(newEvents) }],
                [{ key: 'hrt-events', value: JSON.stringify([event('old-local', 2, old)]) }],
            ),
        };
        await page.evaluate(
            ({ committed, newEvents }) => {
                localStorage.setItem('hrt-events', JSON.stringify(newEvents));
                localStorage.setItem('hrt-replace-journal-v1', JSON.stringify(committed));
            },
            { committed, newEvents },
        );
        await page.reload();
        await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
        expect(await readStorage<DoseEventFixture[]>(page, 'hrt-events')).toEqual(newEvents);
        expect(await readStorage(page, REPLACE_JOURNAL_KEY)).toBeNull();
    });
});

/**
 * The old records are gone, and are deletions now, so a cloud sync cannot
 * merge them back.
 */
function assertNoOldData(bundle: { modes: { transfem: BundleMode; transmasc: BundleMode } }): void {
    const { transfem, transmasc } = bundle.modes;
    const records = JSON.stringify([transfem, transmasc].map(({ deletions: _deletions, ...categories }) => categories));
    for (const old of ['old-local', 'old-masc', 'old-masc-lab']) expect(records).not.toContain(old);
    expect(Object.keys(transfem.deletions?.events ?? {})).toContain('old-local');
    expect(Object.keys(transmasc.deletions?.events ?? {})).toContain('old-masc');
    expect(Object.keys(transmasc.deletions?.labResults ?? {})).toContain('old-masc-lab');
}
