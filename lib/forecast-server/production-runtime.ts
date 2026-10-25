import { sha256, TRANSFORMATION_VERSION } from '../forecast/identity';
import { MODEL_CONFIG, FLAGS } from '../forecast/config';
import { LIVE_CONFIG } from '../forecast/live';
import type { ArtifactBundle } from './artifacts';
import { buildForecast, type ForecastMode, type ForecastResponse } from './service';
import { buildLiveForecast } from './live-service';
import { evaluationMetadataSchema } from '../forecast/types';

export type ForecastRequest={mode:ForecastMode;asOf:string;historical:boolean;cutoffs:string[];now:number};
export type RuntimeInputs={polls:unknown[];candidates:unknown[];contest:unknown;evaluation:unknown;product:ArtifactBundle['statistical'];block:string;officialFinished?:boolean};
// I/O happens before this coordinator. Only completed values are cached.
export function createForecastRuntime() {
    const cache=new Map<string,{expires:number;value:ForecastResponse}>();
    const lastLive=new Map<string,ForecastResponse>();
    return async function forecast(input:ForecastRequest,inputs:RuntimeInputs,flags:{preEnabled:boolean;liveEnabled:boolean;publicProbabilityEnabled:boolean}=FLAGS) {
        const {product,evaluation,block}=inputs;
        const polls=input.mode==='live'?(product?.frozenPre.polls??[]):inputs.polls;
        const candidates=input.mode==='live'?(product?.frozenPre.candidates??inputs.candidates):inputs.candidates;
        const contest=input.mode==='live'?(product?.frozenPre.contest??inputs.contest):inputs.contest;
        const preConfig=input.mode==='live'?(product?.frozenPre.parameters??MODEL_CONFIG):MODEL_CONFIG;
        const baseline=product?.baseline??null,snapshot=product?.snapshot??null;
        const operationalHashes={polls:await sha256(polls),candidates:await sha256(candidates),context:await sha256(contest),
            baseline:input.mode==='live'&&baseline?await sha256(baseline):null,
            policy:input.mode==='live'&&snapshot?await sha256(snapshot.policy):null,
            snapshot:input.mode==='live'&&snapshot?await sha256(snapshot):null,
            frozenPre:input.mode==='live'&&product?await sha256(product.frozenPre):null};
        const dataVersion=await sha256(operationalHashes);
        const parametersHash=await sha256(input.mode==='pre'?{mode:'pre',pre:preConfig,transformation:TRANSFORMATION_VERSION}:{mode:'live',live:LIVE_CONFIG,pre:preConfig,transformation:TRANSFORMATION_VERSION});
        const key=await sha256({contest,mode:input.mode,asOf:input.asOf,cutoffs:input.cutoffs,historical:input.historical,dataVersion,evaluation,
            productMetadata:input.mode==='live'&&product?{collectionId:product.collectionId,fetchedAt:product.fetchedAt}:null,officialFinished:inputs.officialFinished??false,parametersHash,flags});
        const previous=cache.get(key);
        // Current authorization is rechecked below on each call, including hits.
        const data={polls,candidates,contest,evaluation,dataVersion,baselineHash:operationalHashes.baseline,policyHash:operationalHashes.policy};
        let value=buildForecast({...input,data,config:preConfig,parametersHash,flags,computedAt:new Date(input.now).toISOString()});
        // A cache hit can reuse a pre computation only after this call's gate.
        if(input.mode==='pre' && previous && previous.expires>input.now && previous.value.publicProbabilityEnabled===value.publicProbabilityEnabled)return previous.value;
        const approvedMetadata=evaluationMetadataSchema.safeParse(evaluation);
        value={...value,operationalHashes,evaluationHash:await sha256(evaluation),historicalDatasetHash:approvedMetadata.success?approvedMetadata.data.historicalDatasetHash:null,collectionId:input.mode==='live'?(product?.collectionId??null):null,snapshotFetchedAt:input.mode==='live'?(product?.fetchedAt??null):null};
        if(input.mode==='live' && !flags.liveEnabled)value={...value,message:`Motor live desabilitado. ${block}`};
        if(input.mode==='live' && flags.liveEnabled) {
            const liveKey=await sha256({context:operationalHashes.context,baseline:operationalHashes.baseline,policy:operationalHashes.policy,frozenPre:operationalHashes.frozenPre,candidates:operationalHashes.candidates,parametersHash,flags});
            value=buildLiveForecast({base:value,data,baseline,snapshot,preConfig,enabled:true,probabilityEnabled:flags.publicProbabilityEnabled},lastLive.get(liveKey));
            if(!product && value.estimate===null)value={...value,message:block};
            if(value.state==='finished' || value.state==='ready' && !inputs.officialFinished) {
                lastLive.set(liveKey,value);while(lastLive.size>8)lastLive.delete(lastLive.keys().next().value!);
            }
        }
        if(input.mode==='live' && inputs.officialFinished && value.state!=='finished')value={...value,state:'insufficient-data',estimate:null,publicProbabilityEnabled:false,probabilityReason:'Apuração oficial encerrada; não há probabilidade prospectiva de vitória.',message:'Apuração nacional oficial encerrada. Projeção prospectiva suspensa; consulte o resultado oficial. Conjunto estatístico final ainda não conciliado.'};
        if(value.state==='ready'||value.state==='finished') {
            cache.set(key,{value,expires:input.now+(input.mode==='pre'?300000:15000)});
            while(cache.size>32)cache.delete(cache.keys().next().value!);
        }
        return value;
    };
}
