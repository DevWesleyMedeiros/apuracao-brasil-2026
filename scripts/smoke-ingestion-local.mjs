// Synthetic fixtures ONLY in an isolated temporary directory/server. Never
// write fixtures to data/forecast, and never contact the TSE from this smoke.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { args, atomicJson, withDomain } from './forecast-cli.mjs';

const options=args(['port']),port=Number(options.port??3012);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Porta local inválida.');
const directory=await fs.mkdtemp('/tmp/opencode/forecast-http-');
let server;
try {
  await withDomain(async load=>{
    const {officialSnapshotSchema,DISCLOSURE_AT}=await load('forecast-server/artifacts');
    const {normalizeIngestedResult,sourceTimestamp}=await load('forecast-server/tse-adapter');
    const {sha256}=await load('forecast/identity');
    const {resultUrl}=await load('election');
    const election='999999',config={f:'o',pl:[{c:'ele2026',dt:'25/10/2026',e:[{cd:election,t:'2',abr:[{cp:[{cd:'1'}]}]}]}]};
    const sourceUrl=resultUrl('br','1',election),instant=new Date().toISOString();
    const saoPaulo=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date());
    const [dg,hg]=saoPaulo.split(', ');
    async function publish(state,invalidStatistics=false) {
      const raw={ele:election,t:'2',f:'o',cdabr:'br',tpabr:'br',dg,hg,dt:dg,ht:hg,dv:state==='withheld'?'n':'s',tf:state==='finished'?'s':'n',and:state==='waiting'?'n':state==='finished'?'f':'p',carg:[{cd:'1',nmn:'Presidente',nv:'1',agr:[{par:[{sg:'FIXTURE',cand:[{n:'99',sqcand:'test-only',nmu:'FIXTURE EXCLUSIVA DE TESTE',nm:'TEST',vap:state==='waiting'?'0':'10',pvap:'100',st:'',e:'n'}]}]}]}],s:{ts:'10',st:state==='waiting'?'0':state==='finished'?'10':'5',pst:state==='waiting'?'0':state==='finished'?'100':'50'},v:{vv:state==='waiting'?'0':'10',vb:'0',tvn:'0'}};
      const result={...normalizeIngestedResult(raw,'br',election,sourceUrl),checkedAt:instant};
      const official=officialSnapshotSchema.parse({schemaVersion:'1',collectionId:await sha256(raw),disclosureExpectedAt:DISCLOSURE_AT,context:{cycle:'ele2026',year:2026,phase:'o',round:'2',office:'1',territory:'br',election},sourceUrl,fetchedAt:instant,lastAttemptAt:instant,sourceUpdatedAt:new Date(sourceTimestamp(result.generatedAt)).toISOString(),contentHash:await sha256(raw),state,stale:false,diagnostic:null,config,raw,result});
      const bundle={schemaVersion:'1',official,statistical:invalidStatistics?{baseline:'invalid-test-only'}:null,statisticalBlock:'Test-only: baseline absent.'},version=await sha256(bundle);
      await atomicJson(path.join(directory,'versions',`${version}.json`),bundle);
      await atomicJson(path.join(directory,'current.json'),{schemaVersion:'1',version});
      return version;
    }
    await publish('waiting');
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,FORECAST_STORAGE:'local',FORECAST_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
    let output='';server.stdout.on('data',chunk=>{output+=chunk;});server.stderr.on('data',chunk=>{output+=chunk;});
    const endpoint=`http://127.0.0.1:${port}/api/results?uf=br&office=1&round=2`;
    let response;
    for(let attempt=0;attempt<30;attempt++) {
      if(server.exitCode!==null)throw new Error(`Servidor de teste encerrou: ${output}`);
      try {response=await fetch(endpoint,{signal:AbortSignal.timeout(2000)});break;}catch{await pause(300);}
    }
    assert.ok(response,'servidor local iniciou');assert.equal((await response.json()).state,'waiting');
    const pid=server.pid;
    for(const state of ['partial','withheld','finished']) {
      await publish(state);const response=await fetch(endpoint);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const result=await response.json();assert.equal(result.state,state);if(state==='withheld')assert.equal(result.candidates[0].votes,null);
      assert.equal(server.pid,pid,'files must update the API without restart/rebuild');
    }
    await publish('partial',true);assert.equal((await (await fetch(endpoint)).json()).state,'partial','invalid statistical baseline must not block official API');
    await atomicJson(path.join(directory,'current.json'),{schemaVersion:'1',version:'0'.repeat(64)});
    const failed=await fetch(endpoint);assert.equal(failed.status,503);assert.equal(failed.headers.get('cache-control'),'no-store');
    await publish('partial');assert.equal((await (await fetch(endpoint)).json()).state,'partial');
    console.log('Passed HTTP fixtures: waiting/partial/withheld/finished, corrupt pointer failure and recovery, no baseline, dynamic files without rebuild/restart; test server only, not browser coverage.');
  });
} finally {
  if(server && server.exitCode===null) {const exited=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await exited;}
  await fs.rm(directory,{recursive:true,force:true});
}
