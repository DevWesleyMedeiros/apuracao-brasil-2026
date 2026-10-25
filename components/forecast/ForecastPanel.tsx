"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ForecastResponse } from "@/lib/forecast-server/service";
import { withDeadline } from "@/lib/deadline";
import { probabilityLabel } from "@/lib/forecast/format";
import { ForecastSeries } from './ForecastSeries';
const percent = (p: number) =>
  `${(100 * p).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const publishedProbability = (p: number | null) => p === null ? 'Probabilidade não publicada' : probabilityLabel(p);
const labels = {
  disabled: "Desabilitado",
  "no-data": "Sem dados verificados",
  "insufficient-data": "Dados insuficientes",
  ready: "Agregação disponível",
  stale: "Dados desatualizados",
  finished: "Apuração oficial concluída",
};
export function ForecastPanel() {
  const [mode, setMode] = useState<"pre" | "live">("pre"),
    [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    data: ForecastResponse | null;
    error: string;
    loading: boolean;
  }>({ data: null, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    void withDeadline(
      async (signal) => {
        const response = await fetch(`/api/forecast?mode=${mode}`, {
          signal,
          cache: "no-store",
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error("Não foi possível consultar a projeção.");
        const data = (await response.json()) as ForecastResponse;
        if (data.mode !== mode || !labels[data.state])
          throw new Error("Resposta incompatível.");
        if (!controller.signal.aborted)
          setState({ data, error: "", loading: false });
      },
      15000,
      controller.signal,
    ).catch((error) => {
      if (!controller.signal.aborted)
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Falha na consulta.",
          loading: false,
        });
    });
    return () => controller.abort();
  }, [mode, retry]);
  const { data, error, loading } = state;
  const changeMode = (value: "pre" | "live") => {
    setState({ data: null, error: "", loading: true });
    setMode(value);
  };
  return (
    <section className="space-y-6" aria-label="Estimativas">
      <div className="flex flex-wrap items-center gap-4">
        <label className="font-semibold">
          Modo{" "}
          <select
            className="rounded border bg-white p-2"
            value={mode}
            onChange={(e) => changeMode(e.target.value as "pre" | "live")}
          >
            <option value="pre">Pré-eleitoral · experimental</option>
            <option value="live">Ao vivo · experimental</option>
          </select>
        </label>
        <button
          className="action-button"
          disabled={loading}
          onClick={() => {
            setState({ data: null, error: "", loading: true });
            setRetry((n) => n + 1);
          }}
        >
          Consultar novamente
        </button>
      </div>
      {loading && <p role="status">Consultando projeção…</p>}
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-4">
          {error} Use “Consultar novamente”.{" "}
          <Link className="underline" href="/?round=2">
            Abrir apuração oficial
          </Link>
          .
        </p>
      )}
      {data && (
        <>
          <section
            className="rounded-lg border bg-white p-5"
            aria-live="polite"
          >
            <h2 className="text-xl font-bold">{labels[data.state]}</h2>
            <p className="mt-2">{data.message}</p>
            {mode === 'live' && <p className="mt-3"><Link className="font-semibold underline" href="/?round=2">Acompanhar apuração oficial presidencial · segundo turno</Link>. A projeção ao vivo não possui ingestão contínua ativa.</p>}
            {data.state === "stale" && (
              <p>
                Último cálculo íntegro: {data.computedAt}. Não é uma atualização
                da apuração atual.
              </p>
            )}
            {data.historical && (
              <p>Corte histórico identificado: {data.asOf}</p>
            )}
          </section>
          <div className="grid gap-4 md:grid-cols-2">
            {data.estimate && data.candidates.map((c, i) => {
              const e = i === 0 ? data.estimate!.a : data.estimate!.b;
              return <article key={c.id} className="min-w-0 rounded-lg border border-slate-300 bg-white p-5">
                <h2 className="text-lg font-bold break-words">{c.name}</h2>
                <p className="mt-3 text-sm">Parcela estimada dos votos válidos · mediana</p>
                <p className="my-2 text-4xl font-bold tabular-nums sm:text-5xl">{percent(e.median)}</p>
                <p className="tabular-nums">Intervalo preditivo de 95%: <strong className="inline-block">{percent(e.lo)} – {percent(e.hi)}</strong></p>
                <p className="mt-2 text-sm">Condicionado ao modelo experimental; não é margem de erro de uma pesquisa.</p>
                <div className="mt-4 border-t pt-3"><h3 className="text-sm font-semibold">Chance de vitória · não é parcela de votos</h3><p className="mt-1 font-bold tabular-nums">{publishedProbability(i === 0 ? data.estimate!.probabilityA : data.estimate!.probabilityB)}</p></div>
              </article>;
            })}
          </div>
          <section className="rounded-lg border border-amber-400 bg-amber-50 p-5" aria-label="Estado da publicação de probabilidades">
            <h2 className="text-lg font-bold">{data.publicProbabilityEnabled ? 'Probabilidades condicionais ao modelo' : 'Probabilidade não publicada'}</h2>
            <p className="mt-2">{data.probabilityReason ?? 'Não são certezas nem resultados oficiais.'}</p>
            <p className="mt-2">Calibração: {data.calibrationStatus === 'uncalibrated' ? 'não estabelecida' : 'revisada; consultar relatório e limites'}.</p>
            {data.probabilityBlocks.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-semibold">Detalhes auditáveis do bloqueio</summary><ul className="mt-2 list-disc space-y-2 pl-5">{data.probabilityBlocks.map(b => <li key={b.code}><code>{b.code}</code>: {b.message}</li>)}</ul></details>}
          </section>
          <div className="overflow-x-auto rounded-lg border bg-white p-4">
            <table className="w-full text-left text-sm">
              <caption className="mb-3 text-left font-bold">
                Estimativas experimentais · segundo turno
              </caption>
              <thead>
                <tr>
                  <th className="p-2">Candidatura verificada</th>
                  <th className="p-2">Mediana</th>
                  <th className="p-2">Intervalo de 95%</th>
                  <th className="p-2">Probabilidade estimada de vitória</th>
                </tr>
              </thead>
              <tbody>
                {data.estimate ? (
                  data.candidates.map((c, i) => {
                    const e = i === 0 ? data.estimate!.a : data.estimate!.b;
                    return (
                      <tr className="border-t" key={c.id}>
                        <th scope="row" className="p-2">
                          <a className="underline" href={c.sourceUrl}>{c.name}</a>
                        </th>
                        <td className="p-2">{percent(e.median)}</td>
                        <td className="p-2">
                          {percent(e.lo)}–{percent(e.hi)}
                        </td>
                        <td className="p-2">
                          {publishedProbability(
                            i === 0
                              ? data.estimate!.probabilityA
                              : data.estimate!.probabilityB,
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={4} className="p-4">
                      Sem estimativas disponíveis; nenhum nome ou percentual de
                      exemplo é usado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.estimate && <div className="grid gap-4 md:grid-cols-2">
            <article className="min-w-0 rounded-lg border border-green-800 bg-green-50 p-5"><h2 className="text-lg font-bold">Média ponderada das pesquisas</h2><p className="mt-2 font-semibold">{data.candidates[0]?.name}</p><p className="my-2 text-4xl font-bold tabular-nums">{data.estimate.weightedPollShare === null ? 'Indisponível' : percent(data.estimate.weightedPollShare)}</p><p>Parcela de votos válidos nas pesquisas selecionadas, não chance de vitória.</p></article>
            <article className="min-w-0 rounded-lg border bg-white p-5"><h2 className="text-lg font-bold">Empate exato no modelo</h2><p className="my-3 text-xl font-bold tabular-nums">{publishedProbability(data.estimate.probabilityTie)}</p>{data.estimate.probabilityTie === null && <p>{data.probabilityReason}</p>}<p className="mt-2 text-sm">Com dispersão, o modelo contínuo atribui 0% à igualdade exata. Isso não torna impossível um empate numa contagem real discreta. Não significa “empate técnico” nem mede disputa apertada. Casos sem dispersão têm tratamento próprio.</p></article>
          </div>}
          <ForecastSeries data={data} />
          <section className="space-y-2 break-words rounded-lg border p-5 text-sm">
            <h2 className="font-bold">Auditoria e atualização</h2>
            <p>
              {data.pollCount} pesquisas selecionadas · {data.instituteCount}{" "}
              institutos · concentração dos pesos:{" "}
              {data.weightConcentration?.toFixed(3) ?? "—"}
            </p>
            <p>
              Corte: {data.asOf} · cálculo: {data.computedAt} · publicação mais
              recente: {data.sourceUpdatedAt ?? "indisponível"}
            </p>
            <p>
              Modelo: {data.modelVersion} · seed: {data.seed}
            </p>
            <p>Versão dos dados (SHA-256): {data.dataVersion}</p>
            <p>Parâmetros (SHA-256): {data.parametersHash}</p>
            <ul>
              {data.sources.map((url) => (
                <li key={url}>
                  <a
                    className="underline"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {url}
                  </a>
                </li>
              ))}
            </ul>
            <p>
              Histórico ao vivo não está sendo gravado por esta página. Coleta
              exige execução manual separada.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
