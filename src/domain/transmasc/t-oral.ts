// Oral testosterone undecanoate transit model.

// --- Oral TU transit compartments (Phase 1.5) ---
//
// Erlang transit model for delayed absorption (closed form; equivalent to
// N identical first-order transit compartments solved by ODE).
export function transitCompartmentAmount(t: number, dose: number, F: number, k: number, n: number): number {
    if (t <= 0 || n < 1 || k <= 0) return 0;
    // factorial(n-1)
    let fact = 1;
    for (let i = 2; i <= n - 1; i++) fact *= i;
    return (dose * F * Math.pow(k, n) * Math.pow(t, n - 1) * Math.exp(-k * t)) / fact;
}
