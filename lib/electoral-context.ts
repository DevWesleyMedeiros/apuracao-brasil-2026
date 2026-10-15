export type Round = '1' | '2';
export type ElectionOptions = { round?: Round; cycle?: 'ele2026'; year?: 2026; electionDate?: string };
export type ElectoralContext = {
    cycle: 'ele2026'; year: 2026; round: Round; electionDate: string;
    office: string; election: string; territory: string; scope: 'br' | 'uf' | 'mu' | 'region';
};
export function electionSelection(options: ElectionOptions = {}) {
    const round = options.round ?? '1';
    if (!['1', '2'].includes(round) || (options.cycle && options.cycle !== 'ele2026') || (options.year && options.year !== 2026)) throw new Error('Contexto eleitoral inválido.');
    const electionDate = round === '1' ? '04/10/2026' : '25/10/2026';
    if (options.electionDate && options.electionDate !== electionDate) throw new Error('Data incompatível com o turno.');
    return { cycle: 'ele2026' as const, year: 2026 as const, round, electionDate };
}
export function contextKey(context: ElectoralContext) { return JSON.stringify(context); }
