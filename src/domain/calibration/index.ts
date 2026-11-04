import type { CalibrationHistoryMode, CalibrationMethod, CalibrationResult } from './types';
import { computeCalibrationPoints } from './types';
import type { DoseEvent, LabResult, SimulationResult } from '../types';
import {
    buildClearanceField,
    clampFactor,
    clearanceIdentifiable,
    constantFactor,
    curveFitErrPct,
    ekfFit,
    mipdFit,
    ouCalibrate,
    piecewiseFactor,
} from './estimators';
import { bayesCalibrate } from './bayes';

export type {
    BayesDriftFamily,
    CalibrationHistoryMode,
    CalibrationMethod,
    CalibrationPoint,
    CalibrationResult,
} from './types';
export { computeCalibrationPoints, geometricMeanRatio, normalizeCalibrationMethod } from './types';

export function computeCalibration(
    baselineSim: SimulationResult | null,
    events: DoseEvent[],
    bodyWeightKG: number,
    results: LabResult[],
    method: CalibrationMethod = 'mipd',
    historyMode: CalibrationHistoryMode = 'retrospective',
    /** The one `baselineSim` was run with: the clearance grid reruns the model and must match it. */
    birthYear: number | null = null,
): CalibrationResult {
    const points = computeCalibrationPoints(baselineSim, results);
    const identity: CalibrationResult = {
        method,
        factorFn: () => 1,
        scale: 1,
        kMul: 1,
        halfLifeDeltaPct: 0,
        n: points.length,
        fitErrPct: null,
        points,
    };
    if (method === 'off' || !baselineSim || points.length === 0) return identity;

    const n = points.length;
    const logObs = points.map(p => Math.log(p.obs));
    const labTimes = points.map(p => p.timeH);

    // OU-Kalman models a time-varying amplitude correction; no clearance grid needed.
    if (method === 'ou_kalman') {
        const out = ouCalibrate(points, historyMode);
        return { method, ...out, fitErrPct: curveFitErrPct(points, out.factorFn), n, points };
    }

    // EKF, MIPD and Full Bayes identify amplitude + clearance; all share the
    // clearance field. Whether clearance may move is decided per prefix of the
    // labs, so in forward mode a later lab never changes the segments before it.
    const field = buildClearanceField(baselineSim, events, bodyWeightKG, labTimes, birthYear);

    if (method === 'bayes') {
        const out = bayesCalibrate(field, points, historyMode);
        return { method, ...out, n, fitErrPct: curveFitErrPct(points, out.factorFn), points };
    }

    const fit = (count: number) =>
        method === 'ekf'
            ? ekfFit(field, logObs, count, clearanceIdentifiable(labTimes, count))
            : mipdFit(field, logObs, count, clearanceIdentifiable(labTimes, count));

    let factorFn: (timeH: number) => number;
    let aRep: number, kRep: number;
    if (historyMode === 'forward') {
        const params = Array.from({ length: n }, (_, i) => fit(i + 1));
        factorFn = piecewiseFactor(field, labTimes, params);
        aRep = params[n - 1].a;
        kRep = params[n - 1].k;
    } else {
        const f = fit(n);
        aRep = f.a;
        kRep = f.k;
        factorFn = constantFactor(field, aRep, kRep);
    }

    const kMul = Math.exp(kRep);
    return {
        method,
        factorFn,
        scale: clampFactor(Math.exp(aRep)),
        kMul,
        halfLifeDeltaPct: (1 / kMul - 1) * 100, // half-life ∝ 1/clearance
        n,
        fitErrPct: curveFitErrPct(points, factorFn),
        points,
    };
}
