import { STATES, type Result } from '../catalog';
import { baselineSchema, type Baseline } from './types';
export function validateFinalists(result:Result,target:Baseline['target']) {
    if(result.round!=='2'||result.office!=='1'||result.uf!=='br'||result.election!==target.election||result.context.year!==target.year||result.candidates.length!==2||new Set(result.candidates.map(c=>c.id)).size!==2||target.candidateIds.some(id=>!result.candidates.some(c=>c.id===id)))throw new Error('Finalistas configurados divergem do arquivo oficial do segundo turno.');
}
export const TERRITORIES = [...STATES.map(([uf]) => uf), 'zz'].sort();
export function assertTerritories(codes: string[]) {
    if (codes.length !== 28 || new Set(codes).size !== 28 || TERRITORIES.some(uf => !codes.includes(uf))) throw new Error('Exigidas as 27 UFs e ZZ, sem duplicatas.');
}
export type DestinationPolicy = { valid: string[]; excluded: string[]; reference: string };
export function reconcileSnapshot(results: Result[], policy: DestinationPolicy, requireFinished = true) {
    const br = results.find(r => r.uf === 'br');
    const parts = results.filter(r => r.uf !== 'br');
    assertTerritories(parts.map(r => r.uf));
    if (results.length !== 29 || !br || !policy.reference || !policy.valid.length || policy.valid.some(d => policy.excluded.includes(d))) throw new Error('Snapshot ou política de destinação inválida.');
    const ids = br.candidates.map(c => c.id).sort();
    if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Candidatos ausentes/duplicados.');
    for (const r of results) {
        if (r.office !== '1' || r.round !== br.round || r.election !== br.election || r.context.year !== br.context.year || r.context.electionDate !== br.context.electionDate || r.context.cycle !== br.context.cycle || r.municipality || r.region || r.stale || r.state === 'withheld' || (requireFinished && (r.state !== 'finished' || r.sections.count !== r.sections.total || r.sections.total === 0))) throw new Error('Contexto, divulgação ou conclusão incompatível.');
        if (JSON.stringify(r.candidates.map(c => c.id).sort()) !== JSON.stringify(ids) || new Set(r.candidates.map(c => c.id)).size !== ids.length) throw new Error('Conjuntos de candidatos incompatíveis.');
        if (![r.votes.valid, r.sections.count, r.sections.total].every(Number.isSafeInteger)) throw new Error('Contagens inválidas.');
        let valid = 0;
        for (const c of r.candidates) {
            if (c.votes === null || !Number.isSafeInteger(c.votes) || c.votes < 0 || c.destination !== br.candidates.find(b => b.id === c.id)!.destination) throw new Error('Votos/destinação inconsistentes.');
            if (policy.valid.includes(c.destination)) valid += c.votes;
            else if (!policy.excluded.includes(c.destination)) throw new Error('Destinação não revisada: ' + c.destination);
        }
        if (valid !== r.votes.valid) throw new Error('Votos válidos não conciliados pela destinação.');
    }
    if (parts.reduce((s, r) => s + r.votes.valid, 0) !== br.votes.valid || ids.some(id => parts.reduce((s, r) => s + r.candidates.find(c => c.id === id)!.votes!, 0) !== br.candidates.find(c => c.id === id)!.votes)) throw new Error('Divergência exata BR versus 27 UFs + ZZ.');
    return { br, parts };
}
export function createBaseline(results: Result[], input: Omit<Baseline, 'territories' | 'sourceElection'>, policy: DestinationPolicy) {
    const { br, parts } = reconcileSnapshot(results, policy);
    if (br.round !== '1' || input.target.year !== br.context.year || input.mapping.some(m => !br.candidates.some(c => c.id === m.firstId && policy.valid.includes(c.destination)))) throw new Error('Finalistas não verificados no primeiro turno.');
    const baseline = baselineSchema.parse({ ...input, sourceElection: br.election, territories: parts.map(r => ({ uf: r.uf, validVotes: r.votes.valid, a: r.candidates.find(c => c.id === input.mapping[0].firstId)!.votes, b: r.candidates.find(c => c.id === input.mapping[1].firstId)!.votes })) });
    assertTerritories(baseline.territories.map(t => t.uf));
    return baseline;
}
