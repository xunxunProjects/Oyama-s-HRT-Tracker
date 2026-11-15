import type { VoiceCheck } from './types';

/**
 * `checks` is newest-first, as `loadVoiceChecks` returns it. The table keeps
 * that order; the chart needs chronological order, so only its copy reverses.
 */
export const windowVoiceChecks = (checks: VoiceCheck[], limit = 12): { recent: VoiceCheck[]; chart: VoiceCheck[] } => {
    const recent = checks.slice(0, limit);
    return { recent, chart: [...recent].reverse() };
};
