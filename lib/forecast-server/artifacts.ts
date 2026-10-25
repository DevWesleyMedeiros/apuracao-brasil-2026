import { z } from 'zod';
import { resolveElection, resultUrl, CONFIG_URL } from '../election';
import { canonicalJson } from '../forecast/identity';
import { baselineSchema, candidateSchema, contestSchema, configSchema, dateSchema, pollSchema, timestamp } from '../forecast/types';
import { liveSnapshotSchema } from './live-service';
import { sourceTimestamp, adaptTseSnapshot, normalizeIngestedResult } from './tse-adapter';
import { LIVE_CONFIG } from '../forecast/live';
import { aggregate } from '../forecast/aggregate';
import type { Result } from '../catalog';

export const DISCLOSURE_AT = '2026-10-25T17:00:00-03:00';
export const digestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const instant = dateSchema.refine(v=>v.includes('T'),'Horário com fuso obrigatório.');
export const officialSnapshotSchema = z.object({
    schemaVersion:z.literal('1'), collectionId:z.string().min(1), disclosureExpectedAt:z.literal(DISCLOSURE_AT),
    context:z.object({cycle:z.literal('ele2026'),year:z.literal(2026),phase:z.literal('o'),round:z.literal('2'),office:z.literal('1'),territory:z.literal('br'),election:z.string().regex(/^\d{1,6}$/).nullable()}).strict(),
    sourceUrl:z.string().url(), fetchedAt:instant.nullable(), sourceUpdatedAt:instant.nullable(), contentHash:digestSchema.nullable(),
    lastAttemptAt:instant, stale:z.boolean(), state:z.enum(['unavailable','waiting','withheld','partial','finished']),
    diagnostic:z.string().nullable(), config:z.unknown(), raw:z.unknown(), result:z.unknown(),
}).strict().superRefine((v,ctx)=>{
    try {
        if(v.state==='unavailable') {
            if(v.result!==null || v.raw!==null || v.fetchedAt!==null || v.sourceUpdatedAt!==null || v.contentHash!==null || v.sourceUrl!==CONFIG_URL && v.context.election===null) throw new Error('Indisponibilidade não pode inventar resultado.');
            if(v.context.election!==null && (resolveElection(v.config,'1',{round:'2'})!==v.context.election || v.sourceUrl!==resultUrl('br','1',v.context.election))) throw new Error('Contexto não descoberto ou fonte incompatível.');
            return;
        }
        const election=resolveElection(v.config,'1',{round:'2'});
        if(election!==v.context.election || v.sourceUrl!==resultUrl('br','1',election) || !v.fetchedAt || !v.contentHash) throw new Error('Contexto/fonte incompatível.');
        const normalized={...normalizeIngestedResult(v.raw,'br',election,v.sourceUrl),checkedAt:v.fetchedAt};
        if(v.state!==normalized.state || canonicalJson(v.result)!==canonicalJson(normalized) || v.sourceUpdatedAt!==new Date(sourceTimestamp(normalized.generatedAt)).toISOString()) throw new Error('Resultado não corresponde à normalização oficial.');
        if(timestamp(v.sourceUpdatedAt)>timestamp(v.fetchedAt) || timestamp(v.fetchedAt)>timestamp(v.lastAttemptAt)) throw new Error('Horários futuros/incompatíveis.');
    } catch(error) {ctx.addIssue({code:'custom',message:error instanceof Error?error.message:'Artefato oficial inválido.'});}
}).transform(v=>({...v,result:v.result as Result|null}));

export const frozenPreSchema=z.object({schemaVersion:z.literal('1'),asOf:instant,capturedAt:instant,
    polls:z.array(pollSchema),candidates:z.array(candidateSchema).length(2),contest:contestSchema,parameters:configSchema,
}).strict().superRefine((v,ctx)=>{
    try {
    const cutoff=timestamp(v.asOf),captured=timestamp(v.capturedAt);
    if(cutoff>timestamp(DISCLOSURE_AT) || cutoff>captured || captured>timestamp(DISCLOSURE_AT) || v.polls.some(p=>timestamp(p.publishedAt)>cutoff || timestamp(p.accessedAt)>captured || timestamp(p.fieldEnd)>cutoff) || v.candidates.some(c=>timestamp(c.verifiedAt)>captured)) ctx.addIssue({code:'custom',message:'Congelamento exige corte e captura reais até a divulgação, sem informação futura.'});
    }catch{ctx.addIssue({code:'custom',message:'Datas inválidas no pré congelado.'});}
});
export const statisticalProductSchema=z.object({
    collectionId:z.string().min(1), fetchedAt:instant, sourceUpdatedAt:instant, contentHash:digestSchema,
    snapshot:liveSnapshotSchema, baseline:baselineSchema, frozenPre:frozenPreSchema,
}).strict().superRefine((v,ctx)=>{
    try {
        if(v.snapshot.frozenPreAsOf!==v.frozenPre.asOf || canonicalJson(v.baseline.target)!==canonicalJson(v.frozenPre.contest) || v.frozenPre.candidates.some((c,i)=>c.id!==v.baseline.target.candidateIds[i])) throw new Error('Pré e baseline incompatíveis.');
        if(!aggregate(v.frozenPre.polls,v.frozenPre.contest,v.frozenPre.asOf,v.frozenPre.parameters))throw new Error('Pré congelado sem pesquisas elegíveis.');
        const adapted=adaptTseSnapshot({files:v.snapshot.files.map(f=>({...f,raw:f.raw})),baseline:v.baseline,policy:v.snapshot.policy,asOf:v.fetchedAt,config:LIVE_CONFIG});
        if(adapted.sourceUpdatedAt!==v.sourceUpdatedAt || timestamp(v.baseline.verifiedAt)>timestamp(v.fetchedAt))throw new Error('Horário do produto/baseline incompatível.');
    }catch(error){ctx.addIssue({code:'custom',message:error instanceof Error?error.message:'Produto estatístico inválido.'});}
});
export const artifactBundleSchema=z.object({schemaVersion:z.literal('1'),official:officialSnapshotSchema,statistical:statisticalProductSchema.nullable(),statisticalBlock:z.string().nullable()}).strict();
export const artifactPointerSchema=z.object({schemaVersion:z.literal('1'),version:digestSchema}).strict();
export const collectionStatusSchema=z.object({schemaVersion:z.literal('1'),lastAttemptAt:instant,collectionId:z.string(),stale:z.boolean(),diagnostic:z.string().nullable()}).strict();
export type ArtifactBundle=z.infer<typeof artifactBundleSchema>;
