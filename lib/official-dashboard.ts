import type { Round } from './electoral-context';
import type { Result } from './catalog';

// Midnight on election day in America/Sao_Paulo (UTC-3 on 25/10/2026).
const RUNOFF_DAY_START = Date.parse('2026-10-25T00:00:00-03:00');
export function initialRound(explicit: string | string[] | undefined, now: number): Round {
    return explicit === '1' || explicit === '2' ? explicit : now >= RUNOFF_DAY_START ? '2' : '1';
}
export function shouldRefreshOfficial(input: { now: number; lastAttempt: number; hidden: boolean; busy: boolean; auto: boolean }) {
    return input.auto && !input.hidden && !input.busy && input.now - input.lastAttempt >= 60000;
}
export type OfficialQuery = { key: string; result: Result | null; loading: boolean; error: string; lastCheck: string };
export function initialOfficialQuery(key: string): OfficialQuery {
    return { key, result: null, loading: true, error: '', lastCheck: '' };
}
export function completeOfficialQuery(current: OfficialQuery, key: string, update: { result: Result; lastCheck: string } | { error: string }): OfficialQuery {
    if (current.key !== key) return current;
    // A failed refresh preserves the old source/result and its successful query time.
    return { ...current, ...update, loading: false, error: 'error' in update ? update.error : '' };
}
