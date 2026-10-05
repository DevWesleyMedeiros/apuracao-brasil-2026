'use client';

import { Bar, BarChart, CartesianGrid, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { electionChartData } from '@/lib/chart-data';
import type { Result } from '@/lib/catalog';

const format = (value: number) => value.toLocaleString('pt-BR');
const compact = (value: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const percent = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const votesConfig = { votes: { label: 'Votos', color: '#098552' } };
const compositionConfig = { value: { label: 'Votos' } };
const sectionsConfig = { value: { label: 'Seções' } };

function EmptyChart({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed bg-slate-50 px-5 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function ElectionCharts({ result }: { result: Result }) {
  const data = electionChartData(result);
  return <section aria-labelledby="charts-heading" className="mb-6">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="charts-heading" className="text-xl font-bold">Apuração em gráficos</h3>
      <p className="text-sm text-muted-foreground">Mesmo cargo e abrangência dos resultados acima</p>
    </div>
    {!data ? <EmptyChart>O TSE ainda não liberou a votação. Os gráficos serão exibidos quando os dados estiverem disponíveis.</EmptyChart> : <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <article aria-labelledby="candidates-chart-heading" className="min-w-0 rounded-lg border bg-card p-5 lg:row-span-2">
        <h4 id="candidates-chart-heading" className="font-semibold">Candidatos com mais votos</h4>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">Até seis candidaturas · número de votos, sem projeção de eleitos</p>
        {data.candidates.length ? <>
          <ChartContainer config={votesConfig} className="h-80 w-full aspect-auto text-sm" aria-label="Comparação de votos entre as seis candidaturas mais votadas">
            <BarChart accessibilityLayer data={data.candidates} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 16 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 'dataMax']} allowDecimals={false} tickFormatter={compact} tickLine={false} axisLine={false} fontSize={14} />
              <YAxis type="category" dataKey="label" width={110} interval={0} tickLine={false} axisLine={false} fontSize={14} />
              <ChartTooltip cursor={{ fill: '#e9f2ed' }} content={<ChartTooltipContent labelFormatter={(_, payload) => payload[0]?.payload?.name ?? 'Candidato'} formatter={value => <span className="font-medium tabular-nums">{format(Number(value))} votos</span>} />} />
              <Bar dataKey="votes" fill="var(--color-votes)" radius={[0, 4, 4, 0]} maxBarSize={30} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          <ol className="mt-3 space-y-3 border-t pt-4" aria-label="Valores do gráfico de candidatos">
            {data.candidates.map(candidate => <li key={candidate.id} className="flex items-start justify-between gap-4 text-sm">
              <div className="min-w-0"><p className="break-words font-medium">{candidate.name}</p><p className="text-muted-foreground">{candidate.label}</p></div>
              <div className="shrink-0 text-right tabular-nums"><p className="font-semibold">{format(candidate.votes)}</p>{candidate.percent !== null && <p className="text-muted-foreground">{percent(candidate.percent)} {result.region ? 'na região' : 'TSE'}</p>}</div>
            </li>)}
          </ol>
          {result.candidates.length > 6 && <p className="mt-4 text-sm text-muted-foreground">Todas as {result.candidates.length} candidaturas permanecem disponíveis na tabela abaixo.</p>}
        </> : <EmptyChart>{result.state === 'waiting' ? 'A totalização ainda não começou. Aguarde os primeiros votos para comparar as candidaturas.' : 'Ainda não há votos de candidatos para este gráfico.'}</EmptyChart>}
      </article>
      <article aria-labelledby="composition-chart-heading" className="min-w-0 rounded-lg border bg-card p-5">
        <h4 id="composition-chart-heading" className="font-semibold">Válidos, brancos e nulos</h4>
        <p className="mt-1 text-sm text-muted-foreground">Distribuição entre estas três categorias</p>
        {data.compositionTotal > 0 ? <div className="mt-3 grid items-center gap-4 sm:grid-cols-2">
          <ChartContainer config={compositionConfig} className="h-52 w-full aspect-auto text-sm" aria-label="Composição de votos válidos, brancos e nulos">
            <PieChart accessibilityLayer>
              <Pie data={data.composition.filter(part => part.value > 0)} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" stroke="#fff" strokeWidth={3} isAnimationActive={false} />
              <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, name) => <span>{name}: <strong>{format(Number(value))}</strong> votos</span>} />} />
            </PieChart>
          </ChartContainer>
          <ul className="space-y-4" aria-label="Valores do gráfico de votos">{data.composition.map(part => <li key={part.name} className="text-sm"><p className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: part.fill }} aria-hidden="true" />{part.name}</p><p className="mt-1 font-semibold tabular-nums">{format(part.value)} <span className="font-normal text-muted-foreground">· {percent(part.value / data.compositionTotal * 100)}</span></p></li>)}</ul>
        </div> : <div className="mt-4"><EmptyChart>Aguardando votos válidos, brancos ou nulos para calcular a distribuição.</EmptyChart></div>}
        <p className="mt-4 text-sm text-muted-foreground">Votos de legenda já integram os válidos. Percentuais deste gráfico usam a soma das três categorias; votos anulados e sub judice não compõem esta base.</p>
      </article>
      <article aria-labelledby="sections-chart-heading" className="min-w-0 rounded-lg border bg-card p-5">
        <h4 id="sections-chart-heading" className="font-semibold">Progresso das seções</h4>
        <p className="mt-1 text-sm text-muted-foreground">Seções totalizadas e ainda a totalizar</p>
        {result.sections.total > 0 ? <div className="mt-3 grid items-center gap-4 sm:grid-cols-2">
          <div className="relative">
            <ChartContainer config={sectionsConfig} className="h-52 w-full aspect-auto text-sm" aria-label="Proporção de seções totalizadas e a totalizar">
              <PieChart accessibilityLayer>
                <Pie data={data.sections.filter(part => part.value > 0)} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="90%" stroke="#fff" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false} />
                <ChartTooltip content={<ChartTooltipContent hideLabel formatter={(value, name) => <span>{name}: <strong>{format(Number(value))}</strong> seções</span>} />} />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true"><strong className="text-xl tabular-nums text-[#075536]">{percent(result.sections.percent)}</strong><span className="text-sm text-muted-foreground">totalizadas</span></div>
          </div>
          <ul className="space-y-4" aria-label="Valores do gráfico de seções">{data.sections.map(part => <li key={part.name} className="text-sm"><p className="flex items-center gap-2"><span className="size-3 rounded-sm border" style={{ background: part.fill }} aria-hidden="true" />{part.name}</p><p className="mt-1 font-semibold tabular-nums">{format(part.value)} seções</p></li>)}</ul>
        </div> : <div className="mt-4"><EmptyChart>O arquivo ainda não informa o total de seções.</EmptyChart></div>}
      </article>
    </div>}
  </section>;
}
