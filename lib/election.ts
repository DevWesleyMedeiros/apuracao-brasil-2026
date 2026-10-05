import { STATES, type Result, type Municipality } from './catalog';
import { validateMunicipalityFilter } from './municipal';
export { STATES, OFFICES } from './catalog';
export type { Candidate, Result } from './catalog';
import { z } from 'zod';
export const CONFIG_URL = 'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json';
const text = z.string();
const candidate = z.object({ n: text, sqcand: text, nmu: text, nm: text, vap: text, pvap: text, st: text, dvt: text.optional(), e: z.enum(['s', 'n']) });
export const resultSchema = z.object({ ele: text, t: z.literal('1'), f: z.literal('o'), cdabr: text, tpabr: text, dg: text, hg: text, dt: text, ht: text, dv: z.enum(['s', 'n']), tf: z.enum(['s', 'n']), and: z.enum(['n', 'p', 'f']), carg: z.array(z.object({ cd: text, nmn: text, nv: text, agr: z.array(z.object({ par: z.array(z.object({ sg: text, cand: z.array(candidate) })) })) })), s: z.object({ ts: text, st: text, pst: text }), v: z.object({ vv: text, vb: text, tvn: text, vl: text.optional() }) });
export const configSchema = z.object({ f: z.literal('o'), pl: z.array(z.object({ c: text, dt: text, e: z.array(z.object({ cd: text, t: text, abr: z.array(z.object({ cp: z.array(z.object({ cd: text })) })) })) })) });
export function querySelection(uf: string, office: string) {
    if (!['br', 'zz', ...STATES.map(s => s[0])].includes(uf) || !['1', '3', '5', '6', '7', '8'].includes(office))
        throw new Error('Filtro inválido.');
    if ((uf === 'br' || uf === 'zz') && office !== '1')
        throw new Error('Selecione uma UF para este cargo.');
    if (office === '8' && uf !== 'df')
        throw new Error('Deputado distrital é exclusivo do DF.');
    return { uf, office: uf === 'df' && office === '7' ? '8' : office };
}
export function resolveElection(config: unknown, office: string) {
    const validation = configSchema.safeParse(config);
    if (!validation.success)
        throw new Error('Configuração do TSE em formato inesperado.');
    const parsed = validation.data;
    const pleito = parsed.pl.find(p => p.c === 'ele2026' && p.dt === '04/10/2026');
    const election = pleito?.e.find(e => e.t === '1' && e.abr.some(a => a.cp.some(c => c.cd === office)));
    if (!election)
        throw new Error('Eleição de 2026 não encontrada na configuração do TSE.');
    return election.cd;
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
    if (photoUf !== 'br' && !STATES.some(([code]) => code === photoUf)) return null;
    return `https://resultados.tse.jus.br/oficial/ele2026/${election}/fotos/${photoUf}/${candidateId}.jpeg`;
}
export function numeric(value: string) { const n = Number(value.replace(',', '.')); if (value === '' || !Number.isFinite(n) || n < 0)
    throw new Error('Número inválido no arquivo do TSE.'); return n; }
export function normalizeResult(raw: unknown, uf: string, office: string, election: string, sourceUrl: string, municipality?: Municipality): Result {
    const validation = resultSchema.safeParse(raw);
    if (!validation.success)
        throw new Error('Arquivo de resultado do TSE em formato inesperado.');
    const data = validation.data;
    if (municipality) validateMunicipalityFilter(uf, municipality.code);
    if (data.ele !== election || data.cdabr.toLowerCase() !== (municipality?.code ?? uf) || data.tpabr !== (municipality ? 'mu' : uf === 'br' ? 'br' : 'uf'))
        throw new Error('Arquivo do TSE não corresponde à consulta.');
    const cargo = data.carg.find(c => c.cd === office);
    if (!cargo)
        throw new Error('Cargo ausente no arquivo do TSE.');
    const hidden = data.dv === 'n';
    const candidates = cargo.agr.flatMap(a => a.par.flatMap(p => p.cand.map(c => ({ id: c.sqcand, number: c.n, name: c.nmu || c.nm, party: p.sg, votes: hidden ? null : numeric(c.vap), percent: hidden ? null : numeric(c.pvap), status: c.st, destination: c.dvt ?? '', elected: !hidden && c.e === 's', photoUrl: candidatePhotoUrl(uf, office, election, c.sqcand) }))));
    candidates.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, 'pt-BR'));
    return { office, uf, ...(municipality ? { municipality } : {}), title: cargo.nmn, election, sourceUrl, generatedAt: `${data.dg} ${data.hg}`, totalizedAt: data.dt && data.ht ? `${data.dt} ${data.ht}` : null, checkedAt: new Date().toISOString(), state: hidden ? 'withheld' : data.and === 'n' ? 'waiting' : data.tf === 's' || (municipality && data.and === 'f') ? 'finished' : 'partial', seats: numeric(cargo.nv), candidates, sections: { total: numeric(data.s.ts), count: numeric(data.s.st), percent: numeric(data.s.pst) }, votes: { valid: numeric(data.v.vv), blank: numeric(data.v.vb), null: numeric(data.v.tvn), legend: data.v.vl === undefined ? null : numeric(data.v.vl) } };
}
