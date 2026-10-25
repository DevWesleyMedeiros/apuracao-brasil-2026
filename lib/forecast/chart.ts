import { timestamp } from './types';

export type ChartInput = { at: string; value: number; kind: 'poll' | 'median'; label: string; url: string; weight: number | null; lo?: number; hi?: number };
export type ChartPoint = ChartInput & { time: number; id: number };
// One conversion per point, shared by ordering, positioning and displayed civil time.
export function normalizeForecastPoints(points: ChartInput[]): ChartPoint[] {
    return points.map((p, id) => ({ ...p, id, time: timestamp(p.at) })).sort((a, b) => a.time - b.time || a.id - b.id);
}
export function forecastChartDomain(points: ChartPoint[], expanded: boolean): [number, number] {
    if (!expanded) return [0, 1];
    const values = [.5, ...points.flatMap(p => [p.value, p.lo ?? p.value, p.hi ?? p.value])];
    const low = Math.min(...values), high = Math.max(...values), margin = Math.max(.02, (high - low) * .1);
    return [Math.max(0, low - margin), Math.min(1, high + margin)];
}
export function forecastTimeDomain(points: ChartPoint[]): [number, number] | null {
    if (!points.length) return null;
    const low = points[0].time, high = points[points.length - 1].time;
    // Display padding only; the stored instants are never shifted.
    return low === high ? [low - 43200000, high + 43200000] : [low, high];
}
