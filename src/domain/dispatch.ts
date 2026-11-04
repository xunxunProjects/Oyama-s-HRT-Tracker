import { Ester, Route } from './types';
import type { DoseEvent, ExtraKey, PKParams } from './types';
import type { PkRouteModule } from './shared/module';
import { isTestosteroneEster } from './constants';
import { e2Clearance, tClearance, zeroPKParams } from './shared/params';
import { e2InjectionModule } from './transfem/e2-injection';
import { e2SublingualModule } from './transfem/e2-sublingual';
import { e2GelModule } from './transfem/e2-gel';
import { e2PatchModule } from './transfem/e2-patch';
import { e2OralModule } from './transfem/e2-oral';
import { cpaOralModule } from './transfem/cpa-oral';
import { bicaOralModule } from './transfem/bica-oral';
import { tInjectionModule } from './transmasc/t-injection';
import { tScModule } from './transmasc/t-sc';
import { tGelModule } from './transmasc/t-gel';
import { tPatchModule } from './transmasc/t-patch';
import { tOralModule } from './transmasc/t-oral';
import { tNasalModule } from './transmasc/t-nasal';
import { tPelletModule } from './transmasc/t-pellet';

const MODULES: readonly PkRouteModule[] = [
    e2InjectionModule,
    e2SublingualModule,
    e2GelModule,
    e2PatchModule,
    e2OralModule,
    cpaOralModule,
    bicaOralModule,
    tInjectionModule,
    tScModule,
    tGelModule,
    tPatchModule,
    tOralModule,
    tNasalModule,
    tPelletModule,
];

const MODULE_BY_ROUTE_AND_ESTER = new Map<string, PkRouteModule>();
for (const module of MODULES) {
    for (const route of module.routes) {
        for (const ester of module.esters) {
            MODULE_BY_ROUTE_AND_ESTER.set(`${route}:${ester}`, module);
        }
    }
}

/** The module that owns this route/ester combination, or null when nothing models it. */
export function moduleFor(route: Route, ester: Ester): PkRouteModule | null {
    return MODULE_BY_ROUTE_AND_ESTER.get(`${route}:${ester}`) ?? null;
}

export function getBioavailabilityMultiplier(
    route: Route,
    ester: Ester,
    extras: Partial<Record<ExtraKey, number>> = {},
): number {
    const module = moduleFor(route, ester);
    return module ? module.bioavailability(route, ester, extras) : 0;
}

export function resolveParams(event: DoseEvent, birthYear: number | null): PKParams {
    const module = moduleFor(event.route, event.ester);
    if (module) return module.resolveParams(event, birthYear);

    // No route module owns this combination. Keep the old zeroed fallback, with
    // the clearance rate the event's hormone would have used.
    return zeroPKParams(
        isTestosteroneEster(event.ester) ? tClearance(event, birthYear) : e2Clearance(event, birthYear),
    );
}
