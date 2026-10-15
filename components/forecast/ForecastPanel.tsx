"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ForecastResponse } from "@/lib/forecast-server/service";
import { withDeadline } from "@/lib/deadline";
import { probabilityLabel } from "@/lib/forecast/format";
const percent = (p: number) =>
  `${(100 * p).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
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
            <option value="pre">Pré-eleitoral</option>
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
          <Link className="underline" href="/">
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
            <article className="rounded-lg border bg-white p-5">
              <h2 className="font-bold">Parcela estimada dos votos válidos</h2>
              <p>
                Mediana preditiva e intervalo de 95% condicionado ao modelo; não
                é chance de vitória.
              </p>
            </article>
            <article className="rounded-lg border bg-white p-5">
              <h2 className="font-bold">Probabilidade estimada de vitória</h2>
              <p>
                {data.probabilityReason ??
                  "Condicional às hipóteses do modelo, não uma certeza."}
              </p>
              <p>
                Calibração:{" "}
                {data.calibrationStatus === "uncalibrated"
                  ? "não estabelecida"
                  : "revisada"}
                .
              </p>
            </article>
          </div>
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
                          {c.name}
                        </th>
                        <td className="p-2">{percent(e.median)}</td>
                        <td className="p-2">
                          {percent(e.lo)}–{percent(e.hi)}
                        </td>
                        <td className="p-2">
                          {probabilityLabel(
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
          {data.estimate && (
            <p>
              Média ponderada das pesquisas para {data.candidates[0]?.name}:{" "}
              {data.estimate.weightedPollShare === null
                ? "Indisponível"
                : percent(data.estimate.weightedPollShare)}
              . Probabilidade de empate:{" "}
              {probabilityLabel(data.estimate.probabilityTie)}.
            </p>
          )}
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
function ForecastSeries({ data }: { data: ForecastResponse }) {
  const points = [
    ...data.polls.map((p) => ({
      at: p.publishedAt,
      value: p.share,
      label: `Pesquisa · ${p.institute}`,
      url: p.reportUrl,
      weight: p.weight,
    })),
    ...data.series.map((p) => ({
      at: p.asOf,
      value: p.median,
      label: "Projeção para a eleição",
      url: "",
      weight: null,
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const times = points.map((p) =>
    Date.parse(p.at.length === 10 ? `${p.at}T23:59:59-03:00` : p.at),
  );
  const start = Math.min(...times),
    span = Math.max(1, Math.max(...times) - start);
  return (
    <section className="rounded-lg border bg-white p-5">
      <h2 className="text-lg font-bold">Pesquisas e cortes históricos</h2>
      <p className="mt-2 text-sm">
        Círculos: intenção medida nas pesquisas. Quadrados: mediana projetada
        para a eleição em cada corte. Eixo vertical: parcela de votos de{" "}
        {data.candidates[0]?.name ?? "candidatura ainda não verificada"}.
      </p>
      {!points.length ? (
        <p className="mt-5 rounded border border-dashed p-6">
          Sem dados para gráfico. Não há curva estimada nem série fictícia.
        </p>
      ) : (
        <>
          <svg
            className="mt-4 h-auto w-full"
            viewBox="0 0 600 240"
            role="img"
            aria-label="Pontos de pesquisas e projeções históricas; valores na tabela abaixo"
          >
            <line x1="40" y1="210" x2="570" y2="210" stroke="currentColor" />
            <text x="0" y="25" fontSize="12">
              100%
            </text>
            <text x="5" y="210" fontSize="12">
              0%
            </text>
            {points.map((p, i) => {
              const x = 50 + ((times[i] - start) / span) * 500,
                y = 210 - p.value * 190;
              return p.weight === null ? (
                <rect
                  key={i}
                  x={x - 4}
                  y={y - 4}
                  width="8"
                  height="8"
                  fill="#155392"
                />
              ) : (
                <circle key={i} cx={x} cy={y} r="4" fill="#075536" />
              );
            })}
          </svg>
          <div className="overflow-x-auto">
            <table className="mt-4 w-full text-left text-sm">
              <caption className="text-left font-semibold">
                Valores do gráfico e fontes
              </caption>
              <thead>
                <tr>
                  <th>Data de publicação/corte</th>
                  <th>Tipo e fonte</th>
                  <th>Parcela de votos</th>
                  <th>Peso</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2">{p.at}</td>
                    <th scope="row">
                      {p.url ? (
                        <a className="underline" href={p.url}>
                          {p.label}
                        </a>
                      ) : (
                        p.label
                      )}
                    </th>
                    <td>{percent(p.value)}</td>
                    <td>{p.weight === null ? "—" : percent(p.weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
