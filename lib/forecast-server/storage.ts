import { artifactBundleSchema, artifactPointerSchema, officialSnapshotSchema, type ArtifactBundle } from './artifacts';
import { sha256 } from '../forecast/identity';
import { withDeadline } from '../deadline';
import { evaluationRegistrySchema } from '../forecast/types';

export interface SnapshotReader { read(name:string):Promise<unknown> }
export class HttpsSnapshotReader implements SnapshotReader {
    private origin:URL;
    constructor(origin:string,private token?:string) {
        this.origin=new URL(origin.endsWith('/')?origin:`${origin}/`);
        if(this.origin.protocol!=='https:' || this.origin.username || this.origin.password || this.origin.search || this.origin.hash) throw new Error('Origem HTTPS fixa inválida.');
    }
    async read(name:string):Promise<unknown> {
        if(!/^(current|evaluation|status)\.json$|^versions\/[a-f0-9]{64}\.json$/.test(name)) throw new Error('Nome inválido.');
        return withDeadline(async signal=>{
            const response=await fetch(new URL(name,this.origin),{signal,cache:'no-store',redirect:'error',headers:this.token?{Authorization:`Bearer ${this.token}`}:{}});
            if(!response.ok) throw new Error('Armazenamento de snapshots indisponível.');
            // Bound the body as well as headers. No unbounded response.json().
            const reader=response.body?.getReader(); if(!reader) throw new Error('Artefato vazio.');
            let size=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
            try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>12_000_000)throw new Error('Artefato excede limite.');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
            finally {await reader.cancel();}
            return JSON.parse(text) as unknown;
        },10000);
    }
}
async function readVersion(reader:SnapshotReader):Promise<unknown> {
    const pointer=artifactPointerSchema.parse(await reader.read('current.json'));
    const raw=await reader.read(`versions/${pointer.version}.json`);
    if(await sha256(raw)!==pointer.version) throw new Error('Hash do conjunto divergente.');
    return raw;
}
export async function readOfficialSnapshot(reader:SnapshotReader) {
    const raw=await readVersion(reader);
    if(!raw || typeof raw!=='object' || !('schemaVersion' in raw) || raw.schemaVersion!=='1' || !('official' in raw))throw new Error('Manifesto oficial inválido.');
    const official=officialSnapshotSchema.parse(raw.official);
    if(official.raw!==null && await sha256(official.raw)!==official.contentHash)throw new Error('Hash nacional divergente.');
    // Statistical validation is deliberately independent: a missing/invalid
    // baseline or evaluation must NEVER prevent reading official votes.
    return official;
}
export async function readBundle(reader:SnapshotReader):Promise<ArtifactBundle> {
    const raw=await readVersion(reader);
    const bundle=artifactBundleSchema.parse(raw);
    if(bundle.official.raw!==null && await sha256(bundle.official.raw)!==bundle.official.contentHash) throw new Error('Hash nacional divergente.');
    if(bundle.statistical && await sha256(bundle.statistical.snapshot)!==bundle.statistical.contentHash) throw new Error('Hash live divergente.');
    return bundle;
}
export async function configuredReader():Promise<SnapshotReader|null> {
    if(process.env.FORECAST_STORAGE==='https') return new HttpsSnapshotReader(process.env.FORECAST_ARTIFACT_ORIGIN??'',process.env.FORECAST_ARTIFACT_TOKEN);
    if(process.env.FORECAST_STORAGE==='local' || (!process.env.FORECAST_STORAGE && process.env.NODE_ENV==='development')) {
        if(process.env.VERCEL || process.env.CF_PAGES) throw new Error('Filesystem local não é persistência de deploy.');
        const {LocalSnapshotReader}=await import('./storage-node');
        return new LocalSnapshotReader(process.env.FORECAST_DATA_DIR??'data/forecast');
    }
    return null;
}
export async function readEvaluation(reader:SnapshotReader|null,fallback:unknown,mode:'pre'|'live') {
    let raw:unknown=fallback;
    try {if(reader) raw=await reader.read('evaluation.json');} catch {return null;}
    if(raw===null)return null;
    const registry=evaluationRegistrySchema.safeParse(raw);
    // Legacy, boolean and unknown metadata stay blocked (never auto-approved).
    return registry.success?registry.data[mode]:raw;
}
