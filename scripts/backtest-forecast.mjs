import { args, withDomain, readJson, atomicJson } from './forecast-cli.mjs';
try {
  const options = args(['input','output']);
  if (!options.input || !options.output) throw new Error('Uso: node scripts/backtest-forecast.mjs --input DATASET.json --output RELATORIO.json');
  await withDomain(async load => {
    const { evaluate } = await load('forecast/evaluate');
    const start = performance.now();
    const report = evaluate(await readJson(options.input));
    await atomicJson(options.output,{...report,elapsedMs:performance.now()-start});
    console.log('Relatório salvo:',options.output,report.operationalStatus);
  });
} catch (error) { console.error(error.message); process.exitCode=1; }
