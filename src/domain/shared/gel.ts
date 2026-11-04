import { ExtraKey, GEL_SITE_ORDER } from '../types';
import type { GelSite } from '../types';

/** Resolve the gel application site the same way every route module does. */
export function gelSiteFromExtras(extras: Partial<Record<ExtraKey, number>>): GelSite {
    const siteIdx = Math.min(GEL_SITE_ORDER.length - 1, Math.max(0, Math.round(extras[ExtraKey.gelSite] ?? 0)));
    return GEL_SITE_ORDER[siteIdx] as GelSite;
}
