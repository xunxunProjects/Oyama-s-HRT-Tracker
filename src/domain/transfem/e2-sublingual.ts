import { Ester, ExtraKey, Route } from '../types';
import type { PkRouteModule } from '../shared/module';
import { EsterPK, OralPK, SL_TIER_ORDER, SublingualTierParams, getToE2Factor } from '../constants';
import { _activePKParams } from '../shared/activeParams';
import { e2Clearance } from '../shared/params';
import { buildSublingualAmount } from '../shared/amounts';

export function _getSLTheta(tierKey: string): number {
    const p = _activePKParams;
    if (tierKey === 'quick') return p.e2_sl_quick;
    if (tierKey === 'casual') return p.e2_sl_casual;
    if (tierKey === 'strict') return p.e2_sl_strict;
    return p.e2_sl_standard;
}

/**
 * θ for a custom sublingual hold time in minutes, interpolated between the
 * tiers as currently in effect (custom PK parameters included). Below the
 * shortest tier the line runs on down to θ = 0. Past the longest tier θ follows
 * the dissolution-and-swallowing model the tiers were computed from, which
 * levels off as the dissolved drug runs out (about 0.34 at 30 minutes and 0.45
 * at 60 with the default tiers); the straight line used to run on to 0.81 at
 * 60 minutes.
 */
export function sublingualThetaFromHold(holdMin: number): number {
    if (!(holdMin > 0)) return 0;
    const pts = _slHoldPoints();
    const h = Math.max(1, holdMin);
    const last = pts[pts.length - 1];
    if (h >= last.hold) return _slThetaPastTiers(h, last);
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (h >= p1.hold && h <= p2.hold) {
            const t = (h - p1.hold) / (p2.hold - p1.hold || 1);
            return Math.min(1, Math.max(0, p1.theta + (p2.theta - p1.theta) * t));
        }
    }
    const slope = (pts[1].theta - pts[0].theta) / (pts[1].hold - pts[0].hold || 1);
    return Math.min(1, Math.max(0, pts[0].theta + (h - pts[0].hold) * slope));
}

/**
 * The hold time in minutes behind a stored custom θ, for showing it again: the
 * inverse of sublingualThetaFromHold, up to the 60 minutes the dose form
 * offers. A θ no hold of 60 minutes or less reaches (one saved while the
 * straight line still ran on) shows as 60. Rounded to hundredths of a minute:
 * the inverse lands a few ulps off (30 comes back as 29.999999999999993), and
 * the dose form puts this number in the hold field as it is.
 */
export function sublingualHoldFromTheta(theta: number): number {
    return Math.round(_slHoldFromTheta(theta) * 100) / 100;
}

function _slHoldFromTheta(theta: number): number {
    const pts = _slHoldPoints();
    const last = pts[pts.length - 1];
    if (theta > last.theta) {
        if (theta >= _slThetaPastTiers(SL_MAX_HOLD_MIN, last)) return SL_MAX_HOLD_MIN;
        let lo = last.hold;
        let hi = SL_MAX_HOLD_MIN;
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (_slThetaPastTiers(mid, last) < theta) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }
    for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        if (theta >= Math.min(p1.theta, p2.theta) && theta <= Math.max(p1.theta, p2.theta)) {
            const t = (theta - p1.theta) / (p2.theta - p1.theta || 1);
            return p1.hold + (p2.hold - p1.hold) * t;
        }
    }
    const slope = (pts[1].hold - pts[0].hold) / (pts[1].theta - pts[0].theta || 1);
    return Math.max(1, pts[0].hold + (theta - pts[0].theta) * slope);
}

const SL_MAX_HOLD_MIN = 60;

/**
 * Fraction of a sublingual dose absorbed through the mucosa within a hold of
 * `holdMin` minutes, from the model in Algorithm Explanation §6.2 (middle
 * scenario): the tablet dissolves with a 5-minute half-life, and dissolved
 * drug is absorbed at k_SL = 1.8 h⁻¹ or swallowed at 1.8 h⁻¹. It gives 0.007,
 * 0.038, 0.112 and 0.189 at the tiers' 2, 5, 10 and 15 minutes (the tiers round
 * these to 0.01, 0.04, 0.11 and 0.18) and tends to k_SL / (k_SL + k_sw) = 0.5.
 */
function _slThetaModel(holdMin: number): number {
    const kDiss = Math.LN2 / (5 / 60);
    const kOut = OralPK.kAbsSL + 1.8;
    const T = holdMin / 60;
    return (
        ((OralPK.kAbsSL * kDiss) / (kDiss - kOut)) *
        ((1 - Math.exp(-kOut * T)) / kOut - (1 - Math.exp(-kDiss * T)) / kDiss)
    );
}

/** θ past the longest tier: the model's curve, scaled to meet that tier's θ as in effect. */
function _slThetaPastTiers(holdMin: number, last: { hold: number; theta: number }): number {
    return Math.min(1, (last.theta * _slThetaModel(holdMin)) / _slThetaModel(last.hold));
}

function _slHoldPoints(): { hold: number; theta: number }[] {
    return SL_TIER_ORDER.map(k => ({ hold: SublingualTierParams[k].hold, theta: _getSLTheta(k) })).sort(
        (a, b) => a.hold - b.hold,
    );
}

export const e2SublingualModule: PkRouteModule = {
    routes: [Route.sublingual],
    esters: [Ester.E2, Ester.EB, Ester.EV, Ester.EC, Ester.EN, Ester.EU],
    bioavailability(_route, ester, extras) {
        let theta = _activePKParams.e2_sl_standard;
        if (extras[ExtraKey.sublingualTheta] !== undefined) {
            const customTheta = extras[ExtraKey.sublingualTheta];
            if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                theta = Math.min(1, Math.max(0, customTheta));
            }
        } else if (extras[ExtraKey.sublingualTier] !== undefined) {
            const tierIdx = Math.min(
                SL_TIER_ORDER.length - 1,
                Math.max(0, Math.round(extras[ExtraKey.sublingualTier]!)),
            );
            const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
            theta = _getSLTheta(tierKey);
        }
        return (theta + (1 - theta) * _activePKParams.e2_oral_bio) * getToE2Factor(ester);
    },
    resolveParams(event, birthYear) {
        const extras = event.extras ?? {};
        let theta = _activePKParams.e2_sl_standard;
        if (extras[ExtraKey.sublingualTheta] !== undefined) {
            const customTheta = extras[ExtraKey.sublingualTheta];
            if (typeof customTheta === 'number' && Number.isFinite(customTheta)) {
                theta = Math.min(1, Math.max(0, customTheta));
            }
        } else if (extras[ExtraKey.sublingualTier] !== undefined) {
            const tierRaw = extras[ExtraKey.sublingualTier];
            if (typeof tierRaw === 'number' && Number.isFinite(tierRaw)) {
                const tierIdx = Math.min(SL_TIER_ORDER.length - 1, Math.max(0, Math.round(tierRaw)));
                const tierKey = SL_TIER_ORDER[tierIdx] || 'standard';
                theta = _getSLTheta(tierKey);
            }
        }
        const toE2 = getToE2Factor(event.ester);
        const k1_fast = OralPK.kAbsSL;
        const k1_slow = event.ester === Ester.EV ? OralPK.kAbsEV : OralPK.kAbsE2;
        const k2 = EsterPK.k2[event.ester] ?? 0;
        const k2_slow = event.ester === Ester.EV ? 0 : OralPK.kE1Pool;
        const F_fast = toE2;
        const F_slow = _activePKParams.e2_oral_bio * toE2;
        const F = theta * F_fast + (1 - theta) * F_slow;
        return {
            Frac_fast: theta,
            k1_fast,
            k1_slow,
            k2,
            k2_slow,
            k3: e2Clearance(event, birthYear),
            F,
            rateMGh: 0,
            F_fast,
            F_slow,
        };
    },
    buildAmount(event, _allEvents, params) {
        return buildSublingualAmount(event, params);
    },
};
