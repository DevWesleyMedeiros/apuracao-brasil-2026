import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

export async function testCuration({ load, contest, poll, asOf, MODEL_CONFIG }) {
  const { decimal, confidence, pollToDraft, pollFromDraft, newPollDraft, duplicateDraft, configurationFromDraft,
    prepareImport, exportFiles, validateWorkspace, preview, emptyWorkspace, safeUrl, zoned, MAX_FILE_BYTES, MAX_POLLS } = await load('forecast/curation');
  const { pollSchema, candidateSchema, contestSchema, timestamp } = await load('forecast/types');
  const { buildForecast } = await load('forecast-server/service');
  // All examples here are synthetic test data, never application defaults.
  const candidates = ['a', 'b'].map(id => ({ id, name: `Teste ${id}`, sourceUrl: 'https://example.test/source', verifiedAt: '2026-10-01' }));
  const data = { contest, candidates, polls: [poll] };
  for (const [input, output] of [['46,5', 46.5], ['46.5', 46.5], ['0,465', .465], [' 1000 ', 1000], ['0', 0]]) assert.equal(decimal(input), output);
  for (const value of ['', ' ', '46,5.0', '1.000,50', '1 000', '1,2,3', 'NaN', 'Infinity', '1e3', '95%', '.5', '1.']) assert.throws(() => decimal(value), value);
  assert.equal(confidence('95%'), .95); assert.equal(confidence('95'), .95); assert.equal(confidence('95,5 %'), .955);
  assert.throws(() => confidence('95%%'));
  const minimal = { ...poll }; delete minimal.undecided;
  const draft = { ...pollToDraft(minimal), a: '46,5', b: '40', contractor: ' ', blank: '', null: '', undecided: '', marginOfError: '', validSampleSize: '', confidenceLevel: '95%' };
  const parsed = pollFromDraft(draft);
  assert.equal(parsed.a, 46.5); assert.equal(parsed.confidenceLevel, .95);
  for (const key of ['blank', 'null', 'undecided', 'contractor', 'marginOfError', 'validSampleSize']) assert.equal(Object.hasOwn(parsed, key), false, key);
  assert.equal(pollFromDraft({ ...draft, blank: '0' }).blank, 0, 'explicit zero is preserved');
  assert.deepEqual(pollFromDraft(pollToDraft(poll)), poll);
  const fresh = newPollDraft(contest);
  assert.equal(fresh.curation, 'pending'); assert.deepEqual([fresh.candidateA, fresh.candidateB], contest.candidateIds);
  const copy = duplicateDraft(poll);
  assert.equal(copy.curation, 'pending'); assert.equal(copy.id, ''); assert.equal(copy.registration, ''); assert.equal(copy.wave, '');
  const pending = pollFromDraft({ ...pollToDraft(poll), curation: fresh.curation });
  assert.equal(preview({ ...data, polls: [pending] }, asOf).selected.length, 0);
  assert.equal(preview(data, asOf).selected[0].id, poll.id);
  assert.equal(preview(data, asOf).eligible, 1);
  assert.throws(() => preview(data, '2026-10-26T00:00:00Z'));
  assert.throws(() => preview(data, '2026-10-15T12:00:00'));
  assert.throws(() => preview(data, '2026-10-15'));
  assert.throws(() => preview({ ...data, candidates: candidates.map(c => ({ ...c, verifiedAt: '2026-10-16' })) }, asOf));
  assert.equal(timestamp('2026-10-12'), Date.parse('2026-10-13T02:59:59.999Z'));
  assert.equal(pollFromDraft(draft).fieldEnd, poll.fieldEnd, 'date-only source is not rewritten');
  for (const date of ['2026-02-30', '2026-10-12T10:00', '2026-10-12T10:00:00', '2026-10-12T25:00:00-03:00']) assert.throws(() => zoned(date));
  assert.equal(zoned('2026-10-25T20:00:00Z'), '2026-10-25T20:00:00Z');
  const configDraft = { year: '2026', election: contest.election, electionAt: contest.electionAt, scenario: contest.scenario };
  candidates.forEach((c, i) => { const suffix = i === 0 ? 'A' : 'B'; for (const [key, value] of Object.entries(c)) configDraft[`${key}${suffix}`] = value; });
  assert.deepEqual(configurationFromDraft(configDraft), { contest, candidates });
  assert.throws(() => configurationFromDraft({ ...configDraft, year: '2030' }));
  assert.throws(() => configurationFromDraft({ ...configDraft, electionAt: '2026-10-25' }));
  assert.throws(() => configurationFromDraft({ ...configDraft, electionAt: '2026-10-25T18:00:00-03:00' }));
  assert.equal(configurationFromDraft({ ...configDraft, electionAt: '2026-10-25T20:00:00Z' }).contest.electionAt, '2026-10-25T20:00:00Z');
  assert.throws(() => exportFiles({ ...data, candidates: [...candidates].reverse() }));
  assert.throws(() => exportFiles({ ...data, polls: [{ ...poll, candidateIds: ['b', 'a'] }] }));
  assert.throws(() => exportFiles({ ...data, contest: { ...contest, scenario: 'changed' } }));
  assert.throws(() => exportFiles({ ...data, polls: [{ ...poll, a: 0 }] }));
  assert.throws(() => exportFiles({ ...data, polls: [{ ...poll, confirmations: ['invented'] }] }), 'strict export rejects UI metadata');
  assert.throws(() => exportFiles({ ...data, polls: [poll, { ...poll, wave: 'other' }] }));
  for (const change of [{ curation: 'pending' }, { a: 41, undecided: 19 }, { sampleSize: 900 }]) {
    const issues = validateWorkspace({ ...data, polls: [poll, { ...poll, id: 'conflicting-copy', ...change }] });
    assert.ok(issues.some(i => i.path === 'polls.0'), 'conflict points at first record');
    assert.ok(issues.some(i => i.path === 'polls.1'), 'conflict points at second record');
    assert.throws(() => exportFiles({ ...data, polls: [poll, { ...poll, id: 'conflicting-copy', ...change }] }));
  }
  assert.throws(() => exportFiles({ ...data, polls: [{ ...poll, curation: 'pending' }, { ...poll, id: 'pending-copy', curation: 'pending', sampleSize: 900 }] }), 'conflicting pending copies are caught before review');
  const later = { ...poll, id: 'new-wave', wave: '2', fieldEnd: '2026-10-11', publishedAt: '2026-10-12' };
  const selection = preview({ ...data, polls: [poll, { ...poll, id: 'exact-copy' }, later] }, asOf);
  assert.equal(selection.eligible, 3); assert.equal(selection.deduplicated, 2); assert.deepEqual(selection.selected.map(p => p.id), ['new-wave']);
  for (const change of [{ registration: 'BR-00001/2022' }, { sampleSize: Infinity }, { a: 60.01 }, { denominator: 'valid' }, { provenance: [] }, { publishedAt: '2026-10-01' }, { accessedAt: '2026-02-30' }]) assert.throws(() => pollFromDraft(pollToDraft({ ...poll, ...change })));
  const valid = { ...draft, denominator: 'valid', a: '50', b: '50', validSampleSize: '600' };
  assert.equal(pollFromDraft(valid).validSampleSize, 600);
  assert.throws(() => pollFromDraft({ ...valid, blank: '0' }));
  assert.throws(() => pollFromDraft({ ...valid, a: '49,9' }));
  const files = exportFiles({ ...data, polls: [parsed, { ...poll, id: 'pending-new', registration: 'BR-00002/2026', curation: 'pending' }] });
  for (const text of Object.values(files)) assert.ok(text.endsWith('\n'));
  contestSchema.parse(JSON.parse(files['contest.json']));
  JSON.parse(files['candidates.json']).forEach(c => candidateSchema.parse(c));
  JSON.parse(files['polls.json']).forEach(p => pollSchema.parse(p));
  const importedFiles = Object.entries(files).map(([name, text]) => ({ name, text, size: Buffer.byteLength(text) }));
  const imported = prepareImport(emptyWorkspace(), importedFiles);
  assert.equal(imported.polls[0].confidenceLevel, .95);
  const response = buildForecast({ data: { ...imported, evaluation: null, dataVersion: 'synthetic' }, config: MODEL_CONFIG, parametersHash: 'synthetic', mode: 'pre', asOf, computedAt: asOf, historical: true, flags: { preEnabled: true, liveEnabled: false, publicProbabilityEnabled: false } });
  assert.equal(response.state, 'ready'); assert.equal(response.estimate.probabilityA, null);
  const before = JSON.stringify(data);
  const badImports = [
    [{ name: 'polls.json', text: '{', size: 1 }],
    [{ name: 'polls.json', text: '[{}]', size: 4 }],
    [{ name: 'contest.json', text: JSON.stringify({ ...contest, year: 2030 }), size: 200 }],
    [{ name: 'polls.json', text: '[]', size: MAX_FILE_BYTES + 1 }],
    [{ name: 'polls.json', text: ' '.repeat(MAX_FILE_BYTES) + '[]', size: 1 }],
    [{ name: 'other.json', text: '[]', size: 2 }],
    [{ name: 'candidates.json', text: '{}', size: 2 }],
    [{ name: 'polls.json', text: JSON.stringify([{ ...poll, fakeMetadata: true }]), size: 400 }],
    Array(2).fill({ name: 'polls.json', text: '[]', size: 2 }),
    [{ name: 'contest.json', text: JSON.stringify({ ...contest, election: '9999' }), size: 300 }, { name: 'polls.json', text: 'invalid', size: 7 }],
  ];
  for (const input of badImports) { assert.throws(() => prepareImport(data, input)); assert.equal(JSON.stringify(data), before, 'invalid import preserves state'); }
  assert.throws(() => prepareImport(data, [{ name: 'polls.json', text: JSON.stringify(Array(MAX_POLLS + 1).fill(poll)), size: 1 }]));
  const empty = prepareImport(data, [ ['contest.json', 'null'], ['candidates.json', '[]'], ['polls.json', '[]'] ].map(([name, text]) => ({ name, text, size: text.length })));
  assert.deepEqual(empty, emptyWorkspace());
  assert.throws(() => exportFiles(empty), 'incomplete starting files can be imported but not published as configured');
  assert.deepEqual(prepareImport(data, [{ name: 'polls.json', text: '[]', size: 2 }]), { ...data, polls: [] });
  assert.equal(safeUrl('javascript:alert(1)'), undefined); assert.equal(safeUrl('data:text/html,test'), undefined); assert.equal(safeUrl('https://example.test'), 'https://example.test/');
  const script = await fs.readFile('scripts/admin-pesquisas.mjs', 'utf8');
  assert.match(script, /configFile: false/); assert.match(script, /host: '127\.0\.0\.1'/); assert.match(script, /cors: false/); assert.match(script, /publicDir: false/); assert.match(script, /envFile: false/);
  assert.doesNotMatch(script, /import .*vinext|import .*cloudflare|writeFile/);
  assert.equal(JSON.parse(await fs.readFile('package.json', 'utf8')).scripts['admin:pesquisas'], 'node scripts/admin-pesquisas.mjs');
  for (const file of ['vite.config.ts', 'next.config.ts', 'app/layout.tsx', 'lib/forecast-server/production.ts']) assert.doesNotMatch(await fs.readFile(file, 'utf8'), /tools\/pesquisas|admin-pesquisas/);
  for (const file of ['App.tsx', 'Configuration.tsx', 'PollEditor.tsx', 'Transfer.tsx']) assert.doesNotMatch(await fs.readFile(`tools/pesquisas/${file}`, 'utf8'), /localStorage|indexedDB|showSaveFilePicker|dangerouslySetInnerHTML|fetch\(/);
  console.log('Passed: local curation decimals/confidence, omitted optionals, dates/timezones, import atomicity/limits, strict exports accepted by production, candidate order, duplicate conflicts, pending exclusion, real selection and runtime isolation.');
}
