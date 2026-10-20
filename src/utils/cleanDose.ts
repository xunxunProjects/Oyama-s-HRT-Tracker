/**
 * Tidy a stored dose in mg without changing what it means.
 *
 * Doses saved by converting through the E2-equivalent field picked up a
 * float tail from that field's three decimals, e.g. 12.5 mg CPA stored as
 * 12.499934062706513. A value within 0.01% of a whole microgram (three
 * decimals) snaps to it; anything else is only cut to 6 significant figures,
 * so a typed 0.0375 stays 0.0375. Either way the change is at most 0.01% of
 * the dose, well below anything the app shows or the model can tell apart.
 */
export const cleanDoseMG = (mg: number): number => {
    if (!Number.isFinite(mg) || mg === 0) return mg;
    const micrograms = Math.round(mg * 1000) / 1000;
    if (micrograms !== 0 && Math.abs(micrograms - mg) <= Math.abs(mg) * 1e-4) return micrograms;
    return Number(mg.toPrecision(6));
};
