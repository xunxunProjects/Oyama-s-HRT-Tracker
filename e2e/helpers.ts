import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

export const APP_ORIGIN = 'http://127.0.0.1:3000';
export const API_ORIGIN = 'http://127.0.0.1:8787';
export const SYNTHETIC_PASSWORD = 'Synthetic-E2E-Pass-2026!';

export type Mode = 'transfem' | 'transmasc';
export type ModeKey = Mode;

export interface DoseEventFixture {
    id: string;
    route: string;
    ester: string;
    doseMG: number;
    timeH: number;
    extras: Record<string, number>;
    updatedAt?: number;
}

export interface LabFixture {
    id: string;
    timeH: number;
    concValue: number;
    unit: string;
    updatedAt?: number;
}

export interface TemplateFixture {
    id: string;
    name: string;
    route: string;
    ester: string;
    doseMG: number;
    extras: Record<string, number>;
    createdAt: number;
    updatedAt?: number;
}

export interface QuickDoseFixture {
    id: string;
    route: string;
    ester: string;
    value: number;
    createdAt: number;
}

export interface SupplyFixture {
    id: string;
    route: string;
    ester: string;
    pack: Record<string, unknown>;
    count: number;
    startedAt: number;
}

export interface PlanFixture {
    id: string;
    route: string;
    ester: string;
    doseMG: number;
    extras: Record<string, number>;
    everyDays: number;
    timesPerDay: number;
}

export interface BundleMode {
    events?: DoseEventFixture[];
    labResults?: LabFixture[];
    doseTemplates?: TemplateFixture[];
    quickDoses?: QuickDoseFixture[];
    supplies?: SupplyFixture[];
    plan?: PlanFixture[];
    deletions?: {
        events?: Record<string, number>;
        labResults?: Record<string, number>;
        doseTemplates?: Record<string, number>;
    };
}

export interface BundleFixture {
    format: string;
    formatVersion: number;
    createdAt: string;
    mode: ModeKey;
    sourceAccount?: string;
    modes: Record<ModeKey, BundleMode>;
    weight?: number;
    weightUpdatedAt?: number;
    pkParams?: Record<string, number> | null;
    pkParamsUpdatedAt?: number;
    calibration: { method: string; historyMode: string };
    preferences: Record<string, unknown>;
}

const MODE_KEYS: ModeKey[] = ['transfem', 'transmasc'];

/** A plausible time in hours since the epoch, close to the test's "now". */
export const nowHours = (): number => Math.floor(Date.now() / 3_600_000);

/** A stamp old enough not to hit the importer's clock-skew guard. */
export const stamp = (ageMs = 3_600_000): number => Date.now() - ageMs;

export function emptyMode(): BundleMode {
    return {
        events: [],
        labResults: [],
        doseTemplates: [],
        quickDoses: [],
        supplies: [],
        plan: [],
        deletions: { events: {}, labResults: {}, doseTemplates: {} },
    };
}

export function makeBundle(overrides: Partial<BundleFixture> = {}): BundleFixture {
    const modes: Record<ModeKey, BundleMode> = {
        transfem: emptyMode(),
        transmasc: emptyMode(),
    };
    return {
        format: 'oyama-hrt-complete-backup',
        formatVersion: 1,
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        mode: 'transfem',
        modes,
        calibration: { method: 'mipd', historyMode: 'retrospective' },
        preferences: {},
        ...overrides,
    };
}

/**
 * Seed localStorage once per browser context, before the app first runs.
 * The sessionStorage guard matters: without it every reload would re-seed the
 * old values and hide whether the app actually persisted the import.
 */
export async function seedStorage(context: BrowserContext, values: Record<string, string>): Promise<void> {
    await context.addInitScript((entries: Record<string, string>) => {
        if (sessionStorage.getItem('e2e-storage-seeded') === '1') return;
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        sessionStorage.setItem('e2e-storage-seeded', '1');
    }, values);
}

export function baseStorage(extra: Record<string, string> = {}): Record<string, string> {
    return {
        'app-onboarded': 'true',
        'hrt-lang': 'en',
        'app-auto-backup': 'false',
        'hrt-cal-method': 'ekf',
        'hrt-cal-history-mode': 'retrospective',
        ...extra,
    };
}

export async function gotoApp(page: Page): Promise<void> {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
}

export async function openExport(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Export Data', exact: true }).click();
    await expect(page.getByRole('button', { name: /Complete backup/ })).toBeVisible();
}

export async function openImport(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Import Data', exact: true }).click();
    await expect(page.getByRole('button', { name: /Paste JSON Text/ })).toBeVisible();
}

export async function pasteAndImport(page: Page, text: string): Promise<void> {
    await openImport(page);
    const box = page.getByPlaceholder('Paste JSON content here...');
    // A failed import keeps the paste box open with the old text, so only
    // toggle it when it is actually closed.
    if (!(await box.isVisible())) {
        await page.getByRole('button', { name: /Paste JSON Text/ }).click();
    }
    await box.fill(text);
    await page.getByRole('button', { name: 'Import', exact: true }).click();
}

export async function pasteAndReplace(page: Page, text: string): Promise<void> {
    await openImport(page);
    const box = page.getByPlaceholder('Paste JSON content here...');
    if (!(await box.isVisible())) {
        await page.getByRole('button', { name: /Paste JSON Text/ }).click();
    }
    await box.fill(text);
    await page.getByRole('button', { name: 'Replace device', exact: true }).click();
}

export function dialogMessage(page: Page): ReturnType<Page['locator']> {
    return page.locator('#app-dialog-message');
}

export async function confirmDialog(page: Page, buttonName: string): Promise<void> {
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: buttonName, exact: true }).click();
}

export async function dismissAlert(page: Page): Promise<void> {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
}

export async function readStorage<T = unknown>(page: Page, key: string): Promise<T | null> {
    const raw = await page.evaluate(k => localStorage.getItem(k), key);
    if (raw === null) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        // Scalars such as calibration method and theme are stored as plain
        // strings, not JSON.
        return raw as unknown as T;
    }
}

export async function downloadCompleteBackup(page: Page): Promise<BundleFixture> {
    await openExport(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Complete backup/ }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Download an unencrypted backup?');
    await dialog.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error('complete backup download has no path');
    return JSON.parse(await readFile(path, 'utf8')) as BundleFixture;
}

export interface RegisteredUser {
    token: string;
    user: { id: string; username: string; isAdmin?: boolean };
    devicePass?: string;
}

let userSeq = 0;

export async function registerUser(request: APIRequestContext, label = 'a'): Promise<RegisteredUser> {
    userSeq += 1;
    const username = `e2e-${label}-${Date.now().toString(36)}-${userSeq}`;
    const res = await request.post(`${API_ORIGIN}/api/register`, {
        data: { username, password: SYNTHETIC_PASSWORD },
    });
    expect(res.status(), await res.text()).toBe(201);
    return (await res.json()) as RegisteredUser;
}

export function signedInStorage(user: RegisteredUser, extra: Record<string, string> = {}): Record<string, string> {
    return baseStorage({
        auth_token: user.token,
        auth_user: JSON.stringify(user.user),
        login_device_passes: JSON.stringify({ [user.user.username]: user.devicePass ?? '' }),
        ...extra,
    });
}

/** The exported bundle must never carry these keys or sentinel values. */
export const CREDENTIAL_KEYS = [
    'auth_token',
    'auth_user',
    'login_device_passes',
    'device_pass',
    'password',
    'cloudKey',
    'app-auto-backup',
    'app-dev-mode',
    'app-onboarded',
];

export function assertNoCredentials(value: unknown): void {
    const text = JSON.stringify(value);
    for (const key of CREDENTIAL_KEYS) expect(text).not.toContain(key);
    expect(text).not.toContain('SECRET-TOKEN-SENTINEL');
    expect(text).not.toContain('SECRET-DEVICE-PASS');
    expect(text).not.toContain(SYNTHETIC_PASSWORD);
}

/** Sort by id so a merge's storage order is not mistaken for a data change. */
const byId = (records: { id: string }[] | undefined) =>
    records ? [...records].sort((a, b) => a.id.localeCompare(b.id)) : records;

const stableMode = (mode: BundleMode | undefined) => ({
    events: byId(mode?.events),
    labResults: byId(mode?.labResults),
    doseTemplates: byId(mode?.doseTemplates),
    quickDoses: byId(mode?.quickDoses),
    supplies: byId(mode?.supplies),
    plan: byId(mode?.plan),
    deletions: mode?.deletions,
});

/** Compare the parts of a bundle that a restore must reproduce exactly. */
export function stableBundle(bundle: BundleFixture): unknown {
    return {
        format: bundle.format,
        formatVersion: bundle.formatVersion,
        mode: bundle.mode,
        modes: {
            transfem: stableMode(bundle.modes.transfem),
            transmasc: stableMode(bundle.modes.transmasc),
        },
        weight: bundle.weight,
        weightUpdatedAt: bundle.weightUpdatedAt,
        pkParams: bundle.pkParams,
        pkParamsUpdatedAt: bundle.pkParamsUpdatedAt,
        calibration: bundle.calibration,
        preferences: bundle.preferences,
    };
}

export const modeKeys = MODE_KEYS;
