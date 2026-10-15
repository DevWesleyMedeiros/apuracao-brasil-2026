import type { Result } from '../catalog';
import { normalizeResult } from '../election';
import { baselineSchema, timestamp, type Baseline } from '../forecast/types';
import { reconcileSnapshot, type DestinationPolicy } from '../forecast/snapshot';
import { LIVE_CONFIG, projectLive } from '../forecast/live';
export function sourceTimestamp(value:string) {
    const m=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2}:\d{2})$/.exec(value);
    if(!m) throw new Error('Horário da fonte ausente ou inválido.');
    return timestamp(`${m[3]}-${m[2]}-${m[1]}T${m[4]}-03:00`);
}
export function adaptTseSnapshot(input:{files:{uf:string;raw:unknown;url:string}[];baseline:Baseline;asOf:string;policy:DestinationPolicy;config:typeof LIVE_CONFIG}) {
    const baseline=baselineSchema.parse(input.baseline);
    const results=input.files.map(file=>normalizeResult(file.raw,file.uf,'1',baseline.target.election,file.url,undefined,{round:'2'}));
    return adaptResults({...input,results});
}
export function adaptResults(input:{results:Result[];baseline:Baseline;asOf:string;policy:DestinationPolicy;config:typeof LIVE_CONFIG}) {
    const baseline=baselineSchema.parse(input.baseline),now=timestamp(input.asOf);
    const {br,parts}=reconcileSnapshot(input.results,input.policy,false);
    if(br.round!=='2' || br.election!==baseline.target.election || br.context.year!==baseline.target.year || JSON.stringify(br.candidates.map(c=>c.id).sort())!==JSON.stringify([...baseline.target.candidateIds].sort())) throw new Error('Identidades ou contexto de segundo turno incompatíveis.');
    const times=input.results.map(r=>sourceTimestamp(r.generatedAt));
    if(times.some(t=>t>now || now-t>input.config.maxSourceAgeMs) || Math.max(...times)-Math.min(...times)>input.config.maxSourceSkewMs) throw new Error('Snapshot antigo ou defasagem entre arquivos excedida.');
    const territories=parts.map(r=>{
        if(r.sections.total<=0 || r.sections.count>r.sections.total || !Number.isSafeInteger(r.sections.count)) throw new Error('Seções inválidas.');
        return {uf:r.uf,a:r.candidates.find(c=>c.id===baseline.mapping[0].secondId)!.votes!,b:r.candidates.find(c=>c.id===baseline.mapping[1].secondId)!.votes!,sectionFraction:r.sections.count/r.sections.total,finished:r.state==='finished'};
    });
    return {territories,sourceUpdatedAt:new Date(Math.min(...times)).toISOString(),sourceSkewMs:Math.max(...times)-Math.min(...times),sources:input.results.map(r=>r.sourceUrl)};
}
export function liveWithFallback(input:Parameters<typeof adaptResults>[0]&{preShareA:number;computedAt:string}, previous?:{contextKey:string;computedAt:string;sourceUpdatedAt:string;result:ReturnType<typeof projectLive>}) {
    const contextKey=JSON.stringify({target:input.baseline.target,sourceHash:input.baseline.sourceHash,config:input.config,preShareA:input.preShareA});
    try {
        const adapted=adaptResults(input);
        const result=projectLive({territories:adapted.territories,baseline:input.baseline,preShareA:input.preShareA,config:input.config});
        return {contextKey,computedAt:input.computedAt,sourceUpdatedAt:adapted.sourceUpdatedAt,sourceSkewMs:adapted.sourceSkewMs,result};
    } catch(error) {
        if(previous?.contextKey===contextKey && ['ready','finished'].includes(previous.result.state)) return {...previous,stale:true as const,message:'Nova projeção suspensa: '+(error instanceof Error?error.message:'dados inválidos')};
        throw error;
    }
}
