export const BICALUTAMIDE_ORAL = (() => {
    const tHalfH = 5.8 * 24;
    const ke = Math.LN2 / tHalfH;
    const clfLh = 0.8; // L/h, apparent oral clearance / F
    const vdPerKG = clfLh / ke / 70; // L/kg at the 70 kg reference
    // Back-calculate ka from Tmax ≈ 31 h.
    const targetTmax = 31;
    let lo = ke + 1e-12;
    let hi = 10;
    for (let i = 0; i < 200; i++) {
        const mid = (lo + hi) / 2;
        const tm = Math.log(mid / ke) / (mid - ke);
        if (tm > targetTmax) lo = mid;
        else hi = mid;
    }
    const ka = (lo + hi) / 2;
    return { F: 1, ka, ke, beta: ke, tHalfH, clfLh, vdPerKG, tmaxH: targetTmax };
})();
export const BICALUTAMIDE_ORAL_F = BICALUTAMIDE_ORAL.F;
