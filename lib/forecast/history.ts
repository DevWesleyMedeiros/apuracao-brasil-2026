import { aggregate } from './aggregate';
import { timestamp, type Contest, type ModelConfig } from './types';
export function history(polls: unknown[], contest: Contest, cutoffs: string[], config: ModelConfig, dataVersion: string) {
    if (!dataVersion || cutoffs.length > 62) throw new Error('Histórico limitado a 62 cortes e versão obrigatória.');
    return [...new Set(cutoffs)].sort((a, b) => timestamp(a) - timestamp(b)).map(asOf => ({ asOf, dataVersion, modelVersion: config.version, result: aggregate(polls, contest, asOf, config) }));
}
