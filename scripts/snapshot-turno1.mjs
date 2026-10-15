import { args, withDomain, collectArchived, readJson, atomicJson, retryDownload, archive } from './forecast-cli.mjs';

try {
  const options = args(['output','election','policy','mapping','baseline']);
  if (!options.output || !options.policy || (!!options.mapping !== !!options.baseline)) throw new Error('Uso: node scripts/snapshot-turno1.mjs --output DIRETORIO --policy POLITICA.json [--election CODIGO] [--mapping FINALISTAS.json --baseline BASELINE.json]');
  await withDomain(async load => {
    const { reconcileSnapshot, createBaseline, validateFinalists } = await load('forecast/snapshot');
    const policy = await readJson(options.policy);
    let snapshot, archived;
    for (let attempt=0;attempt<2;attempt++) {
      ({snapshot,archived}=await collectArchived(load,{round:'1',election:options.election},options.output));
      try { reconcileSnapshot(snapshot.results,policy); break; }
      catch (error) { if (attempt===1) throw error; await new Promise(resolve=>setTimeout(resolve,30000)); }
    }
    if (options.mapping) {
      const input = await readJson(options.mapping);
      // Validate the target election independently: no implicit 6258 fallback.
      const { resolveElection, resultUrl, normalizeResult } = await load('election');
      if (resolveElection(snapshot.files[0].data,'1',{round:'2'}) !== input.target.election) throw new Error('Eleição alvo não verificada.');
      const { downloadTseFile }=await load('tse');
      const secondFile=await retryDownload(downloadTseFile,resultUrl('br','1',input.target.election));
      const second=normalizeResult(secondFile.data,'br','1',input.target.election,secondFile.url,undefined,{round:'2'});
      validateFinalists(second,input.target);
      // Preserve the separate identity evidence before promoting any model baseline.
      const identity=await archive(options.output,{election:second.election,round:'2',results:[second],files:[snapshot.files[0],secondFile]});
      const baseline = createBaseline(snapshot.results,{...input,sourceHash:archived.hash,targetEvidenceHash:identity.hash},policy);
      await atomicJson(options.baseline,baseline);
      console.log('Baseline validado promovido:',options.baseline);
    } else console.log('Snapshot arquivado; baseline não solicitado:',archived.directory);
  });
} catch (error) { console.error(error.message); process.exitCode=1; }
