import { describe, expect, it } from 'vitest';

function rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

describe('PK cross-validation 500k', () => {
    it('analytical vs RK4 discrepancy > 20 in fewer than 200 cases', () => {
        let errors = 0;
        for (let i = 0; i < 500_000; i++) {
            const ka = rand(0.01, 5);
            const ke = rand(0.01, 5);
            const D = rand(1, 1000);
            const V = rand(0.5, 5);
            const t = rand(0, 48);

            // analytical
            let Ca: number;
            if (Math.abs(ka - ke) < 1e-6) {
                Ca = (D / V) * ka * t * Math.exp(-ka * t);
            } else {
                Ca = (D / V) * (ka / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
            }

            // RK4 numerical
            const N = Math.max(10, Math.ceil(t * Math.max(ka, ke) * 4) + 10);
            let G = D,
                A = 0;
            if (t > 0) {
                const dt = t / N;
                for (let s = 0; s < N; s++) {
                    const d1G = -ka * G;
                    const d1A = ka * G - ke * A;
                    const G2 = G + 0.5 * dt * d1G;
                    const A2 = A + 0.5 * dt * d1A;
                    const d2G = -ka * G2;
                    const d2A = ka * G2 - ke * A2;
                    const G3 = G + 0.5 * dt * d2G;
                    const A3 = A + 0.5 * dt * d2A;
                    const d3G = -ka * G3;
                    const d3A = ka * G3 - ke * A3;
                    const G4 = G + dt * d3G;
                    const A4 = A + dt * d3A;
                    const d4G = -ka * G4;
                    const d4A = ka * G4 - ke * A4;
                    G += (dt / 6) * (d1G + 2 * d2G + 2 * d3G + d4G);
                    A += (dt / 6) * (d1A + 2 * d2A + 2 * d3A + d4A);
                }
            }
            const Cn = A / V;

            if (!Number.isFinite(Ca) || !Number.isFinite(Cn) || Math.abs(Ca - Cn) > 20) {
                errors++;
            }
        }
        expect(errors).toBeLessThan(200);
    }, 600000);
});
