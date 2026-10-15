import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { compileDomain } from './domain-loader.mjs';

export const hash = text => createHash('sha256').update(text).digest('hex');
export async function withDomain(run) {
  const dir = await fs.mkdtemp(path.join(process.cwd(), '.forecast-cli-'));
  try { return await run(compileDomain(dir)); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}
export function args(allowed) {
  const result = {};
  const argv = process.argv.slice(2);
  for (let i=0;i<argv.length;i+=2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!argv[i]?.startsWith('--') || !allowed.includes(key) || !argv[i+1] || argv[i+1].startsWith('--') || result[key]) throw new Error('Argumentos inválidos: ' + argv[i]);
    result[key] = argv[i+1];
  }
  return result;
}
export async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
export async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const dir = await fs.mkdtemp(path.join(path.dirname(file), '.promote-'));
  try { const temp = path.join(dir,'value.json'); await fs.writeFile(temp,JSON.stringify(value,null,2)); await fs.rename(temp,file); }
  finally { await fs.rm(dir,{recursive:true,force:true}); }
}
export async function retryDownload(download, url, signal) {
  for (let attempt=0; ; attempt++) {
    try { return await download(url, signal); }
    catch (error) {
      // Never retry 403/404. 429 suspends the run, with Retry-After preserved in the error.
      if (signal?.aborted || (error.status && error.status < 500) || attempt >= 2) throw error;
      await new Promise(resolve=>setTimeout(resolve,1000 * 2 ** attempt));
    }
  }
}
export async function collect(load, {round, election: override, signal}) {
  const { CONFIG_URL, resolveElection, resultUrl, normalizeResult, resultSchema } = await load('election');
  const { downloadTseFile } = await load('tse');
  const { TERRITORIES } = await load('forecast/snapshot');
  const config = await retryDownload(downloadTseFile, CONFIG_URL, signal);
  const election = resolveElection(config.data, '1', {round});
  if (override && override !== election) throw new Error('Override diverge da configuração oficial.');
  const files = [config], results = [];
  try {
  for (const uf of ['br', ...TERRITORIES]) {
    const file = await retryDownload(downloadTseFile, resultUrl(uf,'1',election), signal);
    files.push(file);
    const raw = resultSchema.parse(file.data);
    const result = normalizeResult(raw,uf,'1',election,file.url,undefined,{round});
    // Completion is never inferred from rounded pst.
    if (raw.tf === 's' && raw.and !== 'f') throw new Error('Marcadores oficiais de conclusão inconsistentes.');
    results.push(result);
  }
  return { files, results, election, round };
  } catch(error) { error.partialSnapshot={files,results,election,round}; throw error; }
}
export async function collectArchived(load, options, output) {
  try {const snapshot=await collect(load,options);return {snapshot,archived:await archive(output,snapshot)};}
  catch(error) {if(error.partialSnapshot) {const saved=await archive(output,error.partialSnapshot);console.error('Coleta incompleta preservada, não promovida:',saved.directory);}throw error;}
}
export async function archive(output, snapshot) {
  await fs.mkdir(output,{recursive:true});
  const staging = await fs.mkdtemp(path.join(output,'.run-'));
  try {
    const manifest = { schemaVersion:'1', election:snapshot.election, round:snapshot.round, complete:snapshot.results.length===29, validation:'raw-archive-not-baseline-approval', files:[] };
    for (const [i, file] of snapshot.files.entries()) {
      const name = `${i}.json`, bytes=file.rawBytes??file.rawText; await fs.writeFile(path.join(staging,name),bytes);
      manifest.files.push({ name, url:file.url, fetchedAt:file.fetchedAt, sourceUpdatedAt:snapshot.results[i-1]?.generatedAt ?? null, parseError:!!file.parseError, sha256:hash(bytes) });
    }
    const contentKey = hash(JSON.stringify({schemaVersion:manifest.schemaVersion,election:manifest.election,round:manifest.round,files:manifest.files.map(f=>({url:f.url,sha256:f.sha256}))}));
    await fs.writeFile(path.join(staging,'manifest.json'),JSON.stringify(manifest,null,2));
    const destination = path.join(output,contentKey);
    try { await fs.rename(staging,destination); } catch (error) { if (!['EEXIST','ENOTEMPTY'].includes(error.code)) throw error; }
    return { directory:destination, hash:contentKey };
  } finally { await fs.rm(staging,{recursive:true,force:true}); }
}
