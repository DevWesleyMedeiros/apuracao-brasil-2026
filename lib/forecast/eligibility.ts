import { contestSchema, pollSchema, timestamp, type Contest, type Poll } from './types';

export function pollValues(poll: Poll) {
    const p = pollSchema.parse(poll);
    const scale = p.unit === 'percent' ? 100 : 1;
    const validFraction = (p.a + p.b) / scale;
    return { share: p.a / (p.a + p.b), nValid: p.denominator === 'total' ? p.sampleSize * validFraction : p.validSampleSize! };
}
export function pollMatchesContest(poll: Poll, contest: Contest): boolean {
    return poll.year === contest.year && poll.round === contest.round && poll.office === contest.office && poll.scope === contest.scope && poll.scenario === contest.scenario && poll.candidateIds.every((id, i) => id === contest.candidateIds[i]);
}
export function selectPolls(input: unknown[], contestInput: Contest, asOf: string) {
    const contest = contestSchema.parse(contestInput), cutoff = timestamp(asOf);
    const parsed=input.map(p=>pollSchema.parse(p));
    const curation=new Map<string,string>();
    const identities=new Map<string,string>();
    for(const p of parsed) {
        const key=`${p.registration}:${p.scenario}:${p.wave}`;
        if(curation.has(key)&&curation.get(key)!==p.curation)throw new Error('Curadorias conflitantes da mesma pesquisa.');
        if(identities.has(p.id)&&identities.get(p.id)!==key)throw new Error('ID de pesquisa reutilizado.');
        curation.set(key,p.curation);identities.set(p.id,key);
    }
    const eligible = parsed.filter(p => p.curation === 'reviewed' && pollMatchesContest(p, contest) && timestamp(p.fieldEnd) <= cutoff && timestamp(p.publishedAt) <= cutoff);
    const dedup = new Map<string, Poll>();
    for (const poll of eligible.sort((a, b) => a.id.localeCompare(b.id))) {
        const key = `${poll.registration}:${poll.scenario}:${poll.wave}`;
        const previous = dedup.get(key);
        if (previous && (previous.a !== poll.a || previous.b !== poll.b || previous.sampleSize !== poll.sampleSize || previous.institute !== poll.institute || previous.fieldEnd !== poll.fieldEnd || previous.denominator !== poll.denominator || previous.unit !== poll.unit || previous.validSampleSize !== poll.validSampleSize || previous.publishedAt !== poll.publishedAt)) throw new Error('Cópias conflitantes de pesquisa.');
        if (!previous) dedup.set(key, { ...poll, provenance: [...new Set(poll.provenance)].sort() });
        else previous.provenance = [...new Set([...previous.provenance, ...poll.provenance])].sort();
    }
    const latest = new Map<string, Poll>();
    const ordered = [...dedup.values()].sort((a, b) => timestamp(b.fieldEnd) - timestamp(a.fieldEnd) || timestamp(b.publishedAt) - timestamp(a.publishedAt) || a.id.localeCompare(b.id));
    for (const poll of ordered) if (!latest.has(poll.institute)) latest.set(poll.institute, poll);
    return { eligibleCount: dedup.size, polls: [...latest.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
