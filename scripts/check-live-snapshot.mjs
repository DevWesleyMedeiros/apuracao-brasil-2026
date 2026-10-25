// Explicit local engine check. Never enables a route or public probabilities.
import { args, withDomain } from './forecast-cli.mjs';
try {
  const options=args(['data-dir']);
  await withDomain(async load=>{
    const {LocalSnapshotReader}=await load('forecast-server/storage-node');
    const {readBundle}=await load('forecast-server/storage');
    const {createForecastRuntime}=await load('forecast-server/production-runtime');
    const bundle=await readBundle(new LocalSnapshotReader(options['data-dir']??'data/forecast'));
    if(!bundle.statistical)throw new Error(bundle.statisticalBlock??'Conjunto estatístico ausente.');
    const product=bundle.statistical,now=Date.now();
    const result=await createForecastRuntime()({mode:'live',asOf:new Date(now).toISOString(),now,historical:false,cutoffs:[]},{product,polls:[],candidates:product.frozenPre.candidates,contest:product.frozenPre.contest,evaluation:null,block:''},{preEnabled:true,liveEnabled:true,publicProbabilityEnabled:false});
    console.log(JSON.stringify(result,null,2));
    if(!['ready','finished'].includes(result.state))process.exitCode=1;
  });
}catch(error){console.error(error.message);process.exitCode=1;}
