import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { atomicJson, readJson } from './forecast-cli.mjs';

export function abortableSleep(ms,signal) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(signal.reason);return;}
    const stop=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);
    signal?.addEventListener('abort',stop,{once:true});
  });
}
export function retryAfterMs(value,now) {
  if(!value)return 0;
  const seconds=Number(value);
  return Math.max(0,Number.isFinite(seconds)?seconds*1000:Date.parse(value)-now)||0;
}
export function classify(error) {
  if(error.status===404)return 'absent';
  if(error.status===403)return 'forbidden-intervention';
  if(error.status===429)return 'rate-limited';
  if(error.status)return `http-${error.status}`;
  if(error.name==='RequestTimeoutError' || error.name==='TimeoutError')return 'timeout';
  if(error.name==='AbortError')return 'interrupted';
  if(error.name==='ZodError' || error.schemaError)return 'schema-context';
  return 'network-or-io';
}
export async function downloadWithBackoff(download,url,{signal,sleep=abortableSleep,random=Math.random}={}) {
  for(let attempt=0;;attempt++) {
    try {return await download(url,signal);}
    catch(error) {
      if(signal?.aborted || error.status && error.status<500 || attempt>=2 || error.schemaError)throw error;
      await sleep(Math.max(retryAfterMs(error.retryAfter,Date.now()),Math.min(10000,1000*2**attempt)*(0.75+random()/2)),signal);
    }
  }
}
// Completion-relative schedule: await round, then wait. No timers spawning rounds.
export async function runContinuous(round,{intervalMs=60000,signal,sleep=abortableSleep,random=Math.random,once=false,onError=()=>{}}={}) {
  let failures=0;
  while(!signal?.aborted) {
    let delay=intervalMs;
    try {await round();failures=0;}
    catch(error) {
      if(signal?.aborted)break;
      onError(error);failures++;
      delay=Math.max(intervalMs,Math.min(600000,intervalMs*2**Math.min(failures,4))*(0.75+random()/2),retryAfterMs(error.retryAfter,Date.now()));
      // 403 is not a transient missing file. Operator must investigate access.
      if(error.status===403 || once)throw error;
    }
    if(once || signal?.aborted)break;
    try {await sleep(delay,signal);}catch(error){if(!signal?.aborted)throw error;}
  }
}
async function optionalJson(file) {try{return await readJson(file);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function archiveRaw(directory,files,context,diagnostic,canonicalJson) {
  const entries=files.map(f=>({url:f.url,hash:createHash('sha256').update(f.rawBytes??f.rawText).digest('hex')}));
  const key=createHash('sha256').update(canonicalJson({context,entries})).digest('hex');
  const destination=path.join(directory,'collections',key);
  await fs.mkdir(path.dirname(destination),{recursive:true});
  const temporary=await fs.mkdtemp(path.join(path.dirname(destination),'.collect-'));
  try {
    for(const [i,f] of files.entries())await fs.writeFile(path.join(temporary,`${i}.json`),f.rawBytes??f.rawText);
    await atomicJson(path.join(temporary,'manifest.json'),{schemaVersion:'1',context,diagnostic,files:files.map((f,i)=>({...entries[i],name:`${i}.json`,fetchedAt:f.fetchedAt,sourceUpdatedAt:f.data?.dg&&f.data?.hg?`${f.data.dg} ${f.data.hg}`:null,parseError:!!f.parseError}))});
    try {await fs.rename(temporary,destination);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;}
  } finally {await fs.rm(temporary,{recursive:true,force:true});}
  return key;
}

export async function createOfficialCollector(load,options) {
  const {CONFIG_URL,resolveElection,resultUrl}=await load('election');
  const {downloadTseFile}=await load('tse');
  const {sha256,canonicalJson}=await load('forecast/identity');
  const {officialSnapshotSchema,artifactBundleSchema,statisticalProductSchema,DISCLOSURE_AT,frozenPreSchema}=await load('forecast-server/artifacts');
  const {LocalSnapshotReader}=await load('forecast-server/storage-node');
  const {readBundle}=await load('forecast-server/storage');
  const {baselineSchema}=await load('forecast/types');
  const {adaptTseSnapshot,sourceTimestamp,normalizeIngestedResult}=await load('forecast-server/tse-adapter');
  const {LIVE_CONFIG}=await load('forecast/live');
  const {TERRITORIES}=await load('forecast/snapshot');
  const {liveSnapshotSchema}=await load('forecast-server/live-service');
  const output=options.output,history=options.history,now=options.now??Date.now;
  const download=options.download??downloadTseFile,signal=options.signal;
  const sleep=options.sleep??abortableSleep;
  let last=null;
  try {last=await readBundle(new LocalSnapshotReader(output));}catch(error){if(error.code!=='ENOENT')console.warn('[collector] previous bundle unavailable; not replacing unknown files until validated');}
  async function promote(bundle) {
    const validated=artifactBundleSchema.parse(bundle),version=await sha256(validated);
    const file=path.join(output,'versions',`${version}.json`);
    const existing=await optionalJson(file);
    if(existing && await sha256(existing)!==version)throw new Error('Versão imutável corrompida; ponteiro anterior preservado.');
    if(!existing)await atomicJson(file,validated);
    await atomicJson(path.join(output,'current.json'),{schemaVersion:'1',version});
    last=validated;
  }
  return async function round() {
    const started=now(),files=[],results=[],failures=[];
    let config=null,election=null,official=last?.official??null,statistical=last?.statistical??null,block=null,nationalAccepted=false;
    const stamp=()=>new Date(now()).toISOString();
    const context=()=>({cycle:'ele2026',year:2026,phase:'o',round:'2',office:'1',territory:'br',election});
    const status=async(stale,diagnostic)=>{
      if(official)await atomicJson(path.join(output,'status.json'),{schemaVersion:'1',lastAttemptAt:stamp(),collectionId:official.collectionId,stale,diagnostic});
    };
    const get=async url=>{
      // Explicit conservative 1s spacing, including failures; transport also paces.
      if(files.length)await sleep(options.spacingMs??1000,signal);
      const file=await downloadWithBackoff(download,url,{signal,sleep,random:options.random});files.push(file);return file;
    };
    try {
      const configuration=await get(CONFIG_URL);config=configuration.data;
      try {election=resolveElection(config,'1',{round:'2'});}catch(error){error.schemaError=true;throw error;}
      const national=await get(resultUrl('br','1',election));
      let result;
      try {result={...normalizeIngestedResult(national.data,'br',election,national.url),checkedAt:national.fetchedAt};}catch(error){error.schemaError=true;throw error;}
      const contentHash=await sha256(national.data);
      let sourceUpdatedAt;
      try {sourceUpdatedAt=new Date(sourceTimestamp(result.generatedAt)).toISOString();}catch(error){error.schemaError=true;throw error;}
      // Content identity never uses fetch time. Repeated queries do not age-reset.
      const collectionId=await sha256({context:context(),contentHash});
      const sourceOld=now()-Date.parse(sourceUpdatedAt)>600000;
      const candidate=officialSnapshotSchema.parse({schemaVersion:'1',collectionId,context:context(),disclosureExpectedAt:DISCLOSURE_AT,sourceUrl:national.url,fetchedAt:national.fetchedAt,sourceUpdatedAt,contentHash,lastAttemptAt:stamp(),stale:sourceOld,state:result.state,diagnostic:null,config,raw:national.data,result});
      const correction=official?.result && candidate.result && official.context.election===candidate.context.election && official.state!=='withheld' && candidate.state!=='withheld' && (candidate.result.votes.valid<official.result.votes.valid || official.result.candidates.some(c=>{const next=candidate.result.candidates.find(n=>n.id===c.id)?.votes;return typeof next==='number' && typeof c.votes==='number' && next<c.votes;}));
      if(correction) {
        failures.push('official-correction-revalidated');
        const transition={context:context(),from:official.contentHash,to:candidate.contentHash};
        const record=path.join(history,'corrections',`${await sha256(transition)}.json`);
        if(!await optionalJson(record))await atomicJson(record,{schemaVersion:'1',...transition,observedAt:stamp(),sourceUpdatedAt,validation:'official-correction-revalidated'});
        console.info('[collector] official-correction-revalidated',collectionId);
      }
      if(official?.collectionId!==collectionId) {
        official=candidate;
        // National publication is independent of baseline, policy and UF availability.
        await promote({schemaVersion:'1',official,statistical,statisticalBlock:'Coleta territorial em andamento; produtos têm identidades/horários próprios.'});
      }
      nationalAccepted=true;await status(sourceOld,null);
      await atomicJson(path.join(output,'data.json'),{...official,lastAttemptAt:stamp(),stale:sourceOld,diagnostic:null});
      results.push(result);
      for(const uf of TERRITORIES) {
        try {
          const file=await get(resultUrl(uf,'1',election));
          try {const normalized=normalizeIngestedResult(file.data,uf,election,file.url);results.push(normalized);}
          catch(error){error.schemaError=true;throw error;}
        } catch(error) {
          failures.push(`${uf}:${classify(error)}`);
          if(signal?.aborted || error.status===403 || error.status===429)throw error;
        }
      }
      try {
        if(results.length!==29)throw new Error(`Conjunto territorial incompleto (${results.length}/29): ${failures.join(',')}`);
        if(!options.policy)throw new Error('Política de destinação oficial verificada não fornecida (--policy).');
        if(!options.baseline)throw new Error('Baseline real verificado não fornecido (--baseline).');
        if(!options.frozenPre)throw new Error('Pré capturado e arquivado até o marco de divulgação não fornecido (--frozen-pre).');
        const baseline=baselineSchema.parse(await readJson(options.baseline));
        const frozenPre=frozenPreSchema.parse(await readJson(options.frozenPre));
        const snapshot=liveSnapshotSchema.parse({frozenPreAsOf:frozenPre.asOf,policy:await readJson(options.policy),files:files.slice(1).map(file=>({uf:results.find(r=>r.sourceUrl===file.url)?.uf??'',raw:file.data,url:file.url}))});
        const adapted=adaptTseSnapshot({files:snapshot.files,baseline,policy:snapshot.policy,asOf:stamp(),config:LIVE_CONFIG});
        const contentHash=await sha256(snapshot);
        const id=await sha256({context:context(),contentHash,baseline,frozenPre});
        if(statistical?.collectionId!==id)statistical=statisticalProductSchema.parse({collectionId:id,fetchedAt:stamp(),sourceUpdatedAt:adapted.sourceUpdatedAt,contentHash,snapshot,baseline,frozenPre});
        await atomicJson(path.join(output,'live-snapshot.json'),snapshot);
      } catch(error) {block=error.message;}
      const bundle={schemaVersion:'1',official,statistical,statisticalBlock:block};
      if(canonicalJson(bundle)!==canonicalJson(last))await promote(bundle);
      const archive=await archiveRaw(history,files,context(),{complete:results.length===29,failures,statisticalBlock:block},canonicalJson);
      console.info('[collector]',JSON.stringify({durationMs:now()-started,state:official.state,sourceAgeSeconds:Math.round((now()-Date.parse(official.sourceUpdatedAt))/1000),statisticalBlock:block,archive}));
      return last;
    } catch(error) {
      const reason=classify(error);
      if(!official) {
        official=officialSnapshotSchema.parse({schemaVersion:'1',collectionId:await sha256({context:context(),state:'unavailable'}),context:context(),disclosureExpectedAt:DISCLOSURE_AT,sourceUrl:election?resultUrl('br','1',election):CONFIG_URL,fetchedAt:null,sourceUpdatedAt:null,contentHash:null,lastAttemptAt:stamp(),stale:true,state:'unavailable',diagnostic:reason,config,raw:null,result:null});
        await promote({schemaVersion:'1',official,statistical:null,statisticalBlock:reason});
      }
      await status(!nationalAccepted,reason);
      const failedBundle={schemaVersion:'1',official,statistical,statisticalBlock:`Coleta interrompida: ${reason}.`};
      if(canonicalJson(failedBundle)!==canonicalJson(last))await promote(failedBundle);
      await atomicJson(path.join(output,'data.json'),{...official,lastAttemptAt:stamp(),stale:!nationalAccepted,diagnostic:reason});
      if(files.length)await archiveRaw(history,files,context(),{complete:false,reason,failures},canonicalJson);
      console.warn('[collector]',JSON.stringify({durationMs:now()-started,state:nationalAccepted?official.state:'stale-or-unavailable',reason}));
      throw error;
    }
  };
}
