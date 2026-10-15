import { z } from 'zod';
import { aggregate } from './aggregate';
import { configSchema, contestSchema, dateSchema, pollSchema, proportionSchema, timestamp } from './types';

export const evaluationDatasetSchema = z.object({
    dataVersion: z.string().min(1), provenance: z.array(z.string().url()).min(1),
    elections: z.array(z.object({ contest: contestSchema, polls: z.array(pollSchema), officialShareA: proportionSchema,
        resultSource: z.string().url(), parameters: configSchema, parameterProvenance: z.object({ trainedOn: z.array(z.number().int()), availableAt: dateSchema, reference: z.string().min(1), independentHoldout: z.boolean() }).strict(),
        cutoffs: z.array(dateSchema).min(1).max(62),
    }).strict()).min(1),
}).strict().refine(d => new Set(d.elections.map(e => e.contest.year)).size === d.elections.length, 'Uma entrada por eleição.');
function metrics(rows: { median: number; lo: number; hi: number; probability: number; actual: number }[]) {
    if (!rows.length) return null;
    const avg = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    const epsilon = 1e-6; // Evaluation-only protection, not a change to forecast probabilities.
    return { mae: avg(r => Math.abs(r.median - r.actual)), mse: avg(r => (r.median - r.actual) ** 2),
        coverage: avg(r => Number(r.actual >= r.lo && r.actual <= r.hi)), width: avg(r => r.hi - r.lo),
        brier: avg(r => (r.probability - Number(r.actual > .5)) ** 2),
        logLoss: avg(r => { const p = Math.min(1 - epsilon, Math.max(epsilon, r.probability)); return r.actual > .5 ? -Math.log(p) : -Math.log(1 - p); }) };
}
export function evaluate(dataset: unknown) {
    const data = evaluationDatasetSchema.parse(dataset);
    const perElection = data.elections.map(e => {
        const rows = e.cutoffs.map(asOf => {
            const result = aggregate(e.polls, e.contest, asOf, e.parameters);
            const operational = e.parameterProvenance.independentHoldout && e.parameterProvenance.trainedOn.length > 0 && e.parameterProvenance.trainedOn.every(y => y < e.contest.year) && timestamp(e.parameterProvenance.availableAt) <= timestamp(asOf);
            const sensitivity = result ? [0.5, 1.5].map(factor => ({ factor, common: aggregate(e.polls, e.contest, asOf, { ...e.parameters, commonSigmaP: e.parameters.commonSigmaP * factor })?.distribution.a,
                drift: aggregate(e.polls, e.contest, asOf, { ...e.parameters, driftSigmaPPerSqrtDay: e.parameters.driftSigmaPPerSqrtDay * factor })?.distribution.a })) : [];
            const dominant = result?.polls.slice().sort((a,b) => b.weight - a.weight)[0]?.institute;
            return { asOf, operational, result, sensitivity, withoutDominantInstitute: dominant ? aggregate(e.polls.filter(p => p.institute !== dominant), e.contest, asOf, e.parameters)?.distribution.a ?? null : null };
        });
        const eligible = rows.filter(r => r.operational && r.result && e.officialShareA !== .5).map(r => ({ ...r.result!.distribution.a, probability: r.result!.distribution.probabilityA, actual: e.officialShareA }));
        return { year: e.contest.year, resultSource: e.resultSource, parameters: e.parameters, parameterProvenance: e.parameterProvenance, rows, metrics: metrics(eligible), operationalCutoffs: eligible.length };
    });
    const scored = perElection.filter(e => e.metrics);
    const mean = (key: keyof NonNullable<ReturnType<typeof metrics>>) => scored.reduce((s,e) => s + e.metrics![key],0) / scored.length;
    return { dataVersion: data.dataVersion, provenance: data.provenance, independentEvents: scored.length, perElection,
        operationalStatus: scored.length ? 'available-not-proof-of-calibration' : 'no-valid-operational-test',
        metrics: scored.length ? { mae: mean('mae'), rmse: Math.sqrt(mean('mse')), coverage: mean('coverage'), width: mean('width'), brier: mean('brier'), logLoss: mean('logLoss') } : null,
        warnings: ['Horizontes são agregados dentro de cada eleição; não são eventos independentes.', 'Sensibilidade e fixtures não estabelecem calibração. Empates oficiais não recebem escore binário.', 'Log loss usa epsilon=1e-6 somente na avaliação. Sem treino anterior e holdout independente não há avaliação operacional.'] };
}
