import { evaluationMetadataSchema, timestamp } from './types';
export type ProbabilityBlockCode = 'publication-disabled' | 'evaluation-missing' | 'evaluation-invalid' | 'review-missing' | 'holdout-missing' | 'not-operational' | 'model-mismatch' | 'data-mismatch' | 'parameters-mismatch' | 'evaluation-after-cutoff' | 'election-after-cutoff';
export type ProbabilityBlock = { code: ProbabilityBlockCode; message: string };
export function probabilityPermission(input: { enabled: boolean; evaluation: unknown; modelVersion: string; dataVersion: string; parametersHash: string; asOf: string; year: number }) {
    const probabilityBlocks: ProbabilityBlock[] = [];
    const block = (code: ProbabilityBlockCode, message: string) => probabilityBlocks.push({ code, message });
    if (!input.enabled) block('publication-disabled', 'Publicação de probabilidades desabilitada por configuração.');
    const e = evaluationMetadataSchema.safeParse(input.evaluation);
    if (input.evaluation == null) block('evaluation-missing', 'Avaliação independente não fornecida.');
    else if (!e.success) block('evaluation-invalid', 'Metadados da avaliação inválidos; exigem revisão.');
    if (e.success) {
        const data = e.data;
        if (!data.qualityReviewed) block('review-missing', 'Revisão de qualidade da avaliação não registrada.');
        if (!data.independentHoldout) block('holdout-missing', 'Holdout independente não registrado.');
        if (!data.operational) block('not-operational', 'Avaliação operacional não registrada.');
        if (data.modelVersion !== input.modelVersion) block('model-mismatch', 'Versão do modelo incompatível com a avaliação.');
        if (data.dataVersion !== input.dataVersion) block('data-mismatch', 'Hash dos dados incompatível com a avaliação. Alterações nos dados exigem nova revisão vinculada à dataVersion.');
        if (data.parametersHash !== input.parametersHash) block('parameters-mismatch', 'Hash dos parâmetros incompatível com a avaliação.');
        if (timestamp(data.publishedAt) > timestamp(input.asOf)) block('evaluation-after-cutoff', 'Avaliação ainda não estava disponível neste corte.');
        if ([...data.trainingElections, ...data.evaluationElections].some(y => y >= input.year)) block('election-after-cutoff', 'Treino ou avaliação inclui eleição não anterior ao pleito.');
    }
    const reviewed = !probabilityBlocks.some(b => b.code !== 'publication-disabled');
    return { calibrationStatus: reviewed ? 'reviewed' as const : 'uncalibrated' as const, publicProbabilityEnabled: probabilityBlocks.length === 0, probabilityBlocks,
        probabilityReason: probabilityBlocks.length ? `Probabilidade não publicada: ${probabilityBlocks.map(b => b.message).join(' ')}` : null };
}
