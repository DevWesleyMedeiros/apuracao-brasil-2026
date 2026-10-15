import { evaluationMetadataSchema, timestamp } from './types';
export function probabilityPermission(input: { enabled: boolean; evaluation: unknown; modelVersion: string; dataVersion: string; parametersHash: string; asOf: string; year: number }) {
    const e = evaluationMetadataSchema.safeParse(input.evaluation);
    const reviewed = e.success && e.data.qualityReviewed && e.data.independentHoldout && e.data.operational && e.data.modelVersion === input.modelVersion && e.data.dataVersion === input.dataVersion && e.data.parametersHash === input.parametersHash && timestamp(e.data.publishedAt) <= timestamp(input.asOf) && e.data.trainingElections.every(y => y < input.year) && e.data.evaluationElections.every(y => y < input.year);
    return { calibrationStatus: reviewed ? 'reviewed' as const : 'uncalibrated' as const, publicProbabilityEnabled: !!(input.enabled && reviewed), probabilityReason: input.enabled && reviewed ? null : 'Probabilidade indisponível: exige avaliação independente, revisão dos dados e autorização explícita.' };
}
