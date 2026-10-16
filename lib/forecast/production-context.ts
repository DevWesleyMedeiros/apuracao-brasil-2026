import { timestamp, type Contest } from './types';

// Contract of the current production service, shared with the local curator.
export const PRODUCTION_YEAR = 2026;
export const PRODUCTION_ELECTION_AT = '2026-10-25T17:00:00-03:00';
export function supportsProductionContest(contest: Contest): boolean {
    return contest.year === PRODUCTION_YEAR && timestamp(contest.electionAt) === timestamp(PRODUCTION_ELECTION_AT);
}
