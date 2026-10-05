import { z } from 'zod';
import { STATES, type Municipality } from './catalog';

export class InvalidMunicipalityError extends Error {}
export function validateMunicipalityFilter(uf: string, code: string) {
    if (!STATES.some(([state]) => state === uf) || !/^\d{5}$/.test(code))
        throw new InvalidMunicipalityError('Selecione uma cidade válida da UF escolhida.');
}
export function municipalityConfigUrl(election: string) {
    if (!/^\d{1,6}$/.test(election)) throw new Error('Eleição inválida.');
    return `https://resultados.tse.jus.br/oficial/ele2026/${election}/config/mun-e${election.padStart(6, '0')}-cm.json`;
}
const schema = z.object({ f: z.literal('o'), abr: z.array(z.object({ cd: z.string(), mu: z.array(z.object({ cd: z.string().regex(/^\d{5}$/), nm: z.string().min(1) })) })) });
export function normalizeMunicipalities(raw: unknown, uf: string): Municipality[] {
    if (!STATES.some(([state]) => state === uf)) throw new InvalidMunicipalityError('UF inválida.');
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new Error('Lista de municípios do TSE em formato inesperado.');
    const state = parsed.data.abr.find(a => a.cd.toLowerCase() === uf);
    if (!state || !state.mu.length) throw new Error('Municípios desta UF ainda indisponíveis.');
    const cities = state.mu.map(m => ({ code: m.cd, name: m.nm }));
    if (new Set(cities.map(c => c.code)).size !== cities.length) throw new Error('Lista municipal inconsistente.');
    return cities.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
