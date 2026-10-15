import { REGIONS } from './catalog';
import type { Candidate, Result } from './catalog';

function matchesCandidateIds(result: Result, ids: Set<string>, expectedCount: number) {
    if (result.candidates.length !== expectedCount) return false;
    const resultIds = new Set(result.candidates.map(candidate => candidate.id));
    if (resultIds.size !== expectedCount) return false;
    return result.candidates.every(candidate => ids.has(candidate.id));
}

function containsHiddenVotes(results: Result[]) {
    for (const result of results) {
        if (result.state === 'withheld') return true;
        for (const candidate of result.candidates) {
            if (candidate.votes === null) return true;
        }
    }
    return false;
}

export function aggregateRegion(code: string, results: Result[]): Result {
    const region = REGIONS.find(r => r.code === code);
    if (!region) throw new Error('Região inválida.');
    const byUf = new Map(results.map(r => [r.uf, r]));
    if (results.length !== region.states.length || byUf.size !== region.states.length ||
        !region.states.every(uf => byUf.has(uf))) throw new Error('Consulta regional incompleta. Tente novamente.');
    const first = results[0];
    if (results.some(r => r.office !== '1' || r.election !== first.election || r.round !== first.round || r.context.cycle !== first.context.cycle || r.context.electionDate !== first.context.electionDate || r.municipality || r.stale))
        throw new Error('Os arquivos da região precisam ser da mesma eleição e consulta atual.');
    const ids = new Set(first.candidates.map(c => c.id));
    if (results.some(result => !matchesCandidateIds(result, ids, ids.size)))
        throw new Error('As listas de candidatos da região ainda não estão sincronizadas.');
    const hidden = containsHiddenVotes(results);
    const sum = (get: (r: Result) => number) => results.reduce((total, r) => total + get(r), 0);
    const valid = hidden ? 0 : sum(r => r.votes.valid);
    const total = hidden ? 0 : sum(r => r.sections.total);
    const count = hidden ? 0 : sum(r => r.sections.count);
    const totals = new Map<string, number>();
    for (const r of results) for (const c of r.candidates) totals.set(c.id, (totals.get(c.id) ?? 0) + (c.votes ?? 0));
    const candidates: Candidate[] = first.candidates.map(c => {
        const votes = totals.get(c.id) ?? 0;
        return { ...c, votes: hidden ? null : votes, percent: hidden ? null : valid ? votes / valid * 100 : 0,
            status: '', destination: '', elected: false };
    }).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
    return { ...first, uf: `region:${region.code}`, region: region.code, sourceUrl: 'https://resultados.tse.jus.br/',
        context: {...first.context, territory: `region:${region.code}`, scope: 'region'},
        generatedAt: '', totalizedAt: null, checkedAt: new Date().toISOString(), candidates,
        state: hidden ? 'withheld' : results.every(r => r.state === 'finished') ? 'finished' : results.every(r => r.state === 'waiting') ? 'waiting' : 'partial',
        sections: { total, count, percent: total ? count / total * 100 : 0 },
        votes: { valid, blank: hidden ? 0 : sum(r => r.votes.blank), null: hidden ? 0 : sum(r => r.votes.null), legend: null },
        sources: results.map(r => ({ uf: r.uf, url: r.sourceUrl, generatedAt: r.generatedAt })) };
}
