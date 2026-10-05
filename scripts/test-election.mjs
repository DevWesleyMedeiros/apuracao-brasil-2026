import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Compile the actual domain modules; no extra test runner or network required.
const dir=fs.mkdtempSync(path.join(process.cwd(),'.election-tests-'));
try {
  for(const name of ['catalog','election','tse','chart-data','deadline','result-client','regional','municipal']) {
    const source=fs.readFileSync(`lib/${name}.ts`,'utf8');
    const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replaceAll("'./catalog'","'./catalog.mjs'").replaceAll("'./election'","'./election.mjs'").replaceAll("'./deadline'","'./deadline.mjs'").replaceAll("'./regional'","'./regional.mjs'").replaceAll("'./municipal'","'./municipal.mjs'");
    fs.writeFileSync(path.join(dir,`${name}.mjs`),output);
  }
  const {normalizeResult,resolveElection,resultUrl,querySelection,candidatePhotoUrl}=await import(pathToFileURL(path.join(dir,'election.mjs')));
  const {REGIONS,statesInRegion,selectRegionUf}=await import(pathToFileURL(path.join(dir,'catalog.mjs')));
  const allRegionalStates=REGIONS.flatMap(region=>statesInRegion(region.code).map(([uf])=>uf));
  assert.equal(allRegionalStates.length,27);assert.equal(new Set(allRegionalStates).size,27,'each UF must belong to exactly one region');
  assert.deepEqual(statesInRegion('sul').map(([uf])=>uf),['pr','rs','sc']);
  assert.equal(statesInRegion('nordeste').length,9);assert.equal(statesInRegion('norte').length,7);
  assert.equal(statesInRegion('sudeste').length,4);assert.equal(statesInRegion('centro-oeste').length,4);
  assert.equal(statesInRegion('all').length,27);assert.equal(selectRegionUf('sul','rs'),'rs');
  assert.equal(selectRegionUf('centro-oeste','rs'),'df');assert.equal(selectRegionUf('all','rs'),'rs');
  assert.equal(candidatePhotoUrl('zz','1','6257','280000000001'),'https://resultados.tse.jus.br/oficial/ele2026/6257/fotos/br/280000000001.jpeg');
  assert.equal(candidatePhotoUrl('rs','1','6257','280000000001'),candidatePhotoUrl('br','1','6257','280000000001'));
  assert.equal(candidatePhotoUrl('rs','3','6259','210000000001'),'https://resultados.tse.jus.br/oficial/ele2026/6259/fotos/rs/210000000001.jpeg');
  assert.equal(candidatePhotoUrl('br','1','6257','../other'),null);
  assert.equal(candidatePhotoUrl('zz','3','6259','1'),null);
  // Synthetic test fixture. Never imported by the application.
  const config={f:'o',pl:[{c:'ele2026',dt:'04/10/2026',e:[{cd:'6257',t:'1',abr:[{cp:[{cd:'1'}]}]},{cd:'6259',t:'1',abr:[{cp:[{cd:'3'},{cd:'5'},{cd:'6'},{cd:'7'},{cd:'8'}]}]}]}]};
  const raw={ele:'6257',t:'1',f:'o',cdabr:'br',tpabr:'br',dg:'04/10/2026',hg:'17:15:00',dt:'04/10/2026',ht:'17:14:00',dv:'s',tf:'n',and:'p',carg:[{cd:'1',nmn:'Presidente',nv:'1',agr:[{par:[{sg:'TESTE',cand:[{n:'99',sqcand:'test',nmu:'CANDIDATO DE TESTE',nm:'CANDIDATO DE TESTE',vap:'1234',pvap:'43,21',st:'',e:'n'}]}]}]}],s:{ts:'100',st:'50',pst:'50,00'},v:{vv:'3000',vb:'100',tvn:'50'}};
  const normalized=normalizeResult(raw,'br','1','6257','https://example.test');
  assert.equal(normalized.candidates[0].percent,43.21);
  assert.equal(normalized.votes.legend,null);
  assert.equal(normalized.state,'partial');
  const {normalizeMunicipalities,municipalityConfigUrl,validateMunicipalityFilter,InvalidMunicipalityError}=await import(pathToFileURL(path.join(dir,'municipal.mjs')));
  const municipalConfig={f:'o',abr:[{cd:'ac',mu:[{cd:'01120',nm:'ACRELÂNDIA'},{cd:'01570',nm:'ASSIS BRASIL'}]},{cd:'rs',mu:[{cd:'88633',nm:'SÃO BORJA'}]},{cd:'df',mu:[{cd:'97012',nm:'BRASÍLIA'}]}]};
  assert.equal(normalizeMunicipalities(municipalConfig,'ac')[0].code,'01120');
  assert.equal(normalizeMunicipalities(municipalConfig,'df')[0].name,'BRASÍLIA');
  assert.equal(normalizeMunicipalities(municipalConfig,'rs').length,1);
  assert.throws(()=>normalizeMunicipalities({...municipalConfig,f:'s'},'rs'));
  assert.throws(()=>normalizeMunicipalities(municipalConfig,'zz'));
  assert.throws(()=>validateMunicipalityFilter('br','01120'));
  assert.throws(()=>validateMunicipalityFilter('ac','1120'));
  assert.equal(municipalityConfigUrl('6257'),'https://resultados.tse.jus.br/oficial/ele2026/6257/config/mun-e006257-cm.json');
  assert.equal(resultUrl('ac','5','6259','01120'),'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/ac/ac01120-c0005-e006259-u.json');
  const city={code:'01120',name:'ACRELÂNDIA'};
  const municipalRaw={...raw,cdabr:'01120',tpabr:'mu',and:'f',tf:'n'};
  const municipalResult=normalizeResult(municipalRaw,'ac','1','6257','https://example.test/city',city);
  assert.equal(municipalResult.municipality.code,'01120');assert.equal(municipalResult.uf,'ac');assert.equal(municipalResult.state,'finished');
  assert.throws(()=>normalizeResult(municipalRaw,'ac','1','6257','x'));
  assert.throws(()=>normalizeResult(raw,'ac','1','6257','x',city));
  assert.throws(()=>normalizeResult({...municipalRaw,cdabr:'01570'},'ac','1','6257','x',city));

  const {aggregateRegion}=await import(pathToFileURL(path.join(dir,'regional.mjs')));
  const stateResults=['pr','rs','sc'].map((uf,i)=>({...normalized,uf,sourceUrl:`https://example.test/${uf}`,votes:{valid:(i+1)*100,blank:2,null:3,legend:null},sections:{total:(i+1)*10,count:5,percent:50},candidates:[{...normalized.candidates[0],votes:(i+1)*50,percent:50,status:'Eleito',elected:true}]}));
  const south=aggregateRegion('sul',stateResults);
  assert.equal(south.votes.valid,600);assert.equal(south.votes.blank,6);assert.equal(south.votes.null,9);
  assert.equal(south.candidates[0].votes,300);assert.equal(south.candidates[0].percent,50);
  assert.equal(south.sections.total,60);assert.equal(south.sections.count,15);assert.equal(south.sections.percent,25,'use section totals, not average UF percentages');
  assert.equal(south.candidates[0].elected,false);assert.equal(south.candidates[0].status,'');assert.equal(south.sources.length,3);
  assert.throws(()=>aggregateRegion('sul',stateResults.slice(0,2)));
  assert.throws(()=>aggregateRegion('sul',[stateResults[0],stateResults[1],{...stateResults[2],uf:'zz'}]));
  assert.throws(()=>aggregateRegion('sul',stateResults.map((r,i)=>i===2?{...r,election:'999'}:r)));
  assert.throws(()=>aggregateRegion('sul',stateResults.map((r,i)=>i===2?{...r,candidates:[]}:r)));
  assert.equal(aggregateRegion('sul',stateResults.map(r=>({...r,state:'finished'}))).state,'finished');
  assert.equal(aggregateRegion('sul',stateResults.map(r=>({...r,state:'waiting',votes:{valid:0,blank:0,null:0,legend:null},candidates:r.candidates.map(c=>({...c,votes:0}))}))).candidates[0].percent,0);
  const withheld=aggregateRegion('sul',stateResults.map((r,i)=>i===2?{...r,state:'withheld'}:r));
  assert.equal(withheld.state,'withheld');assert.equal(withheld.candidates[0].votes,null);assert.equal(withheld.votes.valid,0);

  assert.equal(normalizeResult({...raw,and:'n'},'br','1','6257','x').state,'waiting');
  assert.equal(normalizeResult({...raw,tf:'s'},'br','1','6257','x').state,'finished');
  assert.equal(normalizeResult({...raw,dv:'n'},'br','1','6257','x').candidates[0].votes,null);
  assert.throws(()=>normalizeResult({...raw,f:'s'},'br','1','6257','x'));
  assert.throws(()=>normalizeResult(raw,'zz','1','6257','x'));
  assert.throws(()=>normalizeResult({...raw,s:{...raw.s,st:'NaN'}},'br','1','6257','x'));
  assert.throws(()=>querySelection('zz','5'));
  assert.throws(()=>querySelection('../foo','1'));
  assert.throws(()=>querySelection('rs','8'));
  assert.deepEqual(querySelection('df','7'),{uf:'df',office:'8'});
  assert.equal(resolveElection(config,'6'),'6259');
  assert.equal(resultUrl('zz','1','6257'),'https://resultados.tse.jus.br/oficial/ele2026/6257/dados/zz/zz-c0001-e006257-u.json');
  assert.throws(()=>resolveElection({...config,f:'s'},'1'));
  const {electionChartData}=await import(pathToFileURL(path.join(dir,'chart-data.mjs')));
  assert.equal(electionChartData(withheld),null);
  assert.equal(electionChartData(south).candidates[0].votes,300);
  const graphs=electionChartData(normalized);
  assert.equal(graphs.compositionTotal,3150,'valid, blank, null must not count legend twice');
  assert.equal(graphs.sections.reduce((sum,part)=>sum+part.value,0),100);
  assert.equal(electionChartData({...normalized,state:'withheld'}),null);
  const empty=electionChartData({...normalized,state:'waiting',candidates:[],votes:{valid:0,blank:0,null:0,legend:0}});
  assert.equal(empty.compositionTotal,0);assert.equal(empty.candidates.length,0);
  const many={...normalized,candidates:Array.from({length:9},(_,i)=>({...normalized.candidates[0],id:String(i),votes:i*100}))};
  const top=electionChartData(many).candidates;
  assert.equal(top.length,6);assert.equal(top[0].votes,800);assert.equal(top[5].votes,300);
  const {getResult}=await import(pathToFileURL(path.join(dir,'tse.mjs')));
  const originalFetch=globalThis.fetch,originalNow=Date.now;
  let calls=0,time=originalNow(),mode='ok',conditional=false;
  Date.now=()=>time;
  globalThis.fetch=async (url,options)=>{
    calls++;await Promise.resolve();
    if(String(url).includes('ele-c.json'))return Response.json(config);
    if(mode==='offline')throw new Error('offline');
    if(mode==='304'){conditional=options.headers['If-None-Match']==='fixture-v1';return new Response(null,{status:304});}
    return Response.json(raw,{headers:{etag:'fixture-v1'}});
  };
  try {
    const results=await Promise.all([getResult('br','1'),getResult('br','1')]);
    assert.equal(calls,4,'concurrent requests must use independent I/O');
    assert.equal(results[1].candidates[0].votes,1234);
    time+=31000;mode='304';await getResult('br','1');assert.equal(conditional,true);
    time+=31000;mode='offline';const stale=await getResult('br','1');assert.equal(stale.stale,true);assert.equal(stale.candidates[0].votes,1234);
    const count=calls;await getResult('br','1');assert.equal(calls,count,'backoff must suppress retry');
    time+=61000;mode='ok';assert.equal((await getResult('br','1')).stale,undefined,'must recover after failure');
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
  const {getRegionResult}=await import(pathToFileURL(path.join(dir,'tse.mjs'))+'?regional');
  const regionFetch=globalThis.fetch,regionNow=Date.now;
  let regionalTime=regionNow(),failedUf='',regionCalls=0;
  Date.now=()=>regionalTime;
  globalThis.fetch=async url=>{
    regionCalls++;
    if(String(url).includes('ele-c.json')) return Response.json(config);
    const uf=String(url).split('/dados/')[1].split('/')[0];
    if(uf===failedUf) throw new Error('UF unavailable');
    return Response.json({...raw,cdabr:uf,tpabr:'uf'});
  };
  try {
    const northeast=await getRegionResult('nordeste');
    assert.equal(northeast.sources.length,9);assert.equal(northeast.votes.valid,27000);assert.equal(regionCalls,10,'all nine UFs must load without local rate-limit rejection');
    const previous=await getRegionResult('sul');assert.equal(previous.sources.length,3);
    regionalTime+=31000;failedUf='rs';
    const fallback=await getRegionResult('sul');assert.equal(fallback.stale,true);assert.equal(fallback.votes.valid,previous.votes.valid);
    await assert.rejects(getRegionResult('invalid'));
    regionalTime+=61000;failedUf='';assert.equal((await getRegionResult('sul')).stale,undefined);
  } finally {globalThis.fetch=regionFetch;Date.now=regionNow;}
  const {getMunicipalities,getResult:getCityResult}=await import(pathToFileURL(path.join(dir,'tse.mjs'))+'?municipal');
  const cityFetch=globalThis.fetch;
  let municipalCalls=0;
  globalThis.fetch=async url=>{
    municipalCalls++;
    if(String(url).includes('ele-c.json')) return Response.json(config);
    if(String(url).includes('-cm.json')) return Response.json(municipalConfig);
    if(String(url).includes('ac01120-'))return Response.json(municipalRaw);
    return Response.json({...raw,cdabr:'ac',tpabr:'uf'});
  };
  try {
    assert.equal((await getMunicipalities('ac')).municipalities[0].code,'01120');
    const cityResult=await getCityResult('ac','1',undefined,'01120');assert.equal(cityResult.municipality.name,'ACRELÂNDIA');
    assert.equal((await getCityResult('ac','1')).municipality,undefined,'municipal cache must not replace state cache');
    const countBefore=municipalCalls;
    await assert.rejects(getCityResult('rs','1',undefined,'01120'),InvalidMunicipalityError);
    assert.equal(municipalCalls,countBefore,'wrong-UF code must not fetch a non-existent result');
  } finally {globalThis.fetch=cityFetch;}
  const {withDeadline,RequestTimeoutError}=await import(pathToFileURL(path.join(dir,'deadline.mjs')));
  const {loadElectionResult,loadMunicipalities}=await import(pathToFileURL(path.join(dir,'result-client.mjs')));
  await assert.rejects(withDeadline(()=>new Promise(()=>{}),15),RequestTimeoutError,'even a transport ignoring abort must end');
  const canceled=new AbortController();canceled.abort();
  await assert.rejects(withDeadline(()=>new Promise(()=>{}),500,canceled.signal),e=>e.name==='AbortError');
  const savedFetch=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Promise(()=>{});
    await assert.rejects(loadElectionResult('br','1',new AbortController().signal,15),RequestTimeoutError);
    globalThis.fetch=async()=>({ok:true,headers:new Headers({'content-type':'application/json'}),json:()=>new Promise(()=>{})});
    await assert.rejects(loadElectionResult('br','1',new AbortController().signal,15),RequestTimeoutError,'response body must share the deadline');
    let requestedUrl='';
    globalThis.fetch=async url=>{requestedUrl=String(url);return Response.json(normalized);};
    await loadElectionResult('br','1',new AbortController().signal,100,'sul');
    assert.equal(requestedUrl,'/api/results?uf=br&office=1&region=sul');
    await loadElectionResult('ac','1',new AbortController().signal,100,undefined,'01120');
    assert.equal(requestedUrl,'/api/results?uf=ac&office=1&municipality=01120');
    globalThis.fetch=async()=>Response.json({uf:'ac',election:'6257',sourceUrl:'x',municipalities:[city]});
    assert.equal((await loadMunicipalities('ac',new AbortController().signal,100)).municipalities[0].code,'01120');
    await assert.rejects(loadMunicipalities('rs',new AbortController().signal,100),'list from previous UF must be rejected');
    globalThis.fetch=async()=>new Promise(()=>{});
    await assert.rejects(loadMunicipalities('ac',new AbortController().signal,15),RequestTimeoutError);
    globalThis.fetch=async()=>Response.json(normalized);

    assert.equal((await loadElectionResult('br','1',new AbortController().signal,100)).candidates[0].votes,1234,'must recover after timeout');
    const during=new AbortController();
    globalThis.fetch=async()=>new Promise(()=>{});
    const request=loadElectionResult('br','1',during.signal,1000);during.abort();
    await assert.rejects(request,e=>e.name==='AbortError');
    // A canceled Worker request cannot leave a shared pending config fetch.
    const {getResult:independent}=await import(pathToFileURL(path.join(dir,'tse.mjs'))+'?isolation');
    let isolationCalls=0;
    globalThis.fetch=async(url)=>{
      isolationCalls++;
      if(isolationCalls===1)return new Promise(()=>{});
      return Response.json(String(url).includes('ele-c.json')?config:raw);
    };
    const firstController=new AbortController();
    const first=independent('br','1',firstController.signal);
    const firstRejected=assert.rejects(first,e=>e.name==='AbortError');
    while(isolationCalls===0) await new Promise(resolve=>setTimeout(resolve,5));
    firstController.abort();await firstRejected;
    assert.equal((await independent('br','1')).candidates[0].votes,1234);
  } finally {globalThis.fetch=savedFetch;}
  console.log('Passed: municipal lists, leading zeros, territory validation, city completion, cache separation, city client deadlines, complete regional aggregation, weighted percentages, incomplete/hidden guards, regional charts, five-region UF coverage, region transitions, presidential/state photo paths and guards, chart categories, empty/hidden charts, top-six sorting, section totals, parsing, official/turn/territory guards, DF, URL formatting, hidden votes, request isolation, client/server deadlines, hung body, cancellation, ETag, stale data, backoff and recovery.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
