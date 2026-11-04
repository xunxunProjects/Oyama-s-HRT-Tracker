import type { DoseEvent, Ester, ExtraKey, PKParams, Route } from '../types';

export interface AmountModel {
    amount: (timeH: number) => number;
    swallowed: (timeH: number) => number;
}

/**
 * One drug × route module. The parent dispatcher (`../dispatch.ts`) selects a
 * module by `route + ester`; everything else lives here, next to the constants
 * and comments it belongs to.
 */
export interface PkRouteModule {
    readonly routes: readonly Route[];
    readonly esters: readonly Ester[];
    bioavailability(route: Route, ester: Ester, extras: Partial<Record<ExtraKey, number>>): number;
    resolveParams(event: DoseEvent, birthYear: number | null): PKParams;
    buildAmount(event: DoseEvent, allEvents: DoseEvent[], params: PKParams): AmountModel;
}
