// Amenorrhea hazard model (transmasculine).

// --- Amenorrhea hazard (transmasculine, Phase 6.1) ---
//
// Time-to-event hazard for amenorrhea/bleeding suppression on testosterone.
// h = h0 + hT*sigmoid(C_avg30d - thetaT) + hE*sigmoid(thetaE - C_E2)
export interface AmenorrheaParams {
    h0: number;
    hT: number;
    hE: number;
    thetaT: number; // ng/dL
    thetaE: number; // pg/mL
}

export const DEFAULT_AMENORRHEA_PARAMS: AmenorrheaParams = {
    h0: 0.001,
    hT: 0.01,
    hE: 0.005,
    thetaT: 400,
    thetaE: 50,
};

function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

export function amenorrheaHazard(
    avgTNgDl: number,
    e2PgMl: number,
    params: AmenorrheaParams = DEFAULT_AMENORRHEA_PARAMS,
): number {
    const { h0, hT, hE, thetaT, thetaE } = params;
    return h0 + hT * sigmoid(avgTNgDl - thetaT) + hE * sigmoid(thetaE - e2PgMl);
}
