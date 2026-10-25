import path from 'node:path';
import { args, withDomain, readJson, atomicJson } from './forecast-cli.mjs';
try {
  const options=args(['output','as-of']);
  if(!options.output)throw new Error('Use --output /CAMINHO/frozen-pre.json [--as-of CORTE_ISO].');
  const capturedAt=new Date().toISOString(),asOf=options['as-of']??capturedAt;
  await withDomain(async load=>{
    const {frozenPreSchema}=await load('forecast-server/artifacts');
    const {MODEL_CONFIG}=await load('forecast/config');
    const {selectPolls}=await load('forecast/eligibility');
    const {timestamp}=await load('forecast/types');
    const {sha256}=await load('forecast/identity');
    const polls=await readJson('data/forecast/polls.json'),contest=await readJson('data/forecast/contest.json'),candidates=await readJson('data/forecast/candidates.json');
    const selected=selectPolls(polls,contest,asOf).polls.filter(p=>timestamp(p.accessedAt)<=timestamp(capturedAt));
    const frozen=frozenPreSchema.parse({schemaVersion:'1',capturedAt,asOf,polls:selected,candidates,contest,parameters:MODEL_CONFIG});
    // Archive ALL original polls, separately from the eligible frozen inputs.
    const id=await sha256({frozen,originalPolls:polls});
    await atomicJson(path.join(path.dirname(options.output),'pre-archives',`${id}.json`),{schemaVersion:'1',frozen,originalPolls:polls});
    await atomicJson(options.output,frozen);
    console.info('Pré congelado:',options.output,asOf,'pesquisas elegíveis:',selected.length,'arquivo:',id);
  });
} catch(error) {console.error(error.message);process.exitCode=1;}
