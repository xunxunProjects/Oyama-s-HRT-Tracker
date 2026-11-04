// --- Calibration stack (Phase 9.1): scalar EKF + MIPD dose adjustment ---
export interface EKFState {
    x: number;
    P: number;
}
export function ekfStep(
    state: EKFState,
    z: number,
    f: (x: number) => number,
    h: (x: number) => number,
    F: number, // df/dx
    H: number, // dh/dx
    Q: number,
    R: number,
): EKFState {
    const xPred = f(state.x);
    const PPred = F * state.P * F + Q;
    const S = H * PPred * H + R;
    const K = (PPred * H) / S;
    const xUpd = xPred + K * (z - h(xPred));
    const PUpd = (1 - K * H) * PPred;
    return { x: xUpd, P: PUpd };
}

export function mipdDoseAdjust(currentDose: number, predicted: number, target: number): number {
    if (predicted <= 0) return currentDose;
    return currentDose * (target / predicted);
}
