// Public API for the domain package. This file intentionally re-exports the
// original logic.ts surface one symbol at a time so internal helpers used by
// cross-module imports do not leak into the public API.

export type { DoseAdvisory, HormoneLevelAdvisory } from './advisories';
export { getDoseAdvisory, getHormoneLevelAdvisory } from './advisories';

export { computeCalibration } from './calibration/index';

export type { EKFState } from './calibration/legacy';
export { ekfStep, mipdDoseAdjust } from './calibration/legacy';

export type {
    CalibrationMethod,
    CalibrationHistoryMode,
    CalibrationPoint,
    CalibrationResult,
    BayesDriftFamily,
} from './calibration/types';
export { normalizeCalibrationMethod, computeCalibrationPoints, geometricMeanRatio } from './calibration/types';

export {
    T_ESTERS,
    isTestosteroneEster,
    UNMODELLED_DRUGS,
    GNRH_AGONISTS,
    isKnownEster,
    isDrugCode,
    isUnmodelledDrug,
    isEstradiolEster,
    LAB_ASSAYS,
    isLabAssay,
    activeCompoundName,
    getToE2Factor,
    SL_TIER_ORDER,
    SublingualTierParams,
    DEFAULT_PK_PARAMS,
    BODY_WEIGHT_KG_MIN,
    BODY_WEIGHT_KG_MAX,
    DOSE_MG_MAX,
    EVENT_TIME_H_MIN,
    EVENT_TIME_H_MAX,
    isPlausibleBodyWeightKG,
    BIRTH_YEAR_MIN,
    isPlausibleBirthYear,
} from './constants';

export type { CloudBundle } from './crypto';
export {
    decompressData,
    encryptData,
    decryptData,
    deriveCloudKey,
    isCloudEncrypted,
    encryptCloudPayload,
    decryptCloudPayload,
} from './crypto';

export { getBioavailabilityMultiplier } from './dispatch';

export type { AmenorrheaParams } from './features/amenorrhea';
export { DEFAULT_AMENORRHEA_PARAMS, amenorrheaHazard } from './features/amenorrhea';

export type { AssayPlatformParams } from './features/assay';
export { DEFAULT_ASSAY_PLATFORM_PARAMS, assayPlatformSigma, assayPlatformNoise } from './features/assay';

export type { BodyCompParams } from './features/bodyComp';
export { DEFAULT_BODY_COMP_PARAMS, bodyCompStep, bodyCompCurve } from './features/bodyComp';

export type { FiveARInhibition } from './features/fiveAlpha';
export { DEFAULT_5AR, dhtFromTestosterone } from './features/fiveAlpha';

export type { GnRHDepotParams } from './features/gnrh';
export { DEFAULT_GNRH_DEPOT, gnrhSuppression } from './features/gnrh';

export type { GonadectomyState } from './features/gonadectomy';
export { endogenousBackground, hasUterus } from './features/gonadectomy';

export type { HctParams } from './features/hct';
export { DEFAULT_HCT_PARAMS, hctStep } from './features/hct';

export type { HPGParams } from './features/hpg';
export { DEFAULT_HPG_PARAMS, hpgAxisCurve } from './features/hpg';

export type { LipidParams } from './features/lipids';
export { DEFAULT_LIPID_PARAMS, lipidCurve } from './features/lipids';

export type { PopPKCovariateParams } from './features/popPK';
export {
    AGE_REF_YEARS,
    ageAtH,
    DEFAULT_POP_PK_COVARIATE_PARAMS,
    popPKCovariateFactors,
    ageClearanceMultiplier,
} from './features/popPK';

export {
    freeTestosteroneNgDl,
    bioavailableTestosteroneNgDl,
    TT_SUPPRESSION_E0_PGML,
    TT_SUPPRESSION_K,
    estradiolTestosteroneSuppressionFactor,
    combinedTestosteroneSuppressionFactor,
    expectedTestosteroneNgDl,
} from './features/testosterone';

export type { VTEParams } from './features/vte';
export { DEFAULT_VTE_PARAMS, logistic, vteRiskCurve } from './features/vte';

export type { LabDoseContext } from './labs';
export {
    convertToPgMl,
    convertToNgDl,
    isT_LabUnit,
    E2_PK_UNIT_FACTORS,
    e2PgMlToPmolL,
    e2PmolLToPgMl,
    E2_PK_SAMPLING_OFFSETS_H,
    validateE2PKParams,
    sublingualHoldMin,
    labDoseContext,
    rawModelAtLab,
    labInModelUnit,
} from './labs';

export { PK_PARAM_RANGES, sanitizePKParams, applyPKOverrides, getActivePKParams } from './shared/activeParams';

export {
    interpolateConcentration_E2,
    interpolateConcentration_E2_free,
    interpolateConcentration_E2_bioavailable,
    interpolateConcentration_SHBG,
    interpolateConcentration_E2_free_dynamic,
    interpolateConcentration_rHPG,
    CPA_MIN_NGML,
    interpolateConcentration_CPA,
    interpolateConcentration_T_free,
    interpolateConcentration_BICA,
    interpolateConcentration_Bicalutamide,
    interpolateConcentration_T,
} from './simulation/interpolate';

export { runSimulationWithParams, runSimulation } from './simulation/runSimulation';

export type { TransmascIntegrationOptions, TransmascIntegrationResult } from './simulation/transmascIntegration';
export { integrateTransmascState } from './simulation/transmascIntegration';

export { BICALUTAMIDE_ORAL } from './transfem/bica-oral';

export { sublingualThetaFromHold, sublingualHoldFromTheta } from './transfem/e2-sublingual';

export { transitCompartmentAmount } from './transmasc/t-oral';

export type { HRTMode, DoseEvent, SimulationResult, LabResult, LabAssay, PKCustomParams } from './types';
export { Route, Ester, ExtraKey, GEL_SITE_ORDER } from './types';
