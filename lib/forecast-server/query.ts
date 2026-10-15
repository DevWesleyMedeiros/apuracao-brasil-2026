import { timestamp } from '../forecast/types';
export function forecastQuery(params: URLSearchParams, now: number): {mode:'pre'|'live';asOf:string;historical:boolean;cutoffs:string[];now:number} {
    const allowed = new Set(['mode','asOf','from','to']);
    for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new Error('Parâmetro desconhecido ou repetido.');
    const mode = params.get('mode');
    if (mode !== 'pre' && mode !== 'live') throw new Error('Informe mode=pre ou mode=live.');
    const historical = params.has('asOf');
    const resolution=mode==='live'?15000:300000;
    const asOf = params.get('asOf') ?? new Date(Math.floor(now/resolution)*resolution).toISOString();
    const cutoff = timestamp(asOf), election = timestamp('2026-10-25T17:00:00-03:00');
    if (historical && (cutoff > now || cutoff > election || cutoff < timestamp('2026-10-04T00:00:00-03:00') || mode !== 'pre')) throw new Error('Corte histórico fora do intervalo permitido.');
    const from = params.get('from'), to = params.get('to');
    if (!!from !== !!to || (from && mode !== 'pre')) throw new Error('Intervalo exige from e to no modo pre.');
    const cutoffs: string[] = [];
    if (from && to) {
        const start=timestamp(from), end=timestamp(to);
        if (start < timestamp('2026-10-04T00:00:00-03:00') || end > Math.min(cutoff,election) || start > end || end-start > 31*86400000) throw new Error('Histórico limitado a 31 dias antes do corte.');
        for (let t=start;t<=end;t+=86400000) cutoffs.push(new Date(t).toISOString());
    } else if (mode==='pre' && cutoff<=election) {
        for(let t=timestamp('2026-10-04T23:59:59-03:00');t<=cutoff;t+=86400000) cutoffs.push(new Date(t).toISOString());
        if(!cutoffs.includes(asOf))cutoffs.push(asOf);
    }
    return { mode, asOf, historical, cutoffs, now };
}
