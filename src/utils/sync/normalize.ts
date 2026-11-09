import { isPlausibleBirthYear, isTestosteroneEster, isT_LabUnit } from '../../../logic';
import type { ModeBlock, ModeKey, SyncState } from './types';
import { emptySyncState } from './types';
import { sanitizeTombstones } from './tombstones';

function asArray(value: unknown): any[] {
    return Array.isArray(value) ? value : [];
}

function routeFlatPayload(payload: any, modes: Record<ModeKey, ModeBlock>): void {
    for (const ev of asArray(payload.events)) {
        modes[isTestosteroneEster(ev.ester) ? 'transmasc' : 'transfem'].events.push(ev);
    }
    for (const lab of asArray(payload.labResults)) {
        modes[isT_LabUnit(lab.unit) ? 'transmasc' : 'transfem'].labResults.push(lab);
    }
    for (const tpl of asArray(payload.doseTemplates)) {
        modes[isTestosteroneEster(tpl.ester) ? 'transmasc' : 'transfem'].doseTemplates.push(tpl);
    }
}

export function normalizeSyncState(payload: unknown): SyncState {
    const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
    const state = emptySyncState();

    // v2 shape: payload.modes
    if (p.modes && typeof p.modes === 'object') {
        for (const mk of ['transfem', 'transmasc'] as ModeKey[]) {
            const mb = (p.modes as Record<string, unknown>)[mk];
            if (!mb || typeof mb !== 'object') continue;
            const m = mb as Record<string, unknown>;
            state.modes[mk].events = asArray(m.events);
            state.modes[mk].labResults = asArray(m.labResults);
            state.modes[mk].doseTemplates = asArray(m.doseTemplates);
            state.modes[mk].deletions = sanitizeTombstones(m.deletions);
            if (m.plan !== undefined) state.modes[mk].plan = asArray(m.plan);
            if (typeof m.planUpdatedAt === 'number') state.modes[mk].planUpdatedAt = m.planUpdatedAt;
        }
    } else {
        // v1 flat shape
        routeFlatPayload(p, state.modes);
        if (p.plan !== undefined) state.modes.transfem.plan = asArray(p.plan);
        if (typeof p.planUpdatedAt === 'number') state.modes.transfem.planUpdatedAt = p.planUpdatedAt;
    }

    if (typeof p.weight === 'number' && Number.isFinite(p.weight)) state.weight = p.weight;
    if (typeof p.weightUpdatedAt === 'number') state.weightUpdatedAt = p.weightUpdatedAt;
    if (p.birthYear === null || typeof p.birthYear === 'number') {
        state.birthYear = p.birthYear as number | null;
    }
    if (typeof p.birthYearUpdatedAt === 'number') state.birthYearUpdatedAt = p.birthYearUpdatedAt;
    if (p.pkParams && typeof p.pkParams === 'object') state.pkParams = p.pkParams;
    if (typeof p.pkParamsUpdatedAt === 'number') state.pkParamsUpdatedAt = p.pkParamsUpdatedAt;
    if (p.modelSettings && typeof p.modelSettings === 'object') state.modelSettings = p.modelSettings;
    if (typeof p.modelSettingsUpdatedAt === 'number') state.modelSettingsUpdatedAt = p.modelSettingsUpdatedAt;

    if (typeof state.weight === 'number' && !Number.isFinite(state.weight)) state.weight = undefined;
    if (typeof state.birthYear === 'number' && !isPlausibleBirthYear(state.birthYear)) state.birthYear = null;

    return state;
}
