import { z } from 'zod';
import { aggregate } from '../forecast/aggregate';
import { LIVE_CONFIG, projectLive } from '../forecast/live';
import { baselineSchema, dateSchema, timestamp } from '../forecast/types';
import { probabilityPermission } from '../forecast/quality';
import { adaptTseSnapshot } from './tse-adapter';
import type { ForecastResponse, ForecastData } from './service';
export const liveSnapshotSchema=z.object({
    frozenPreAsOf:dateSchema,
    files:z.array(z.object({uf:z.string(),raw:z.unknown(),url:z.string().url()}).strict()).length(29),
    policy:z.object({valid:z.array(z.string()).min(1),excluded:z.array(z.string()),reference:z.string().url()}).strict(),
}).strict();
export function buildLiveForecast(input:{base:ForecastResponse;data:ForecastData;baseline:unknown;snapshot:unknown;preConfig:Parameters<typeof aggregate>[3];enabled:boolean;probabilityEnabled:boolean},previous?:ForecastResponse):ForecastResponse {
    const {base}=input;
    if(!input.enabled) return base;
    try {
        const baseline=baselineSchema.parse(input.baseline),snapshot=liveSnapshotSchema.parse(input.snapshot);
        if(base.candidates.some(c=>timestamp(c.verifiedAt)>timestamp(base.asOf)) || timestamp(baseline.verifiedAt)>timestamp(base.asOf))throw new Error('Identidades/baseline ainda não verificados no corte.');
        if (JSON.stringify(input.data.contest)!==JSON.stringify(baseline.target) || base.context.election!==baseline.target.election || base.candidates.length!==2 || base.candidates.some((c,i)=>c.id!==baseline.target.candidateIds[i])) throw new Error('Contexto ou candidatos não verificados.');
        if(timestamp(snapshot.frozenPreAsOf)>Math.min(timestamp(base.asOf),timestamp(baseline.target.electionAt))) throw new Error('Pré-eleitoral congelado não pode usar futuro.');
        const adapted=adaptTseSnapshot({files:snapshot.files.map(f=>({...f,raw:f.raw})),baseline,asOf:base.asOf,policy:snapshot.policy,config:LIVE_CONFIG});
        const pre=aggregate(input.data.polls,baseline.target,snapshot.frozenPreAsOf,input.preConfig);
        const projected=projectLive({territories:adapted.territories,baseline,preShareA:pre?.weightedPollShare??null,config:LIVE_CONFIG});
        if(!projected.distribution) return {...base,state:'insufficient-data',message:projected.message,estimate:null};
        const finished=projected.state==='finished',d=projected.distribution;
        const permission=probabilityPermission({enabled:input.probabilityEnabled,evaluation:input.data.evaluation,modelVersion:LIVE_CONFIG.version,dataVersion:base.dataVersion,parametersHash:base.parametersHash,asOf:base.asOf,year:baseline.target.year,mode:'live',baselineHash:input.data.baselineHash,policyHash:input.data.policyHash});
        return {...base,...permission,modelVersion:LIVE_CONFIG.version,sourceUpdatedAt:adapted.sourceUpdatedAt,state:projected.state,message:projected.message,sources:adapted.sources,
            warnings:[...base.warnings,`Máxima idade da fonte: ${LIVE_CONFIG.maxSourceAgeMs/1000}s; defasagem permitida: ${LIVE_CONFIG.maxSourceSkewMs/1000}s; observada: ${adapted.sourceSkewMs/1000}s.`,`Modelo A congelado em ${snapshot.frozenPreAsOf}; avanço de seções não equivale a votos.`],
            publicProbabilityEnabled:!finished&&permission.publicProbabilityEnabled,probabilityReason:finished?'Apuração encerrada: resultado oficial reproduzido, não previsão de vitória.':permission.probabilityReason,
            estimate:{a:d.a,b:d.b,weightedPollShare:pre?.weightedPollShare??null,probabilityA:!finished&&permission.publicProbabilityEnabled?d.probabilityA:null,probabilityB:!finished&&permission.publicProbabilityEnabled?d.probabilityB:null,probabilityTie:!finished&&permission.publicProbabilityEnabled?d.probabilityTie:null}};
    } catch {
        if(previous && (previous.state==='ready'||previous.state==='finished') && previous.mode==='live' && JSON.stringify(previous.context)===JSON.stringify(base.context) && previous.parametersHash===base.parametersHash && previous.modelVersion===LIVE_CONFIG.version && previous.operationalHashes && base.operationalHashes && ['baseline','policy','frozenPre','candidates','context'].every(key=>previous.operationalHashes![key]===base.operationalHashes![key])) {
            const permission=probabilityPermission({enabled:input.probabilityEnabled,evaluation:input.data.evaluation,modelVersion:LIVE_CONFIG.version,dataVersion:previous.dataVersion,parametersHash:base.parametersHash,asOf:base.asOf,year:base.context.year,mode:'live',baselineHash:input.data.baselineHash,policyHash:input.data.policyHash});
            // Reauthorization at the current time, even when the estimate is old.
            // Never restore probabilities after revocation or at official closure.
            const allowed=permission.publicProbabilityEnabled && previous.state!=='finished';
            return {...previous,...permission,evaluationHash:base.evaluationHash,historicalDatasetHash:base.historicalDatasetHash,publicProbabilityEnabled:allowed,state:'stale',estimate:{...previous.estimate,probabilityA:allowed?previous.estimate.probabilityA:null,probabilityB:allowed?previous.estimate.probabilityB:null,probabilityTie:allowed?previous.estimate.probabilityTie:null},message:'Nova projeção suspensa: snapshot inválido, ausente, retido ou antigo. Horários e hashes operacionais originais preservados; autorização revalidada.'};
        }
        return {...base,state:'insufficient-data',estimate:null,message:'Live sem baseline e snapshot íntegros, atuais e compatíveis; nova projeção suspensa.'};
    }
}
