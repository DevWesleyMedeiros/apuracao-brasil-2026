import { aggregate } from '../forecast/aggregate';
import { history } from '../forecast/history';
import { probabilityPermission } from '../forecast/quality';
import { candidateSchema, contestSchema, timestamp, type ModelConfig } from '../forecast/types';

export type ForecastMode = 'pre' | 'live';
export type ForecastData = { polls: unknown[]; candidates: unknown[]; contest: unknown; evaluation: unknown; dataVersion: string };
type Estimate = { a: { median: number; lo: number; hi: number }; b: { median: number; lo: number; hi: number }; weightedPollShare: number | null; probabilityA: number | null; probabilityB: number | null; probabilityTie: number | null };
export type ForecastMetadata = {
    mode: ForecastMode; context: { cycle: string; year: number; round: '2'; office: '1'; scope: 'br'; election: string | null; electionAt: string };
    asOf: string; computedAt: string; sourceUpdatedAt: string | null; modelVersion: string; dataVersion: string; parametersHash: string; seed: number;
    calibrationStatus: 'reviewed' | 'uncalibrated'; publicProbabilityEnabled: boolean; probabilityReason: string | null;
    candidates: { id: string; name: string; sourceUrl: string; verifiedAt: string }[];
    pollCount: number; instituteCount: number; eligibleCount: number; newestFieldAgeDays: number | null; weightConcentration: number | null;
    sources: string[]; warnings: string[]; historical: boolean;
};
type Base = ForecastMetadata & { polls: NonNullable<ReturnType<typeof aggregate>>['polls']; series: { asOf: string; median: number; lo: number; hi: number; dataVersion: string; modelVersion: string }[] };
export type ForecastResponse = Base & (
    { state: 'disabled' | 'no-data' | 'insufficient-data'; estimate: null; message: string } |
    { state: 'ready' | 'stale' | 'finished'; estimate: Estimate; message: string }
);
export function buildForecast(input: {
    data: ForecastData; config: ModelConfig; parametersHash: string; mode: ForecastMode; asOf: string; computedAt: string; historical: boolean;
    flags: { preEnabled: boolean; liveEnabled: boolean; publicProbabilityEnabled: boolean }; cutoffs?: string[];
}): ForecastResponse {
    const { data, config, asOf, computedAt, flags, mode } = input;
    const contest = data.contest === null ? null : contestSchema.parse(data.contest);
    const candidates = data.candidates.map(c => candidateSchema.parse(c));
    const permission = probabilityPermission({ enabled: flags.publicProbabilityEnabled, evaluation: data.evaluation, modelVersion: config.version, dataVersion: data.dataVersion, parametersHash: input.parametersHash, asOf, year: contest?.year ?? 2026 });
    const base: Base = { mode, context: { cycle: 'ele2026', year: 2026, round: '2', office: '1', scope: 'br', election: contest?.election ?? null, electionAt: contest?.electionAt ?? '2026-10-25T17:00:00-03:00' },
        asOf, computedAt, sourceUpdatedAt: null, modelVersion: config.version, dataVersion: data.dataVersion, parametersHash: input.parametersHash, seed: config.seed,
        ...permission, candidates, pollCount: 0, instituteCount: 0, eligibleCount: 0, newestFieldAgeDays: null, weightConcentration: null, sources: [],
        warnings: ['Projeção estatística — não é resultado oficial.', 'Parâmetros experimentais não calibrados; testes de software não demonstram acurácia eleitoral.'], historical: input.historical, polls: [], series: [] };
    const unavailable = (state: 'disabled' | 'no-data' | 'insufficient-data', message: string): ForecastResponse => ({ ...base, state, message, estimate: null, publicProbabilityEnabled: false, probabilityReason: base.probabilityReason ?? message });
    if (mode === 'live') return unavailable(flags.liveEnabled ? 'insufficient-data' : 'disabled', flags.liveEnabled ? 'Live exige baseline e conjunto íntegro de snapshots; nenhum conjunto ativo foi fornecido.' : 'Motor ao vivo experimental desabilitado. Nenhum coletor está sendo executado por esta página.');
    if (!flags.preEnabled) return unavailable('disabled', 'Agregador pré-eleitoral desabilitado.');
    if (timestamp(asOf) > timestamp(base.context.electionAt)) return unavailable('disabled', 'Pleito encerrado para previsões pré-eleitorais. Consulte um corte histórico identificado ou a apuração oficial.');
    if (!contest || !data.polls.length || candidates.length !== 2) return unavailable('no-data', 'Sem pesquisas revisadas e dupla de finalistas oficialmente verificada. Nenhuma estimativa foi inventada.');
    if (contest.year !== 2026 || timestamp(contest.electionAt)!==timestamp('2026-10-25T17:00:00-03:00') || candidates.some((c, i) => c.id !== contest.candidateIds[i]) || candidates.some(c => timestamp(c.verifiedAt) > timestamp(asOf))) return unavailable('insufficient-data', 'Contexto ou identidades incompatíveis ou ainda não verificados neste corte.');
    try {
        const result = aggregate(data.polls, contest, asOf, config);
        if (!result) return unavailable('insufficient-data', 'Nenhuma pesquisa elegível no corte solicitado.');
        const series = history(data.polls, contest, input.cutoffs ?? [], config, data.dataVersion).flatMap(point => point.result ? [{ asOf: point.asOf, ...point.result.distribution.a, dataVersion: point.dataVersion, modelVersion: point.modelVersion }] : []);
        const { distribution: d } = result;
        return { ...base, state: 'ready', message: 'Agregação de pesquisas; intervalo preditivo condicionado às hipóteses do modelo.',
            sourceUpdatedAt: result.polls.map(p => p.publishedAt).sort((a,b) => timestamp(b) - timestamp(a))[0],
            pollCount: result.pollCount, instituteCount: result.instituteCount, eligibleCount: result.eligibleCount, newestFieldAgeDays: result.newestFieldAgeDays,
            weightConcentration: result.weightConcentration, sources: [...new Set(result.polls.flatMap(p => [p.reportUrl, ...p.provenance]))], polls: result.polls, series,
            estimate: { a: d.a, b: d.b, weightedPollShare: result.weightedPollShare, probabilityA: permission.publicProbabilityEnabled ? d.probabilityA : null, probabilityB: permission.publicProbabilityEnabled ? d.probabilityB : null, probabilityTie: permission.publicProbabilityEnabled ? d.probabilityTie : null } };
    } catch { return unavailable('insufficient-data', 'Dados inconsistentes ou distribuição degenerada; cálculo suspenso para revisão.'); }
}
