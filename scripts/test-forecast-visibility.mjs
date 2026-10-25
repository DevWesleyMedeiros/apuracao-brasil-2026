import assert from 'node:assert/strict';

export async function testForecastVisibility({ load, request, poll, contest, asOf, MODEL_CONFIG, futureEvaluation }) {
  const { buildForecast } = await load('forecast-server/service');
  const { probabilityLabel } = await load('forecast/format');
  const { timestamp } = await load('forecast/types');
  const valid = { ...futureEvaluation, publishedAt: '2026-10-14' }; // Test-only metadata, not calibration evidence.
  const data = { ...request.data, dataVersion: 'test', polls: [poll], contest, candidates: ['a','b'].map(id => ({ id, name: id, sourceUrl: 'https://example.test', verifiedAt: '2026-10-01' })) };
  const base = { ...request, data: { ...data, evaluation: valid } };
  const cases = [
    ['publication-disabled', valid, { ...request.flags, publicProbabilityEnabled: false }],
    ['evaluation-missing', null], ['evaluation-invalid', {}], ['evaluation-invalid', { ...valid, publishedAt: '2026-02-30' }],
    ['review-missing', { ...valid, qualityReviewed: false }], ['holdout-missing', { ...valid, independentHoldout: false }],
    ['not-operational', { ...valid, operational: false }], ['model-mismatch', { ...valid, modelVersion: 'other' }],
    ['data-mismatch', { ...valid, dataVersion: 'other' }], ['parameters-mismatch', { ...valid, parametersHash: 'other' }],
    ['evaluation-after-cutoff', futureEvaluation], ['election-after-cutoff', { ...valid, evaluationElections: [2026] }],
  ];
  for (const [code, evaluation, flags = request.flags] of cases) {
    const r = buildForecast({ ...base, data: { ...data, evaluation }, flags });
    assert.equal(r.state, 'ready', code);
    assert.ok(r.probabilityBlocks.some(b => b.code === code), code);
    assert.match(r.probabilityReason, /Probabilidade não publicada/);
    assert.deepEqual([r.estimate.probabilityA, r.estimate.probabilityB, r.estimate.probabilityTie], [null, null, null]);
    assert.equal(r.estimate.a.median, .5, 'publication gate must not hide vote estimates');
  }
  const allowed = buildForecast(base);
  assert.equal(allowed.publicProbabilityEnabled, true);
  assert.deepEqual(allowed.probabilityBlocks, []);
  assert.equal(allowed.probabilityReason, null);
  assert.ok(Math.abs(allowed.estimate.probabilityA + allowed.estimate.probabilityB + allowed.estimate.probabilityTie - 1) < 1e-12);
  assert.equal(allowed.estimate.probabilityTie, 0);
  assert.notEqual(probabilityLabel(0), probabilityLabel(null));
  const { predictiveDistribution } = await load('forecast/distribution');
  assert.equal(predictiveDistribution(.5, 0, MODEL_CONFIG).probabilityTie, 1);
  assert.equal(predictiveDistribution(.6, 0, MODEL_CONFIG).probabilityB, 0);
  const { normalizeForecastPoints, forecastChartDomain, forecastTimeDomain } = await load('forecast/chart');
  const point = (at, value = .52) => ({ at, value, kind: 'poll', label: 'Teste', url: 'https://example.test', weight: .5 });
  const original = [point('2026-10-12'), point('2026-10-13T00:00:00Z'), point('2026-10-12'), { ...point('2026-10-13T00:30:00-03:00'), kind: 'median', lo: .01, hi: .99 }];
  const points = normalizeForecastPoints(original);
  assert.equal(points.length, 4, 'overlapping observations retained');
  assert.equal(points[0].at, '2026-10-13T00:00:00Z', 'date-only is end of Brasília day, not UTC midnight');
  for (const p of points) { assert.equal(p.time, timestamp(p.at)); assert.deepEqual(original[p.id], Object.fromEntries(Object.entries(p).filter(([k]) => !['time','id'].includes(k)))); }
  assert.equal(points[1].time, points[2].time);
  assert.deepEqual(forecastChartDomain(points, false), [0,1]);
  const expanded = forecastChartDomain(points, true);
  assert.ok(expanded[0] <= .01 && expanded[1] >= .99 && expanded[0] >= 0 && expanded[1] <= 1);
  assert.deepEqual(forecastTimeDomain([]), null);
  for (const input of [[], [point('2026-10-12')], [point('2026-10-12', 0), point('2026-10-12', 1)]]) {
    const normalized = normalizeForecastPoints(input), [lo, hi] = forecastChartDomain(normalized, true);
    assert.ok(lo <= .5 && hi >= .5 && hi > lo);
    if (input.length) { const [start, end] = forecastTimeDomain(normalized); assert.ok(end > start); assert.ok(normalized.every(p => p.time >= start && p.time <= end && p.value >= lo && p.value <= hi)); }
  }
  const { history } = await load('forecast/history');
  const h = history([poll], contest, ['2026-10-13T00:00:00Z', '2026-10-12', asOf], MODEL_CONFIG, 'test');
  assert.equal(h[0].result, null); assert.equal(h[1].result.pollCount, 1);
  assert.ok(h.every(cut => !cut.result || cut.result.polls.every(p => timestamp(p.publishedAt) <= timestamp(cut.asOf))));
  console.log('Passed: structured publication gates, test-only authorized distribution, null versus zero, continuous/degenerate ties, temporal graph normalization, overlaps, intervals, zoom and strict historical cutoff.');
}
