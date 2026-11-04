// 5-alpha-reductase inhibition and DHT conversion.

// --- Other drugs: 5-alpha-reductase inhibitors (Phase 8.1) ---
//
// Finasteride (type II 5AR) / dutasteride (type I+II) reduce DHT formation
// from testosterone. Model as a fractional inhibition of the conversion.
export interface FiveARInhibition {
    type: 'finasteride' | 'dutasteride' | 'none';
    inhibition: number; // 0..1 fraction of DHT conversion blocked
}

export const DEFAULT_5AR: Record<string, FiveARInhibition> = {
    none: { type: 'none', inhibition: 0 },
    finasteride: { type: 'finasteride', inhibition: 0.7 },
    dutasteride: { type: 'dutasteride', inhibition: 0.95 },
};

export function dhtFromTestosterone(freeTNgDl: number, inhibition: number): number {
    const alpha = 0.1; // DHT ≈ 10% of free T in baseline state
    const inh = Math.max(0, Math.min(1, inhibition));
    return freeTNgDl * alpha * (1 - inh);
}
