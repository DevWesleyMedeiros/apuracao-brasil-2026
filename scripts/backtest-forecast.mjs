import { args, withDomain, readJson, atomicJson } from './forecast-cli.mjs';
try {
  const options = args(['input','output']);
  if (!options.input || !options.output) throw new Error('Uso: node scripts/backtest-forecast.mjs --input DATASET.json --output RELATORIO.json');
  await withDomain(async load => {
    const { evaluate } = await load('forecast/evaluate');
    const { sha256, TRANSFORMATION_VERSION } = await load('forecast/identity');
    const start = performance.now();
    const dataset=await readJson(options.input),report=evaluate(dataset);
    const artifact={schemaVersion:'2',historicalDatasetHash:await sha256(dataset),protocol:'independent-election-holdout-v1',transformationVersion:TRANSFORMATION_VERSION,
      parameters:await Promise.all(dataset.elections.map(async e=>({mode:'pre',modelVersion:e.parameters.version,parametersHash:await sha256({mode:'pre',pre:e.parameters,transformation:TRANSFORMATION_VERSION})}))),report};
    await atomicJson(options.output,artifact);
    console.log('Relatório salvo:',options.output,report.operationalStatus,'dataset:',artifact.historicalDatasetHash,'reportHash:',await sha256(artifact),'elapsedMs:',performance.now()-start);
  });
} catch (error) { console.error(error.message); process.exitCode=1; }
