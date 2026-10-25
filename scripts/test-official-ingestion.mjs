import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJson, readJson } from './forecast-cli.mjs';
import { createOfficialCollector, runContinuous, downloadWithBackoff, retryAfterMs, classify, abortableSleep } from './official-collector.mjs';

export async function testOfficialIngestion(forecast,dir) {
  const {load,contest,poll,MODEL_CONFIG,baseline,policy,ready,futureEvaluation,request,secondResults}=forecast;
  const {sha256,canonicalJson}=await load('forecast/identity');
  const {DISCLOSURE_AT,frozenPreSchema,officialSnapshotSchema}=await load('forecast-server/artifacts');
  const {readBundle,readOfficialSnapshot,readEvaluation,HttpsSnapshotReader}=await load('forecast-server/storage');
  const {LocalSnapshotReader,writeAtomicJson}=await load('forecast-server/storage-node');
  const {buildLiveForecast}=await load('forecast-server/live-service');
  const {LIVE_CONFIG}=await load('forecast/live');
  const {adaptResults}=await load('forecast-server/tse-adapter');
  const {probabilityPermission}=await load('forecast/quality');
  const candidates=['a','b'].map(id=>({id,name:id,sourceUrl:'https://example.test',verifiedAt:'2026-10-01'}));
  const frozen={schemaVersion:'1',capturedAt:'2026-10-25T16:00:00-03:00',asOf:'2026-10-25T16:00:00-03:00',polls:[poll],candidates,contest,parameters:MODEL_CONFIG};
  frozenPreSchema.parse(frozen);
  for(const change of [{asOf:'2026-10-25T17:01:00-03:00'},{capturedAt:'2026-10-25T17:01:00-03:00'},{polls:[{...poll,publishedAt:'2026-10-25T16:01:00-03:00',accessedAt:'2026-10-25T16:02:00-03:00'}]}])assert.equal(frozenPreSchema.safeParse({...frozen,...change}).success,false);
  assert.equal(await sha256({b:1,a:2}),await sha256({a:2,b:1}));
  assert.throws(()=>canonicalJson({a:undefined}));
  assert.notEqual(await sha256({snapshot:1}),await sha256({snapshot:2}));
  const config={f:'o',pl:[{c:'ele2026',dt:'25/10/2026',e:[{cd:contest.election,t:'2',abr:[{cp:[{cd:'1'}]}]}]}]};
  let time=Date.parse(DISCLOSURE_AT)-60000,state='waiting',failure=null,count=0,ufFailure=null,sourceHour='16:00:00';
  const output=path.join(dir,'operational'),history=path.join(dir,'history');
  const raw=(uf)=>({ele:contest.election,t:'2',f:'o',cdabr:uf,tpabr:uf==='br'?'br':'uf',dg:'25/10/2026',hg:sourceHour,dt:'25/10/2026',ht:sourceHour,dv:state==='withheld'?'n':'s',tf:state==='finished'?'s':'n',and:state==='waiting'?'n':state==='finished'?'f':'p',carg:[{cd:'1',nmn:'Presidente',nv:'1',agr:[{par:[{sg:'TEST',cand:['a','b'].map((id,i)=>({n:String(i),sqcand:id,nmu:id,nm:id,vap:String((uf==='br'?28:1)*(state==='waiting'?0:i===0?40:60)),pvap:i===0?'40':'60',st:'',dvt:'valid',e:'n'}))}]}]}],s:{ts:'10',st:state==='finished'?'10':state==='waiting'?'0':'5',pst:state==='finished'?'100':state==='waiting'?'0':'50'},v:{vv:String((uf==='br'?28:1)*(state==='waiting'?0:100)),vb:'0',tvn:'0'}});
  const http=(status)=>Object.assign(new Error(`HTTP ${status}`),{status,retryAfter:status===429?'120':null});
  const download=async url=>{
    count++;if(failure)throw failure;
    let data=config;
    if(!url.endsWith('ele-c.json')) {const uf=url.split('/dados/')[1].split('/')[0];if(uf===ufFailure)throw http(404);data=raw(uf);}
    return {data,rawText:JSON.stringify(data),url,fetchedAt:new Date(time).toISOString()};
  };
  const collector=await createOfficialCollector(load,{output,history,download,now:()=>time,sleep:async()=>{},spacingMs:0});
  for(const clock of [Date.parse(DISCLOSURE_AT)-1,Date.parse('2026-10-25T20:00:00Z'),Date.parse(DISCLOSURE_AT)+60000]) {
    time=clock;await collector();const bundle=await readBundle(new LocalSnapshotReader(output));assert.equal(bundle.official.state,'waiting','clock never implies disclosure');assert.equal(bundle.statistical,null);assert.match(bundle.statisticalBlock,/Política/);
  }
  const collections=await fs.readdir(path.join(history,'collections'));assert.equal(collections.length,1,'identical rounds do not duplicate raw history');
  assert.equal(count,90,'three rounds rediscover config and collect 29 files sequentially');
  const versions=await fs.readdir(path.join(output,'versions'));assert.equal(versions.length,2,'national-first and completed manifest only; no duplicate versions per repeated poll');
  const first=await readBundle(new LocalSnapshotReader(output));
  assert.equal(first.official.fetchedAt,new Date(Date.parse(DISCLOSURE_AT)-1).toISOString(),'fetching duplicates must preserve original fetch timestamp');
  // Dynamic update on same reader, no module rebuild/restart.
  const reader=new LocalSnapshotReader(output);
  state='partial';await collector();const partial=await readBundle(reader);assert.equal(partial.official.state,'partial');assert.notEqual(partial.official.contentHash,first.official.contentHash);
  ufFailure='zz';await collector();const incomplete=await readBundle(reader);assert.equal(incomplete.official.state,'partial');assert.match(incomplete.statisticalBlock,/28\/29/);ufFailure=null;
  for(const status of [404,429,403]) {
    failure=http(status);const original=await readBundle(reader);await assert.rejects(collector());const preserved=await readBundle(reader);assert.equal(preserved.official.contentHash,original.official.contentHash);assert.equal(preserved.official.fetchedAt,original.official.fetchedAt);assert.equal((await readJson(path.join(output,'status.json'))).stale,true);
  }
  failure=null;state='withheld';await collector();const withheld=await readBundle(reader);assert.equal(withheld.official.result.candidates[0].votes,null);assert.equal(withheld.official.result.state,'withheld');
  for(const stateName of ['finished','waiting','partial']) {state=stateName;await collector();assert.equal((await readBundle(reader)).official.state,stateName);}
  const latest=await readBundle(reader);
  const invalidStatistics={...latest,statistical:{baseline:'invalid'}};
  const invalidStatReader={read:async name=>name==='current.json'?{schemaVersion:'1',version:await sha256(invalidStatistics)}:invalidStatistics};
  await assert.rejects(readBundle(invalidStatReader));assert.equal((await readOfficialSnapshot(invalidStatReader)).contentHash,latest.official.contentHash,'invalid statistics cannot block official national votes');
  for(const change of [{context:{...latest.official.context,election:'999'}},{raw:{...latest.official.raw,f:'s'}},{raw:{...latest.official.raw,t:'1'}},{raw:{...latest.official.raw,cdabr:'rs'}},{raw:{...latest.official.raw,carg:[]}}])assert.equal(officialSnapshotSchema.safeParse({...latest.official,...change}).success,false);
  // A failed atomic write (serialization interrupted) must not touch prior data.
  const file=path.join(output,'atomic.json');await writeAtomicJson(file,{ok:1});const circular={};circular.self=circular;
  await assert.rejects(writeAtomicJson(file,circular));assert.deepEqual(await readJson(file),{ok:1});
  await atomicJson(path.join(output,'current.json'),{schemaVersion:'1',version:'0'.repeat(64)});await assert.rejects(readBundle(reader));
  const empty=path.join(dir,'absent-official');failure=http(404);
  const absent=await createOfficialCollector(load,{output:empty,history,download,now:()=>time,sleep:async()=>{}});await assert.rejects(absent());assert.equal((await readBundle(new LocalSnapshotReader(empty))).official.result,null);
  failure=null;
  assert.equal(classify(http(404)),'absent');assert.equal(classify(http(403)),'forbidden-intervention');assert.equal(classify({name:'RequestTimeoutError'}),'timeout');
  assert.equal(retryAfterMs('120',time),120000);assert.equal(retryAfterMs(new Date(time+60000).toUTCString(),time),60000);
  let attempts=0;await assert.rejects(downloadWithBackoff(async()=>{attempts++;throw http(429);},'test',{sleep:async()=>{}}));assert.equal(attempts,1);
  const delays=[];attempts=0;await downloadWithBackoff(async()=>{if(attempts++<2)throw new TypeError('network');return 'recovered';},'test',{sleep:async ms=>delays.push(ms),random:()=>.5});assert.deepEqual(delays,[1000,2000]);
  const controller=new AbortController();let rounds=0,busy=false;
  await runContinuous(async()=>{assert.equal(busy,false);busy=true;await Promise.resolve();rounds++;busy=false;},{signal:controller.signal,sleep:async ms=>{assert.equal(busy,false);assert.equal(ms,60000);if(rounds===3)controller.abort();}});assert.equal(rounds,3);
  const backoff=[];const recovery=new AbortController();rounds=0;
  await runContinuous(async()=>{rounds++;if(rounds===1)throw http(429);},{signal:recovery.signal,random:()=>.5,sleep:async ms=>{backoff.push(ms);if(rounds===2)recovery.abort();}});assert.deepEqual(backoff,[120000,60000]);
  const aborted=new AbortController();const sleeping=abortableSleep(100000,aborted.signal);aborted.abort();await assert.rejects(sleeping,e=>e.name==='AbortError');
  // Strict age limit remains strict for finished as well as partial territories.
  for(const stateName of ['finished','partial'])assert.throws(()=>adaptResults({results:secondResults.map((r,i)=>i===1?{...r,state:stateName,generatedAt:'25/10/2026 19:00:00'}:r),baseline,asOf:'2026-10-25T20:01:00-03:00',policy,config:LIVE_CONFIG}));
  const valid={...futureEvaluation,publishedAt:'2026-10-14',reviewedAt:'2026-10-14'};
  const permission={enabled:true,evaluation:valid,asOf:'2026-10-25T20:00:00-03:00',year:2026,modelVersion:MODEL_CONFIG.version,dataVersion:'new-snapshot',parametersHash:'test'};
  assert.equal(probabilityPermission(permission).publicProbabilityEnabled,true);
  assert.equal(probabilityPermission({...permission,mode:'live'}).publicProbabilityEnabled,false);
  assert.equal(probabilityPermission({...permission,baselineHash:'changed'}).publicProbabilityEnabled,false);
  const previous={...ready,mode:'live',modelVersion:LIVE_CONFIG.version,state:'ready',operationalHashes:{baseline:'same',policy:'same',frozenPre:'same',candidates:'same',context:'same'},estimate:{...ready.estimate,probabilityA:.7,probabilityB:.3,probabilityTie:0}};
  const base={...previous,asOf:'2026-10-25T20:00:00-03:00'};
  const fallback=buildLiveForecast({base,data:{...request.data,evaluation:null},baseline:null,snapshot:null,preConfig:MODEL_CONFIG,enabled:true,probabilityEnabled:true},previous);
  assert.equal(fallback.state,'stale');assert.equal(fallback.estimate.probabilityA,null);assert.equal(fallback.computedAt,previous.computedAt);assert.equal(fallback.dataVersion,previous.dataVersion);
  await atomicJson(path.join(output,'evaluation.json'),{schemaVersion:'2',pre:valid,live:null});assert.equal((await readEvaluation(reader,null,'pre')).id,valid.id);assert.equal(await readEvaluation(reader,null,'live'),null);
  await atomicJson(path.join(output,'evaluation.json'),null);assert.equal(await readEvaluation(reader,valid,'pre'),null,'revocation must not use static fallback');
  // Complete test-only inputs may promote; incomplete/old/withheld replacements may not.
  const policyFile=path.join(dir,'policy.json'),baselineFile=path.join(dir,'verified-baseline.json'),frozenFile=path.join(dir,'frozen.json');
  await atomicJson(policyFile,policy);await atomicJson(baselineFile,baseline);await atomicJson(frozenFile,frozen);
  const fullOutput=path.join(dir,'complete-product');sourceHour='17:00:00';state='partial';
  const fullCollector=await createOfficialCollector(load,{output:fullOutput,history,download,now:()=>time,sleep:async()=>{},policy:policyFile,baseline:baselineFile,frozenPre:frozenFile});
  await fullCollector();const full=await readBundle(new LocalSnapshotReader(fullOutput));assert.equal(full.statistical.snapshot.files.length,29);assert.equal(full.statisticalBlock,null);
  const {createForecastRuntime}=await load('forecast-server/production-runtime');
  const runtime=createForecastRuntime(),runtimeRequest={mode:'live',asOf:new Date(time).toISOString(),now:time,historical:false,cutoffs:[]};
  const inputs={polls:[poll],candidates,contest,evaluation:null,product:full.statistical,block:''};
  const flags={preEnabled:true,liveEnabled:true,publicProbabilityEnabled:false};
  const live=await runtime(runtimeRequest,inputs,flags);assert.equal(live.state,'ready');assert.equal(live.estimate.probabilityA,null);
  const nextProduct=structuredClone(full.statistical);nextProduct.snapshot.files[0].raw.hg='17:00:01';
  const newSnapshot=await runtime(runtimeRequest,{...inputs,product:nextProduct},flags);assert.notEqual(newSnapshot.dataVersion,live.dataVersion);assert.equal(newSnapshot.parametersHash,live.parametersHash);
  const authorizedLive={...valid,mode:'live',modelVersion:LIVE_CONFIG.version,parametersHash:live.parametersHash,dependencies:{baselineHash:live.operationalHashes.baseline,policyHash:live.operationalHashes.policy}};
  const allowed=await runtime(runtimeRequest,{...inputs,evaluation:authorizedLive},{...flags,publicProbabilityEnabled:true});assert.equal(allowed.publicProbabilityEnabled,true);
  const changed=await runtime(runtimeRequest,{...inputs,product:nextProduct,evaluation:authorizedLive},{...flags,publicProbabilityEnabled:true});assert.equal(changed.publicProbabilityEnabled,true);assert.notEqual(changed.dataVersion,allowed.dataVersion);
  const changedParameters=structuredClone(full.statistical);changedParameters.frozenPre.parameters.designEffect+=.1;
  const invalidated=await runtime(runtimeRequest,{...inputs,product:changedParameters,evaluation:authorizedLive},{...flags,publicProbabilityEnabled:true});assert.equal(invalidated.publicProbabilityEnabled,false);
  const officiallyClosed=await runtime(runtimeRequest,{...inputs,evaluation:authorizedLive,officialFinished:true},{...flags,publicProbabilityEnabled:true});assert.equal(officiallyClosed.estimate,null);assert.equal(officiallyClosed.publicProbabilityEnabled,false,'national official closure blocks prospective probabilities even if territorial snapshot lags');
  const badSnapshot=structuredClone(full.statistical);badSnapshot.snapshot.files.pop();
  const revoked=await runtime({...runtimeRequest,now:time+1000},{...inputs,product:badSnapshot,evaluation:null},{...flags,publicProbabilityEnabled:true});assert.equal(revoked.state,'stale');assert.equal(revoked.estimate.probabilityA,null);assert.equal(revoked.dataVersion,changed.dataVersion);
  ufFailure='zz';await fullCollector();const retained=await readBundle(new LocalSnapshotReader(fullOutput));assert.equal(retained.statistical.collectionId,full.statistical.collectionId);assert.match(retained.statisticalBlock,/28\/29/);ufFailure=null;
  for(const url of ['http://example.test','https://user:pass@example.test','https://example.test/?url=other'])assert.throws(()=>new HttpsSnapshotReader(url));
  console.log('Passed: continuous official ingestion; source-driven opening/UTC; absence, withholding, recovery, retries/cancellation/no overlap; immutable deduplication, dynamic atomic storage, no baseline dependency, operational identities and conservative evaluation revocation.');
}
