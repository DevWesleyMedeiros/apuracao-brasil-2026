import { args, withDomain, collectArchived, readJson, atomicJson } from './forecast-cli.mjs';
import path from 'node:path';
try {
  const options=args(['output','baseline','policy','interval-seconds','pre-as-of']);
  if(!options.output || !options.baseline || !options.policy) throw new Error('Uso: node scripts/collect-forecast-snapshots.mjs --output DIRETORIO --baseline BASELINE.json --policy POLITICA.json [--interval-seconds 60]');
  const interval=options['interval-seconds']===undefined?null:Number(options['interval-seconds']);
  if(interval!==null && (!Number.isInteger(interval) || interval<60 || interval>86400)) throw new Error('Intervalo deve ser de 60 a 86400 segundos.');
  const controller=new AbortController();
  const stop=()=>controller.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
  try {
    await withDomain(async load=>{
      const {baselineSchema}=await load('forecast/types');
      const {adaptResults}=await load('forecast-server/tse-adapter');
      const {LIVE_CONFIG}=await load('forecast/live');
      const baseline=baselineSchema.parse(await readJson(options.baseline)),policy=await readJson(options.policy);
      do {
        const {snapshot,archived}=await collectArchived(load,{round:'2',election:baseline.target.election,signal:controller.signal},options.output);
        adaptResults({results:snapshot.results,baseline,policy,asOf:new Date().toISOString(),config:LIVE_CONFIG});
        if(options['pre-as-of']) {
          const {liveSnapshotSchema}=await load('forecast-server/live-service');
          const latest=liveSnapshotSchema.parse({frozenPreAsOf:options['pre-as-of'],policy,files:snapshot.results.map((r,i)=>({uf:r.uf,url:r.sourceUrl,raw:snapshot.files[i+1].data}))});
          await atomicJson(path.join(options.output,'latest.json'),latest);
        }
        console.log('Snapshot imutável validado:',archived.directory);
        if(interval===null || controller.signal.aborted) break;
        await new Promise(resolve=>{const timer=setTimeout(done,interval*1000);function done(){clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();}controller.signal.addEventListener('abort',done,{once:true});});
      } while(!controller.signal.aborted);
    });
  } finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
} catch(error) { if(error.name!=='AbortError'){console.error(error.message);process.exitCode=1;} }
