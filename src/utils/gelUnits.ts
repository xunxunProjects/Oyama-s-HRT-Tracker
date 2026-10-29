/**
 * Estradiol gel is sold by count — a ruler, a pump, a sachet — and the same
 * count means different amounts in different packs: one 爱斯妥 ruler is
 * 2.5 g / 1.5 mg, while one Oestrogel pump is 1.25 g / 0.75 mg. Conversion
 * therefore belongs to the product and its spec, not to a generic "pump".
 *
 * Sources: 爱斯妥 (Oestrogel) Chinese label, 0.06%, 1 计量尺 = 2.5 g =
 * 1.5 mg; Oestrogel / EstroGel pump label, 1 pump = 1.25 g = 0.75 mg;
 * Sandrena 0.1% sachets, 0.5 g = 0.5 mg and 1 g = 1 mg; Divigel 0.1%
 * sachets, 0.25–1.25 g = 0.25–1.25 mg; 0.06% gel, 1 g = 0.6 mg.
 */
export interface GelPreset {
    id: string;
    /** i18n key for a name that changes with language. */
    labelKey?: string;
    /** Brand and spec as printed on the box; brand names stay as written. */
    label?: string;
    /** i18n key for one counted unit. */
    unitKey: string;
    gramsPerUnit: number;
    /** Estradiol in one unit, not the weight of the gel. */
    mgPerUnit: number;
}

export const GEL_PRESETS: readonly GelPreset[] = [
    {
        id: 'oestrogel-cn-ruler',
        labelKey: 'gel.product.oestrogel_cn',
        unitKey: 'gel.unit.ruler',
        gramsPerUnit: 2.5,
        mgPerUnit: 1.5,
    },
    {
        id: 'oestrogel-pump',
        label: 'Oestrogel / EstroGel',
        unitKey: 'supplies.unit.pump',
        gramsPerUnit: 1.25,
        mgPerUnit: 0.75,
    },
    {
        id: 'sandrena-05',
        label: 'Sandrena 0.5 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 0.5,
        mgPerUnit: 0.5,
    },
    {
        id: 'sandrena-1',
        label: 'Sandrena 1 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 1,
        mgPerUnit: 1,
    },
    {
        id: 'divigel-025',
        label: 'Divigel 0.25 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 0.25,
        mgPerUnit: 0.25,
    },
    {
        id: 'divigel-05',
        label: 'Divigel 0.5 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 0.5,
        mgPerUnit: 0.5,
    },
    {
        id: 'divigel-075',
        label: 'Divigel 0.75 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 0.75,
        mgPerUnit: 0.75,
    },
    {
        id: 'divigel-1',
        label: 'Divigel 1 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 1,
        mgPerUnit: 1,
    },
    {
        id: 'divigel-125',
        label: 'Divigel 1.25 g',
        unitKey: 'supplies.unit.sachet',
        gramsPerUnit: 1.25,
        mgPerUnit: 1.25,
    },
    {
        id: 'generic-006',
        labelKey: 'gel.product.generic_006',
        unitKey: 'gel.unit.gram',
        gramsPerUnit: 1,
        mgPerUnit: 0.6,
    },
];

/** Estradiol mg for a count of units, or null when either number is unusable. */
export const convertGelAmount = (amount: number, mgPerUnit: number): number | null => {
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (!Number.isFinite(mgPerUnit) || mgPerUnit <= 0) return null;
    return amount * mgPerUnit;
};

/** A dose the mg field can hold: at most three decimals, no trailing zeros. */
export const formatGelMG = (mg: number): string => mg.toFixed(3).replace(/\.?0+$/, '');
