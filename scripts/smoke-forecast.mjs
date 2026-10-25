import assert from 'node:assert/strict';
import { args } from './forecast-cli.mjs';
const options=args(['url','evaluation-state']);
const evaluationState=options['evaluation-state']??'missing';
if(!['missing','invalid'].includes(evaluationState))throw new Error('Use --evaluation-state missing|invalid conforme o arquivo local.');
const base=options.url??'http://127.0.0.1:3000';
const url=new URL(base);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Smoke permitido somente no servidor local.');
for(const mode of ['pre','live']) {
  const start=performance.now();
  const response=await fetch(`${base}/api/forecast?mode=${mode}`,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const payload=await response.json();
  assert.ok(mode==='live'?payload.state==='disabled':['ready','no-data','insufficient-data','disabled'].includes(payload.state));
  assert.equal(payload.publicProbabilityEnabled,false);
  assert.ok(payload.probabilityBlocks.some(b=>b.code==='publication-disabled'));
  assert.ok(payload.probabilityBlocks.some(b=>b.code===`evaluation-${evaluationState}`));
  if(payload.estimate) { for(const key of ['probabilityA','probabilityB','probabilityTie']) assert.equal(payload.estimate[key],null); }
  if(payload.state!=='ready') assert.equal(response.headers.get('cache-control'),'no-store');
  console.log(mode,payload.state,`${(performance.now()-start).toFixed(1)}ms HTTP local`);
}
for(const query of ['mode=pre&url=https://example.test','mode=pre&simulations=100','mode=pre&mode=live','mode=pre&asOf=2099-01-01','mode=pre&from=2026-10-10','mode=pre&asOf=2026-02-30']) {
  const response=await fetch(`${base}/api/forecast?${query}`);assert.equal(response.status,400);assert.equal(response.headers.get('cache-control'),'no-store');
}
for(const query of ['uf=rs&office=5&round=2','uf=br&office=1&round=3','uf=ac&office=1&municipality=1120&round=2']) {
  assert.equal((await fetch(`${base}/api/results?${query}`)).status,400);
}
for(const [route,text] of [['/projecao','Projeção estatística — não é resultado oficial'],['/projecao/metodologia','Metodologia'],['/','Turno da apuração']]) {
  const response=await fetch(base+route);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes(text),route);assert.ok(html.includes('lang="pt-BR"'));
}
for(const round of ['1','2']) {
  const response=await fetch(`${base}/?round=${round}`,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200);
  const html=await response.text();
  assert.equal(html.match(/<option value="([12])" selected=""/)?.[1],round,'explicit round selected in server HTML');
}
console.log('Passed: local API current/disabled, blocked null probabilities with reasons, strict parameters, round guards and HTML navigation/methodology. Browser interactions not covered.');
