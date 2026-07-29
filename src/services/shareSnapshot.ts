import { v4 as uuidv4 } from 'uuid';
import { DoseEvent, HRTMode, SimulationResult } from '../../logic';
import { SharedDosageSnapshot } from './sharing';

const MAX_SHARED_SIMULATION_POINTS = 2500;

const evenlySampleRange = (start: number, end: number, count: number): number[] => {
    if (count <= 0 || end < start) return [];
    const length = end - start + 1;
    if (length <= count) return Array.from({ length }, (_, index) => start + index);
    if (count === 1) return [end];
    return Array.from({ length: count }, (_, index) =>
        start + Math.round(index * (length - 1) / (count - 1))
    );
};

const nearestTimeIndex = (times: number[], target: number): number => {
    let low = 0;
    let high = times.length - 1;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (times[middle] < target) low = middle + 1;
        else high = middle;
    }
    if (low > 0 && Math.abs(times[low - 1] - target) < Math.abs(times[low] - target)) return low - 1;
    return low;
};

const sampleIndexes = (times: number[], events: DoseEvent[]): number[] => {
    if (times.length <= MAX_SHARED_SIMULATION_POINTS) {
        return Array.from({ length: times.length }, (_, index) => index);
    }

    const required = new Set<number>([0, times.length - 1]);
    for (const event of [...events].sort((a, b) => b.timeH - a.timeH).slice(0, 250)) {
        required.add(nearestTimeIndex(times, event.timeH));
    }

    const recentCutoffH = Date.now() / 3_600_000 - 30 * 24;
    let recentStart = times.findIndex(time => time >= recentCutoffH);
    if (recentStart < 0) recentStart = times.length - 1;

    const remaining = Math.max(0, MAX_SHARED_SIMULATION_POINTS - required.size);
    const olderLength = recentStart;
    const recentLength = times.length - recentStart;
    const olderBudget = olderLength > 0 ? Math.min(450, Math.floor(remaining * 0.2), olderLength) : 0;
    const recentBudget = Math.min(recentLength, remaining - olderBudget);
    const spare = remaining - olderBudget - recentBudget;

    evenlySampleRange(0, recentStart - 1, olderBudget + spare).forEach(index => required.add(index));
    evenlySampleRange(recentStart, times.length - 1, recentBudget).forEach(index => required.add(index));
    return [...required].sort((a, b) => a - b).slice(0, MAX_SHARED_SIMULATION_POINTS);
};

interface BuildShareSnapshotOptions {
    mode: HRTMode;
    events: DoseEvent[];
    simulation: SimulationResult | null;
    calibrationFn: (timeH: number) => number;
}

export const buildSharedDosageSnapshot = ({
    mode,
    events,
    simulation,
    calibrationFn,
}: BuildShareSnapshotOptions): SharedDosageSnapshot => {
    let sharedSimulation: SimulationResult | null = null;
    // useAppData clears the previous simulation one effect after the final
    // dosage is removed. Do not let that one-render lag keep an obsolete curve
    // in a live snapshot whose event history is already empty.
    if (simulation && events.length > 0) {
        const indexes = sampleIndexes(simulation.timeH, events);
        // Preserve the sender's calibrated curve without disclosing the lab
        // values or weight used to calibrate it.
        const calibratedE2 = indexes.map(sourceIndex =>
            simulation.concPGmL_E2[sourceIndex] * calibrationFn(simulation.timeH[sourceIndex])
        );
        sharedSimulation = {
            timeH: indexes.map(index => simulation.timeH[index]),
            concPGmL_CPA: indexes.map(index => simulation.concPGmL_CPA[index]),
            concNGdL_T: indexes.map(index => simulation.concNGdL_T[index]),
            concPGmL_E2: calibratedE2,
            concPGmL: calibratedE2,
            auc: simulation.auc,
        };
    }

    return {
        version: 1,
        mode,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        createdAt: Date.now(),
        // Never send the app's stable local event IDs to the share service.
        events: events.map(event => ({
            ...event,
            id: uuidv4(),
            extras: { ...event.extras },
        })),
        simulation: sharedSimulation,
    };
};
