"use client";
import { useMemo, useState } from 'react';
import type { ForecastResponse } from '@/lib/forecast-server/service';
import { normalizeForecastPoints, forecastChartDomain, forecastTimeDomain } from '@/lib/forecast/chart';

const percent = (p: number) => `${(p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'long' });

export function ForecastSeries({ data }: { data: ForecastResponse }) {
    const [expanded, setExpanded] = useState(false), [selected, setSelected] = useState<number | null>(null);
    const points = useMemo(() => normalizeForecastPoints([
        ...data.polls.map(p => ({ at: p.publishedAt, value: p.share, kind: 'poll' as const, label: `Pesquisa observada · ${p.institute}`, url: p.reportUrl, weight: p.weight })),
        ...data.series.map(p => ({ at: p.asOf, value: p.median, lo: p.lo, hi: p.hi, kind: 'median' as const, label: 'Mediana projetada', url: '', weight: null })),
    ]), [data.polls, data.series]);
    const domain = forecastChartDomain(points, expanded), time = forecastTimeDomain(points);
    const x = (t: number) => 75 + (t - time![0]) / (time![1] - time![0]) * 590;
    const y = (v: number) => 280 - (v - domain[0]) / (domain[1] - domain[0]) * 240;
    const medians = points.filter(p => p.kind === 'median');
    const focus = points.find(p => p.id === selected);
    const group = focus ? points.filter(p => p.time === focus.time) : [];
    const name = data.candidates[0]?.name ?? 'candidatura ainda não verificada';
    return <section className="min-w-0 rounded-lg border bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold">Pesquisas e cortes históricos</h2>
        <p className="mt-2 text-sm">Parcela de votos válidos de {name}. Série recalculada por corte com os dados desta versão; não é um arquivo imutável de previsões publicadas naquele dia.</p>
        <p className="mt-2 text-sm">● Pesquisa observada · ■ Mediana projetada (linha reta) · ▧ Intervalo preditivo de 95% condicionado ao modelo (faixa e segmentos, não incerteza de cada pesquisa) · ┄ Referência 50%.</p>
        <label className="mt-4 block font-semibold">Escala vertical <select className="ml-2 max-w-full rounded border bg-white p-2" value={expanded ? 'expanded' : 'full'} onChange={e => setExpanded(e.target.value === 'expanded')}><option value="full">Completa · 0–100%</option><option value="expanded">Ampliada · diferenças destacadas</option></select></label>
        <p className="mt-2 text-sm tabular-nums">{expanded ? 'Escala ampliada' : 'Escala completa'}: {percent(domain[0])} a {percent(domain[1])}. Todos os pontos, intervalos e 50% estão incluídos.</p>
        {!time ? <p className="mt-5 rounded border border-dashed p-6">Sem dados para gráfico. Não há curva estimada nem série fictícia.</p> : <>
            <div className="mt-4 overflow-x-auto" role="region" aria-label="Gráfico temporal; deslize horizontalmente em telas pequenas" tabIndex={0}>
                <svg viewBox="0 0 720 335" className="w-full min-w-[640px]" role="group" aria-label={`Pesquisas e mediana histórica de ${name}; pontos inspecionáveis e tabela abaixo`}>
                    {Array.from({ length: 5 }, (_, i) => domain[0] + (domain[1] - domain[0]) * i / 4).map(v => <g key={v}><line x1="75" x2="665" y1={y(v)} y2={y(v)} stroke="#cbd5e1" /><text x="4" y={y(v) + 4} fontSize="12">{percent(v)}</text></g>)}
                    <line x1="75" x2="665" y1={y(.5)} y2={y(.5)} stroke="#334155" strokeDasharray="7 4" /><text x="670" y={y(.5) + 4} fontSize="12">50%</text>
                    {medians.length > 1 && <polygon points={[...medians.map(p => `${x(p.time)},${y(p.hi!)}`), ...[...medians].reverse().map(p => `${x(p.time)},${y(p.lo!)}`)].join(' ')} fill="#155392" fillOpacity="0.15" />}
                    <polyline points={medians.map(p => `${x(p.time)},${y(p.value)}`).join(' ')} fill="none" stroke="#155392" strokeWidth="2" />
                    {points.map(p => {
                        const description = `${p.label}; ${name}; ${percent(p.value)}; ${dateTime.format(p.time)}${p.weight !== null ? `; peso ${percent(p.weight)}` : ''}${p.lo !== undefined ? `; intervalo preditivo 95% ${percent(p.lo)}–${percent(p.hi!)}` : ''}`;
                        return <g key={p.id} tabIndex={0} role="button" aria-label={description} onFocus={() => setSelected(p.id)} onMouseEnter={() => setSelected(p.id)} onClick={() => setSelected(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id); } }} className="cursor-pointer focus:outline-2 focus:outline-slate-900">
                            <title>{description}</title>
                            {p.kind === 'median' ? <><path d={`M${x(p.time)},${y(p.lo!)} V${y(p.hi!)}`} stroke="#155392" strokeWidth="2" /><rect x={x(p.time) - 4} y={y(p.value) - 4} width="8" height="8" fill="#155392" /></> : <circle cx={x(p.time)} cy={y(p.value)} r="5" fill="#075536" stroke="white" />}
                        </g>;
                    })}
                    {Array.from({ length: 5 }, (_, i) => time[0] + (time[1] - time[0]) * i / 4).map(t => <text key={t} x={x(t)} y="307" textAnchor="middle" fontSize="12">{date.format(t)}</text>)}
                    <text x="370" y="330" textAnchor="middle" fontSize="12">Publicação / corte · Brasília</text>
                </svg>
            </div>
            <label className="mt-3 block text-sm font-semibold">Inspecionar cada observação (inclusive sobrepostas)<select className="mt-2 block w-full min-w-0 rounded border bg-white p-2" value={focus?.id ?? ''} onChange={e => setSelected(e.target.value === '' ? null : Number(e.target.value))}><option value="">Selecione um ponto</option>{points.map(p => <option key={p.id} value={p.id}>{dateTime.format(p.time)} · {p.label} · {percent(p.value)}</option>)}</select></label>
            {focus && <div className="mt-3 rounded border border-slate-400 bg-slate-50 p-3 text-sm" aria-live="polite"><p className="font-bold">{name} · {dateTime.format(focus.time)} · Brasília</p><p>Todas as observações neste instante ({group.length}):</p><ul className="list-disc space-y-2 pl-5">{group.map(p => <li key={p.id}>{p.label}: <strong>{percent(p.value)}</strong>{p.weight !== null && ` · peso ${percent(p.weight)}`}{p.lo !== undefined && ` · intervalo preditivo 95%: ${percent(p.lo)}–${percent(p.hi!)}`}{p.url && <> · <a className="underline" href={p.url}>Relatório / fonte</a></>}</li>)}</ul></div>}
            <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm tabular-nums"><caption className="mb-3 text-left font-semibold">Tabela alternativa · {name} · datas e horários em America/Sao_Paulo</caption><thead><tr><th className="p-2">Publicação/corte</th><th className="p-2">Tipo e fonte</th><th className="p-2">Votos válidos</th><th className="p-2">Intervalo preditivo 95%</th><th className="p-2">Peso normalizado</th></tr></thead><tbody>{points.map(p => <tr key={p.id} className="border-t"><td className="p-2">{dateTime.format(p.time)}<details><summary className="cursor-pointer">Timestamp bruto</summary><code>{p.at}</code></details></td><th scope="row" className="p-2">{p.url ? <a className="underline" href={p.url}>{p.label}</a> : p.label}</th><td className="p-2">{percent(p.value)}</td><td className="p-2">{p.lo === undefined ? 'Não informado para pesquisa' : `${percent(p.lo)}–${percent(p.hi!)}`}</td><td className="p-2">{p.weight === null ? 'Não se aplica' : percent(p.weight)}</td></tr>)}</tbody></table></div>
        </>}
    </section>;
}
