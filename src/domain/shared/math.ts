import type { PKParams } from '../types';

export function _expDivDiff1(x: number, y: number, tau: number): number {
    const z = (Math.abs(y - x) * tau) / 2;
    if (z > 1) return (Math.exp(-x * tau) - Math.exp(-y * tau)) / (x - y);
    const sinhc = z === 0 ? 1 : Math.sinh(z) / z;
    return -tau * Math.exp((-(x + y) / 2) * tau) * sinhc;
}

/**
 * Second divided difference of s ↦ e^(−sτ) at a, b and c. Written as the usual
 * sum of three exponentials over products of rate differences, it loses every
 * significant digit as two or three rates meet (testosterone enanthate's
 * absorption and elimination rates are equal by default). Here the outer
 * difference is taken across the widest pair of rates, and when all three sit
 * within 0.5/τ of each other a Taylor series about their mean is used instead:
 *   τ²·e^(−mτ) · Σ_j H_j(u) / (j + 2)!,   u_i = (m − k_i)·τ,
 * with H_j the complete homogeneous symmetric polynomial of degree j.
 */
export function _expDivDiff2(a: number, b: number, c: number, tau: number): number {
    if (a > b) [a, b] = [b, a];
    if (b > c) [b, c] = [c, b];
    if (a > b) [a, b] = [b, a];
    if ((c - a) * tau >= 0.5) return (_expDivDiff1(b, c, tau) - _expDivDiff1(a, b, tau)) / (c - a);
    const mean = (a + b + c) / 3;
    const ua = (mean - a) * tau;
    const ub = (mean - b) * tau;
    const uc = (mean - c) * tau;
    // H_j over {ua}, {ua, ub} and {ua, ub, uc}, built up one degree at a time.
    let h1 = 1;
    let h2 = 1;
    let h3 = 1;
    let fact = 2;
    let sum = 0.5;
    for (let j = 1; j < 20; j++) {
        h1 *= ua;
        h2 = h1 + ub * h2;
        h3 = h2 + uc * h3;
        fact *= j + 2;
        sum += h3 / fact;
    }
    return tau * tau * Math.exp(-mean * tau) * sum;
}

// 2-Compartment (Bateman) solution: absorption k_a → elimination k_e, no
// hydrolysis step. Used wherever there is no ester to cleave — the 3C form is
// multiplied by k2 throughout, so feeding it k2 = 0 returns a flat zero.
//   amount = dose·F·k_a·(e^(−k_e·τ) − e^(−k_a·τ)) / (k_a − k_e)
export function _analytic2C(tau: number, doseMG: number, F: number, ka: number, ke: number): number {
    if (ka <= 0 || doseMG <= 0) return 0;
    return -doseMG * F * ka * _expDivDiff1(ka, ke, tau);
}

// 3-Compartment Analytical Solution (sequential first-order: absorption k1 → ester
// hydrolysis k2 → central-compartment elimination k3). Returns the central-compartment
// amount for a bolus, scaled by dose·F:
//   amount = dose·F·k1·k2·Σ_i e^(−k_i·τ) / Π_(j≠i) (k_j − k_i)
// which is k1·k2 times the second divided difference of e^(−sτ) at the three
// rates, so coincident rates take their exact limit.
export function _analytic3C(tau: number, doseMG: number, F: number, k1: number, k2: number, k3: number): number {
    if (k1 <= 0 || doseMG <= 0) return 0;
    return doseMG * F * k1 * k2 * _expDivDiff2(k1, k2, k3, tau);
}

export function oneCompAmount(tau: number, doseMG: number, p: PKParams): number {
    return _analytic2C(tau, doseMG, p.F, p.k1_fast, p.k3);
}

/**
 * Pair each patch application with its own removal.
 *
 * Nothing on a patchRemove event says which application it ends, so the pairing
 * is inferred: walk the removals in time order and give each one the oldest
 * patch that is plausibly still on the skin at that moment. Picking the first
 * removal *after* each application instead (what a per-event `find` does) hands
 * the same early removal to every overlapping patch, so on a staggered
 * two-patch regimen the second patch would stop delivering when the first
 * comes off.
 *
 * A patch counts as "on" for a removal when it is of the same hormone (the form
 * writes estradiol or testosterone on a removal by mode), was applied at least
 * PATCH_MIN_WEAR_H earlier, and, if it has a planned wear time, that wear ended
 * no more than PATCH_REMOVAL_GRACE_H before the removal. So:
 *   - a patch that already came off by its planned wear does not soak up a
 *     later removal of a newer patch;
 *   - a removal logged a little late still ends the old patch, not the new one
 *     put on just before it;
 *   - a removal logged at the same moment as, or minutes after, a new
 *     application (the old patch was on before the log started, or the change
 *     was entered in the other order) does not end the new patch;
 *   - a removal that fits no patch by its plan ends the newest patch of that
 *     hormone if that one is still unpaired and the removal comes no more
 *     than PATCH_MAX_OVERWEAR_H after its planned end, so the newest patch,
 *     left on past its plan and taken off later, is worn until the removal.
 *     An older patch left on while a newer one went on is not: a removal
 *     that fits the newer one by its plan ends the newer one;
 *   - any other removal that fits no patch is ignored instead of consuming
 *     the next application and shifting every later pairing by one. That
 *     includes a removal logged weeks later to close out a patch after a
 *     pause or a change of route, which must not keep it delivering through
 *     the gap.
 * Ties between patches applied at the same time are broken by their own
 * contents, the same way on both paths, and removals at the same moment by
 * hormone, so the result never depends on the order of the input array.
 *
 * Keyed on event identity rather than `id` because imported files can carry
 * duplicate ids. Memoised per event array: the caller builds one array per
 * simulation and asks once per patch event.
 */
