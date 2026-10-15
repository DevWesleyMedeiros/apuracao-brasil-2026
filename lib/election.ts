import { STATES } from './catalog';
import type { Municipality, Result } from './catalog';
import { validateMunicipalityFilter } from './municipal';
export { STATES, OFFICES } from './catalog';
export type { Candidate, Result } from './catalog';
import { z } from 'zod';
import { electionSelection, type ElectionOptions } from './electoral-context';
export const CONFIG_URL = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json';
const STATE_CODES = new Set<string>(STATES.map(([code]) => code));
const VALID_OFFICES = new Set(['1', '3', '5', '6', '7', '8']);
const text = z.string();
const candidate = z.object({ n: text, sqcand: text, nmu: text, nm: text, vap: text, pvap: text, st: text, dvt: text.optional(), e: z.enum(['s', 'n']) });
export const resultSchema = z.object({ ele: text, t: z.enum(['1', '2']), f: z.literal('o'), cdabr: text, tpabr: text, dg: text, hg: text, dt: text, ht: text, dv: z.enum(['s', 'n']), tf: z.enum(['s', 'n']), and: z.enum(['n', 'p', 'f']), carg: z.array(z.object({ cd: text, nmn: text, nv: text, agr: z.array(z.object({ par: z.array(z.object({ sg: text, cand: z.array(candidate) })) })) })), s: z.object({ ts: text, st: text, pst: text }), v: z.object({ vv: text, vb: text, tvn: text, vl: text.optional() }) });
export const configSchema = z.object({ f: z.literal('o'), pl: z.array(z.object({ c: text, dt: text, e: z.array(z.object({ cd: text, t: text, abr: z.array(z.object({ cp: z.array(z.object({ cd: text })) })) })) })) });
export function querySelection(uf: string, office: string, options: ElectionOptions = {}) {
    if (electionSelection(options).round === '2' && office !== '1') throw new Error('Segundo turno disponível somente para presidente.');
    if ((uf !== 'br' && uf !== 'zz' && !STATE_CODES.has(uf)) || !VALID_OFFICES.has(office))
        throw new Error('Filtro inválido.');
    if ((uf === 'br' || uf === 'zz') && office !== '1')
        throw new Error('Selecione uma UF para este cargo.');
    if (office === '8' && uf !== 'df')
        throw new Error('Deputado distrital é exclusivo do DF.');
    return { uf, office: uf === 'df' && office === '7' ? '8' : office };
}
export function resolveElection(config: unknown, office: string, options: ElectionOptions = {}) {
    const selection = electionSelection(options);
    if (selection.round === '2' && office !== '1') throw new Error('Cargo incompatível com o segundo turno.');
    const validation = configSchema.safeParse(config);
    if (!validation.success)
        throw new Error('Configuração do TSE em formato inesperado.');
    const parsed = validation.data;
    const elections = parsed.pl.filter(p => p.c === selection.cycle && p.dt === selection.electionDate)
        .flatMap(p => p.e.filter(e => e.t === selection.round && e.abr.some(a => a.cp.some(c => c.cd === office))));
    if (elections.length !== 1)
        throw new Error('Eleição de 2026 não encontrada na configuração do TSE.');
    return elections[0].cd;
}
export function resultUrl(uf: string, office: string, election: string, municipality?: string) {
    if (!/^\d{1,6}$/.test(election))
        throw new Error('Código de eleição inválido.');
    if (municipality) validateMunicipalityFilter(uf, municipality);
    return `https://resultados.tse.jus.br/oficial/ele2026/${election}/dados/${uf}/${uf}${municipality ?? ''}-c${office.padStart(4, '0')}-e${election.padStart(6, '0')}-u.json`;
}
// Same photo path used by the official Resultados application's repository.
// Presidential candidatures are registered nationally, even for UF / ZZ results.
export function candidatePhotoUrl(uf: string, office: string, election: string, candidateId: string): string | null {
    if (!/^\d{1,6}$/.test(election) || !/^\d{1,20}$/.test(candidateId)) return null;
    const photoUf = office === '1' ? 'br' : uf;
    if (photoUf !== 'br' && !STATE_CODES.has(photoUf)) return null;
    return `https://resultados.tse.jus.br/oficial/ele2026/${election}/fotos/${photoUf}/${candidateId}.jpeg`;
}
export function numeric(value: string) {
    const n = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) throw new Error('Número inválido no arquivo do TSE.');
    return n;
}

function normalizeCandidate(
    entry: z.infer<typeof candidate>,
    party: string,
    hidden: boolean,
    uf: string,
    office: string,
    election: string,
) {
    return {
        id: entry.sqcand,
        number: entry.n,
        name: entry.nmu || entry.nm,
        party,
        votes: hidden ? null : numeric(entry.vap),
        percent: hidden ? null : numeric(entry.pvap),
        status: entry.st,
        destination: entry.dvt ?? '',
        elected: !hidden && entry.e === 's',
        photoUrl: candidatePhotoUrl(uf, office, election, entry.sqcand),
    };
}

function compareCandidates(a: Result['candidates'][number], b: Result['candidates'][number]) {
    return (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, 'pt-BR');
}

function normalizeCandidates(
    groups: z.infer<typeof resultSchema>['carg'][number]['agr'],
    hidden: boolean,
    uf: string,
    office: string,
    election: string,
) {
    const candidates: ReturnType<typeof normalizeCandidate>[] = [];
    for (const group of groups) {
        for (const party of group.par) {
            for (const candidate of party.cand) {
                candidates.push(normalizeCandidate(candidate, party.sg, hidden, uf, office, election));
            }
        }
    }
    return candidates.sort(compareCandidates);
}

export function normalizeResult(raw: unknown, uf: string, office: string, election: string, sourceUrl: string, municipality?: Municipality, options: ElectionOptions = {}): Result {
    const selection = electionSelection(options);
    querySelection(uf, office, options);
    const validation = resultSchema.safeParse(raw);
    if (!validation.success)
        throw new Error('Arquivo de resultado do TSE em formato inesperado.');
    const data = validation.data;
    if (municipality) validateMunicipalityFilter(uf, municipality.code);
    if (data.t !== selection.round || data.ele !== election || data.cdabr.toLowerCase() !== (municipality?.code ?? uf) || data.tpabr !== (municipality ? 'mu' : uf === 'br' ? 'br' : 'uf'))
        throw new Error('Arquivo do TSE não corresponde à consulta.');
    const cargo = data.carg.find(c => c.cd === office);
    if (!cargo || data.carg.length !== 1)
        throw new Error('Cargo ausente no arquivo do TSE.');
    const hidden = data.dv === 'n';
    const candidates = normalizeCandidates(cargo.agr, hidden, uf, office, election);
    if (new Set(candidates.map(c=>c.id)).size!==candidates.length || candidates.some(c=>(c.votes!==null&&!Number.isSafeInteger(c.votes)) || (c.percent!==null&&c.percent>100))) throw new Error('Candidatos ou votação inválidos.');
    if (![data.s.ts,data.s.st,data.v.vv,data.v.vb,data.v.tvn].every(v=>Number.isSafeInteger(numeric(v))) || numeric(data.s.st)>numeric(data.s.ts) || numeric(data.s.pst)>100) throw new Error('Contagens ou seções inválidas.');
    return {
        round: selection.round,
        context: { ...selection, office, election, territory: municipality?.code ?? uf, scope: municipality ? 'mu' : uf === 'br' ? 'br' : 'uf' },
        office, uf, ...(municipality ? { municipality } : {}), title: cargo.nmn, election, sourceUrl,
        generatedAt: `${data.dg} ${data.hg}`, totalizedAt: data.dt && data.ht ? `${data.dt} ${data.ht}` : null,
        checkedAt: new Date().toISOString(),
        state: hidden ? 'withheld' : data.and === 'n' ? 'waiting' : data.tf === 's' || (municipality && data.and === 'f') ? 'finished' : 'partial',
        seats: numeric(cargo.nv), candidates,
        sections: { total: numeric(data.s.ts), count: numeric(data.s.st), percent: numeric(data.s.pst) },
        // Withheld votes must not leak through the normalized API either.
        votes: hidden ? { valid: 0, blank: 0, null: 0, legend: null } : {
            valid: numeric(data.v.vv), blank: numeric(data.v.vb), null: numeric(data.v.tvn),
            legend: data.v.vl === undefined ? null : numeric(data.v.vl),
        },
    };
}
