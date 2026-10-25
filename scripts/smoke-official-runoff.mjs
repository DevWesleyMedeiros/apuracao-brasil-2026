// Read-only, one sequential pass. No election-code fallback and no automatic retries.
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
import { args } from './forecast-cli.mjs';

const options = args(['url']);
const base = new URL(options.url ?? 'http://127.0.0.1:3000');
if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('URL base HTTP(S) sem credenciais obrigatória.');
let election, catalog, stopped = false;
async function read(label, pathname, validate) {
  if (stopped) { console.error(`${label}: não consultado após limitação da fonte.`); process.exitCode = 1; return; }
  await pause(1000);
  try {
    const start = performance.now();
    const response = await fetch(new URL(pathname, base), { signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json' }, redirect: 'error' });
    assert.ok(response.headers.get('content-type')?.includes('application/json'), 'content-type JSON');
    const payload = await response.json();
    console.log(`${label}: HTTP ${response.status} · ${(performance.now() - start).toFixed(0)} ms · ${payload.state ?? 'sem estado de resultado'}`);
    if (response.status === 429) stopped = true;
    assert.equal(response.status, 200, `consulta indisponível: ${payload.message ?? 'sem diagnóstico'}; Retry-After=${response.headers.get('retry-after') ?? 'não informado'}`);
    validate(payload);
    return payload;
  } catch (error) { process.exitCode = 1; console.error(`${label}: ${error.message}`); }
}
function resultCheck(uf, region, city) {
  return p => {
    assert.equal(p.round, '2'); assert.equal(p.office, '1'); assert.equal(p.uf, uf);
    assert.equal(p.context?.cycle, 'ele2026'); assert.equal(p.context?.year, 2026);
    assert.equal(p.context?.round, '2'); assert.equal(p.context?.office, '1'); assert.equal(p.context?.electionDate, '25/10/2026');
    assert.match(p.election, /^\d{1,6}$/); assert.equal(p.context.election, p.election);
    if (election) assert.equal(p.election, election); else election = p.election;
    assert.equal(p.region, region); assert.equal(p.municipality?.code, city?.code);
    if (city) assert.equal(p.municipality.name, city.name);
    assert.equal(p.context.territory, city?.code ?? uf);
    assert.equal(p.context.scope, region ? 'region' : city ? 'mu' : uf === 'br' ? 'br' : 'uf');
    assert.ok(['waiting','withheld','partial','finished'].includes(p.state));
    assert.ok(Array.isArray(p.candidates)); assert.ok(p.sections && p.votes);
    assert.ok(Number.isFinite(Date.parse(p.checkedAt)));
    if (p.stale) { assert.ok(p.message); console.warn(`${uf}: STALE · fonte original ${p.generatedAt || JSON.stringify(p.sources)}`); process.exitCode = 1; }
    if (region) { assert.deepEqual(p.sources.map(s => s.uf).sort(), ['pr','rs','sc']); assert.ok(p.candidates.every(c => !c.elected)); }
    else { assert.match(p.sourceUrl, /^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\//); assert.ok(p.generatedAt); }
    if (p.state === 'withheld') assert.ok(p.candidates.every(c => c.votes === null));
    // Zero votes are valid before opening; never require positive votes.
  };
}
for (const [label, query, uf, region] of [
  ['Nacional', 'uf=br', 'br'], ['RS', 'uf=rs', 'rs'], ['Exterior ZZ', 'uf=zz', 'zz'], ['Sul', 'uf=br&region=sul', 'region:sul', 'sul'],
]) await read(label, `/api/results?${query}&office=1&round=2`, resultCheck(uf, region));
catalog = await read('Catálogo municipal RS', '/api/municipalities?uf=rs&round=2', p => {
  assert.equal(p.uf, 'rs'); assert.equal(p.round, '2'); assert.match(p.election, /^\d{1,6}$/);
  if (election) assert.equal(p.election, election); else election = p.election;
  assert.match(p.sourceUrl, /^https:\/\/resultados\.tse\.jus\.br\/oficial\/ele2026\//);
  assert.ok(Array.isArray(p.municipalities));
  assert.ok(p.municipalities.every(c => /^\d{5}$/.test(c.code) && typeof c.name === 'string'));
});
const city = catalog?.municipalities?.find(c => c.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase() === 'PORTO ALEGRE');
if (!city) { process.exitCode = 1; console.error('Porto Alegre: não consultado; município não identificado no catálogo oficial. Nenhum código presumido.'); }
else await read('Porto Alegre', `/api/results?uf=rs&office=1&round=2&municipality=${encodeURIComponent(city.code)}`, resultCheck('rs', undefined, city));
console.log(process.exitCode ? 'Smoke com bloqueios: não comprova disponibilidade operacional.' : 'Smoke oficial concluído: seis leituras compatíveis; não garante disponibilidade futura.');
