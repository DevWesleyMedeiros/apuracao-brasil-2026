import type { Result } from './catalog';

export function electionChartData(result: Result) {
  if (result.state === 'withheld') return null;
  const candidates = result.candidates
    .filter(candidate => candidate.votes !== null && candidate.votes > 0)
    .slice()
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0) || a.name.localeCompare(b.name, 'pt-BR'))
    .slice(0, 6)
    .map(candidate => ({
      id: candidate.id,
      label: `${candidate.number} · ${candidate.party}`,
      name: candidate.name,
      votes: candidate.votes as number,
      percent: candidate.percent,
    }));
  // Legend votes are included in valid votes. Do not count them twice.
  const composition = [
    { name: 'Válidos', value: result.votes.valid, fill: '#098552' },
    { name: 'Brancos', value: result.votes.blank, fill: '#155392' },
    { name: 'Nulos', value: result.votes.null, fill: '#b87900' },
  ];
  const sections = [
    { name: 'Totalizadas', value: result.sections.count, fill: '#098552' },
    { name: 'A totalizar', value: Math.max(0, result.sections.total - result.sections.count), fill: '#dce4ea' },
  ];
  return { candidates, composition, compositionTotal: composition.reduce((sum, part) => sum + part.value, 0), sections };
}
