/**
 * Spread onto a part that is folded away, so it leaves the tab order with it.
 * A collapsed panel (a 0fr grid row, a closed disclosure) only hides its
 * inputs, links and buttons visually; `inert` keeps them from taking focus.
 * React 18's types have no `inert`, and an empty string is what sets it.
 */
export const inertWhen = (closed: boolean) => (closed ? ({ inert: '' } as Record<string, unknown>) : {});
