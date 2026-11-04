// Pure helpers for the ExplainMath component.
//
// Keeping these in a dependency-free module lets them be unit-tested in the
// node test environment (no DOM / React required).

export const MAX_ANIMATION_MS = 1500;
export const SPRING_DURATION_MS = 500;
export const STAGGER_MS = 70;

// Critically damped: smooths the value without overshoot, matching the
// project's "settle, don't bounce" motion philosophy while still using a spring.
export const SPRING_CONFIG = { duration: 0.5, bounce: 0 } as const;

// LaTeX commands whose braced argument is a human-readable label (units, words)
// rather than a mathematical variable. Their whole `\cmd{...}` is dropped before
// extraction.
const LABEL_COMMANDS = ['text', 'mathrm', 'mathit', 'mathbf', 'operatorname', 'textrm'];

// Matches a variable identifier: letters, optionally followed by a subscript that
// may be a bare token or a braced group (e.g. V_d, C_{max}, k_e).
const VARIABLE_RE = /[A-Za-z]+(?:_(?:\{[A-Za-z0-9]+\}|[A-Za-z0-9]+))?/g;

export function extractLatexVariables(latex: string): string[] {
    if (!latex) return [];

    let working = latex;

    // Drop label-style commands together with their braced argument.
    for (const cmd of LABEL_COMMANDS) {
        working = working.replace(new RegExp(`\\\\${cmd}\\{[^}]*\\}`, 'g'), ' ');
    }

    // Drop every remaining backslash command (and its name) so command words such
    // as \frac, \cdot, \exp, \left are never mistaken for variables.
    working = working.replace(/\\[A-Za-z]+/g, ' ');

    const found: string[] = [];
    const seen = new Set<string>();
    const matches = working.match(VARIABLE_RE);
    if (!matches) return found;

    for (const raw of matches) {
        const token = raw.replace(/_\{([A-Za-z0-9]+)\}/, '_$1');
        if (!seen.has(token)) {
            seen.add(token);
            found.push(token);
        }
    }
    return found;
}

export function animationBudgetMs(count: number): number {
    if (!Number.isFinite(count) || count <= 0) return 0;
    const n = Math.floor(count);
    const total = SPRING_DURATION_MS + (n - 1) * STAGGER_MS;
    if (total < 0) return 0;
    return Math.min(MAX_ANIMATION_MS, total);
}
