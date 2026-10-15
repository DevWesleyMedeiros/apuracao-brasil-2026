import { z } from 'zod';
import { baselineSchema, proportionSchema, type Baseline } from './types';
import { assertTerritories } from './snapshot';
import { logistic, logit, summarize } from './distribution';
import { normal, rng } from './rng';
export const liveConfigSchema = z.object({
    version:z.string().min(1), minNationalFraction:proportionSchema, minLocalSectionFraction:proportionSchema,
    minVolumeRatio:z.number().finite().positive(), maxVolumeRatio:z.number().finite().positive(),
    nationalSigmaLogit:z.number().finite().nonnegative().max(1), territorySigmaLogit:z.number().finite().nonnegative().max(1), volumeSigmaLog:z.number().finite().nonnegative().max(1),
    simulations:z.number().int().min(100).max(10000), seed:z.number().int().min(0).max(4294967295),
    maxSourceAgeMs:z.number().int().positive(), maxSourceSkewMs:z.number().int().positive(),
}).strict().refine(c=>c.minVolumeRatio<=c.maxVolumeRatio);
export const LIVE_CONFIG = liveConfigSchema.parse({version:'live-logit-v1-experimental',minNationalFraction:.05,minLocalSectionFraction:.05,minVolumeRatio:.5,maxVolumeRatio:2,nationalSigmaLogit:.08,territorySigmaLogit:.12,volumeSigmaLog:.1,simulations:2000,seed:20261025,maxSourceAgeMs:600000,maxSourceSkewMs:120000});
export const liveTerritorySchema=z.object({uf:z.string(),a:z.number().int().nonnegative().safe(),b:z.number().int().nonnegative().safe(),sectionFraction:proportionSchema,finished:z.boolean(),expectedVotes:z.number().finite().nonnegative().optional()}).strict();
export type LiveTerritory=z.infer<typeof liveTerritorySchema>;
export function projectLive(input:{territories:LiveTerritory[];baseline:Baseline;preShareA:number|null;config:z.infer<typeof liveConfigSchema>}) {
    const config=liveConfigSchema.parse(input.config),baseline=baselineSchema.parse(input.baseline);
    assertTerritories(baseline.territories.map(t=>t.uf));
    const territories=input.territories.map(t=>liveTerritorySchema.parse(t)).sort((a,b)=>a.uf.localeCompare(b.uf));
    assertTerritories(territories.map(t=>t.uf));
    const observedA=territories.reduce((s,t)=>s+t.a,0),observedB=territories.reduce((s,t)=>s+t.b,0),observed=observedA+observedB;
    if (!Number.isSafeInteger(observed)) throw new Error('Contagem excede precisão segura.');
    if (territories.some(t=>(t.finished && t.sectionFraction!==1) || (t.expectedVotes!==undefined && t.expectedVotes<t.a+t.b))) throw new Error('Volume esperado abaixo do observado ou fechamento incompatível.');
    if (territories.every(t=>t.finished)) {
        if (!observed) return {state:'insufficient-data' as const,message:'Encerramento sem votos válidos.',observedA,observedB,distribution:null,diagnostics:[]};
        return {state:'finished' as const,message:'Reprodução dos votos oficiais, sem previsão probabilística.',observedA,observedB,distribution:summarize([observedA/observed]),diagnostics:[]};
    }
    const insufficient=(message:string)=>({state:'insufficient-data' as const,message,observedA,observedB,distribution:null,diagnostics:[]});
    const baseTotal=baseline.territories.reduce((s,t)=>s+t.validVotes,0);
    if (!baseTotal || !observed) return insufficient('Sem volume observado ou baseline útil.');
    if (observed/baseTotal<config.minNationalFraction) return insufficient('Evidência nacional insuficiente para swing; votos observados preservados, sem atualização do Modelo A.');
    if(input.preShareA===null) return insufficient('Sem previsão pré-eleitoral congelada e elegível.');
    logit(input.preShareA);
    const baselineA=baseline.territories.reduce((s,t)=>s+t.a,0),baselineB=baseline.territories.reduce((s,t)=>s+t.b,0);
    if (!baselineA || !baselineB) return insufficient('Baseline sem dupla útil para logit.');
    const nationalBase=logit(baselineA/(baselineA+baselineB));
    const units=[];
    for(const t of territories) {
        const base=baseline.territories.find(b=>b.uf===t.uf)!;
        const vc=t.a+t.b;
        if (!base.a || !base.b || !base.validVotes) return insufficient('Baseline territorial degenerado para logit.');
        const priorLogit=logit(input.preShareA)+logit(base.a/(base.a+base.b))-nationalBase;
        const volume=t.finished?vc:t.expectedVotes ?? Math.max(vc,t.sectionFraction>0?Math.min(base.validVotes*config.maxVolumeRatio,Math.max(base.validVotes*config.minVolumeRatio,vc/t.sectionFraction)):base.validVotes);
        if (volume<vc || !Number.isFinite(volume)) throw new Error('Volume esperado inválido.');
        if(!t.finished && t.sectionFraction<1 && volume===vc)return insufficient('Limite de volume esgotado antes das seções; revisão do baseline necessária. Observados preservados.');
        const localEvidence=t.sectionFraction>=config.minLocalSectionFraction && t.a>0 && t.b>0;
        const swing=localEvidence?logit(t.a/vc)-priorLogit:null;
        units.push({...t,vc,volume,remaining:volume-vc,priorLogit,swing});
    }
    const evidence=units.filter(u=>u.swing!==null),evidenceVotes=evidence.reduce((s,u)=>s+u.vc,0);
    if (!evidenceVotes || evidenceVotes/baseTotal<config.minNationalFraction) return insufficient('Sem evidência útil nacional para swing logit.');
    const nationalSwing=evidence.reduce((s,u)=>s+u.vc*u.swing!,0)/evidenceVotes;
    const random=rng(config.seed),samples:number[]=[];
    for(let i=0;i<config.simulations;i++) {
        const commonShock=config.nationalSigmaLogit*normal(random);
        let finalA=0,finalVotes=0;
        for(const u of units) {
            // Observed counts NEVER receive uncertainty or disappear below the evidence threshold.
            const remaining=u.remaining===0?0:u.remaining*Math.exp(config.volumeSigmaLog*normal(random));
            const shrink=u.swing===null?0:u.sectionFraction;
            const remainingLogit=u.priorLogit+nationalSwing*(1-shrink)+(u.swing??0)*shrink+commonShock+config.territorySigmaLogit*normal(random);
            finalA+=u.a+(remaining?remaining*logistic(remainingLogit):0);
            finalVotes+=u.vc+remaining;
        }
        if (!finalVotes) return insufficient('Denominador final zero.');
        samples.push(finalA/finalVotes);
    }
    return {state:'ready' as const,message:'Estimativa experimental ao vivo; não é resultado oficial.',observedA,observedB,distribution:summarize(samples),
        diagnostics:units.map(u=>({uf:u.uf,observedA:u.a,observedB:u.b,expectedVotes:u.volume,remaining:u.remaining,sectionFraction:u.sectionFraction,estimatedVoteFraction:u.volume?u.vc/u.volume:0,localSwingUsed:u.swing!==null})),
        warnings:['Parcial da UF não corresponde às mesmas seções do primeiro turno.','Volume e choques logit são hipóteses não calibradas, sem transferência individual de votos.']};
}
