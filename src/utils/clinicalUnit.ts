/** Stored lab units stay lowercase. What a person reads uses the clinical form. */
const CLINICAL: Record<string, string> = {
    'pg/ml': 'pg/mL',
    'pmol/l': 'pmol/L',
    'ng/dl': 'ng/dL',
    'nmol/l': 'nmol/L',
    'ng/ml': 'ng/mL',
};

export function clinicalUnit(unit: string): string {
    return CLINICAL[unit] ?? unit;
}
