/**
 * Spread onto a collapsed disclosure so its content leaves the tab order while
 * the height tween keeps it visually closed. React 18 does not know `inert`,
 * so it is passed as the empty-string HTML attribute.
 */
export const inertWhen = (closed: boolean) => (closed ? ({ inert: '' } as Record<string, unknown>) : {});
