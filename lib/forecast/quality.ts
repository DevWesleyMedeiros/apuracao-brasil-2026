import { evaluationMetadataSchema, timestamp } from './types';
import { TRANSFORMATION_VERSION } from './identity';
export type ProbabilityBlockCode = 'publication-disabled' | 'evaluation-missing' | 'evaluation-invalid' | 'review-missing' | 'holdout-missing' | 'not-operational' | 'model-mismatch' | 'data-mismatch' | 'parameters-mismatch' | 'evaluation-after-cutoff' | 'election-after-cutoff' | 'scope-mismatch' | 'evaluation-expired' | 'dependencies-mismatch';
export type ProbabilityBlock = { code: ProbabilityBlockCode; message: string };
export function probabilityPermission(input: { enabled: boolean; evaluation: unknown; modelVersion: string; dataVersion: string; parametersHash: string; asOf: string; year: number; mode?: 'pre'|'live'; baselineHash?:string|null; policyHash?:string|null }) {
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
        if(data.mode!==(input.mode??'pre') || data.scope.year!==input.year) block('scope-mismatch','Modo ou escopo da avaliação incompatível.');
        if(data.transformationVersion!==TRANSFORMATION_VERSION || data.dependencies.baselineHash!==(input.baselineHash??null) || data.dependencies.policyHash!==(input.policyHash??null)) block('dependencies-mismatch','Transformação, baseline ou política exigem avaliação/revisão compatível.');
        if (data.parametersHash !== input.parametersHash) block('parameters-mismatch', 'Hash dos parâmetros incompatível com a avaliação.');
        if (Math.max(timestamp(data.publishedAt),timestamp(data.reviewedAt)) > timestamp(input.asOf)) block('evaluation-after-cutoff', 'Avaliação/revisão ainda não estava disponível neste corte.');
        if(timestamp(data.validUntil)<timestamp(input.asOf)) block('evaluation-expired','Validade temporal da avaliação encerrada.');
        if ([...data.trainingElections, ...data.evaluationElections].some(y => y >= input.year)) block('election-after-cutoff', 'Treino ou avaliação inclui eleição não anterior ao pleito.');
    }
    const reviewed = !probabilityBlocks.some(b => b.code !== 'publication-disabled');
    return { calibrationStatus: reviewed ? 'reviewed' as const : 'uncalibrated' as const, publicProbabilityEnabled: probabilityBlocks.length === 0, probabilityBlocks,
        probabilityReason: probabilityBlocks.length ? `Probabilidade não publicada: ${probabilityBlocks.map(b => b.message).join(' ')}` : null };
}
