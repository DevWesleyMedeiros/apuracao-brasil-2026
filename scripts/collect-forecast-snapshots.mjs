import { args, withDomain } from './forecast-cli.mjs';
import { createOfficialCollector, runContinuous } from './official-collector.mjs';

const controller=new AbortController();
const stop=()=>controller.abort(new DOMException('Coleta interrompida.','AbortError'));
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try {
  const options=args(['output','history','baseline','policy','frozen-pre','interval-seconds','mode']);
  const interval=Number(options['interval-seconds']??60),mode=options.mode??'once';
  if(!Number.isInteger(interval)||interval<60||interval>86400||!['once','continuous'].includes(mode))throw new Error('Use --mode once|continuous e --interval-seconds 60..86400.');
  await withDomain(async load=>{
    const round=await createOfficialCollector(load,{output:options.output??'data/forecast',history:options.history??'.forecast-operation',baseline:options.baseline,policy:options.policy,frozenPre:options['frozen-pre'],signal:controller.signal});
    await runContinuous(round,{intervalMs:interval*1000,signal:controller.signal,once:mode==='once',onError:error=>console.warn('[collector] rodada falhou:',error.message)});
  });
} catch(error) {if(!controller.signal.aborted){console.error(error.message);process.exitCode=1;}}
finally {process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
