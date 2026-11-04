// Assay platform error model.
import type { LabAssay } from '../types';

// --- Assay platform error model (A6) ---
export interface AssayPlatformParams {
    sigmaImmuno: number; // pg/mL additive floor / SD
    sigmaLcms: number;
}
export const DEFAULT_ASSAY_PLATFORM_PARAMS: AssayPlatformParams = {
    sigmaImmuno: 8,
    sigmaLcms: 2,
};

export function assayPlatformSigma(
    platform: LabAssay | 'unknown' = 'unknown',
    params: AssayPlatformParams = DEFAULT_ASSAY_PLATFORM_PARAMS,
): number {
    if (platform === 'immuno') return params.sigmaImmuno;
    if (platform === 'lcms') return params.sigmaLcms;
    return (params.sigmaImmuno + params.sigmaLcms) / 2;
}

export function assayPlatformNoise(
    c: number,
    platform: LabAssay | 'unknown' = 'unknown',
    params: AssayPlatformParams = DEFAULT_ASSAY_PLATFORM_PARAMS,
): { mean: number; sigma: number } {
    return { mean: c, sigma: assayPlatformSigma(platform, params) };
}
