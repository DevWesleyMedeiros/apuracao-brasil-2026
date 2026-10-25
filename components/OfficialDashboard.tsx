"use client";
import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Globe2,
  Landmark,
  RefreshCw,
  Search,
  Vote,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import {
  OFFICES,
  STATES,
  REGIONS,
  statesInRegion,
  selectRegionUf,
} from "@/lib/catalog";
import type { RegionCode, Municipality, Result } from "@/lib/catalog";
import { MunicipalityFilter } from "@/components/MunicipalityFilter";
import { CandidatePhoto } from "@/components/CandidatePhoto";
import { loadElectionResult } from "@/lib/result-client";
import { initialRound as resolveInitialRound, initialOfficialQuery, completeOfficialQuery, shouldRefreshOfficial } from '@/lib/official-dashboard';
const ElectionCharts = dynamic(() => import("@/components/ElectionCharts"), {
  loading: () => (
    <Skeleton
      className="mb-6 h-80 w-full rounded-lg"
      aria-label="Carregando gráficos"
    />
  ),
});
const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const number = (n: number | null | undefined) =>
  n == null ? "—" : numberFormatter.format(n);
const percent = (n: number | null | undefined) =>
  n == null
    ? "—"
    : `${percentFormatter.format(n)}%`;
const statuses = {
  waiting: "Aguardando apuração",
  partial: "Apuração parcial",
  finished: "Totalização final",
  withheld: "Votação não divulgada",
};
type Scope = "national" | "state" | "abroad";
const regionByCode = new Map<string, (typeof REGIONS)[number]>(
  REGIONS.map((region) => [region.code, region]),
);
const stateNames = new Map<string, string>(STATES);
const officeNames = new Map<string, string>(OFFICES);
const scopeUf = { national: "br", abroad: "zz" };
const voteLabels = [
  ["valid", "Votos válidos"],
  ["blank", "Votos em branco"],
  ["null", "Votos nulos"],
  ["legend", "Votos de legenda"],
] as const;

function officeName(office: string, uf: string) {
  if (office === "7" && uf === "df") return "Deputado distrital";
  return officeNames.get(office);
}

function locationName(
  scope: Scope,
  uf: string,
  region: Result["region"],
  city: Municipality | undefined,
) {
  if (scope === "abroad") return "Exterior";
  if (scope === "state") {
    if (city) return `${city.name} / ${uf.toUpperCase()}`;
    return stateNames.get(uf) ?? uf;
  }
  if (region) return `Região ${regionByCode.get(region)?.name}`;
  return "Brasil + exterior";
}

function resultStatus(result: Result) {
  if (result.state !== "finished") return statuses[result.state];
  if (result.municipality) return "Apuração concluída na cidade";
  if (result.region) return "Apuração concluída na região";
  return statuses.finished;
}

function sectionDescription(result: Result) {
  if (result.state === "waiting")
    return "O arquivo oficial está disponível; a totalização ainda não começou.";
  if (result.state === "withheld")
    return "O TSE ainda não liberou a votação desta abrangência.";
  return `${number(result.sections.count)} de ${number(result.sections.total)} seções totalizadas`;
}

function resultDisclaimer(result: Result) {
  if (result.region)
    return "Soma calculada pelo painel a partir dos arquivos oficiais das UFs. Percentuais sobre os votos válidos da região; seções totalizadas sobre o total de seções. Arquivos podem ter horários diferentes. Este recorte não determina a situação eleitoral dos candidatos.";
  if (result.municipality)
    return "Votação registrada nesta cidade para os cargos das eleições gerais. A classificação municipal não determina quem foi eleito; a disputa é estadual ou nacional.";
  return "Percentuais e situações reproduzem o TSE. A ordem por votos não determina eleitos para cargos proporcionais.";
}

const MemoElectionCharts = memo(ElectionCharts);

export default function OfficialDashboard({ initialRound }: { initialRound: '1' | '2' }) {
  const [round, setRound] = useState(initialRound);
  const changeRound = (value: '1' | '2') => {
    if (value === round) return;
    const url = new URL(window.location.href);
    url.searchParams.set('round', value);
    window.history.pushState(null, '', url);
    setRound(value);
  };
  useEffect(() => {
    const onPop = () => {
      const values = new URLSearchParams(window.location.search).getAll('round');
      setRound(resolveInitialRound(values.length === 1 ? values[0] : values.length ? values : undefined, Date.now()));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const [citySelection, setCitySelection] = useState<{
    uf: string;
    city: Municipality;
  } | null>(null);
  const [nationalRegion, setNationalRegion] = useState<RegionCode>("all");
  const [region, setRegion] = useState<RegionCode>("all");
  const availableStates = useMemo(() => statesInRegion(region), [region]);
  const changeRegion = (value: string) => {
    const next = value as RegionCode;
    setRegion(next);
    setCitySelection(null);
    setUf((current) => selectRegionUf(next, current));
  };
  const [scope, setScope] = useState<Scope>("national"),
    [uf, setUf] = useState("rs"),
    [office, setOffice] = useState("1");
  const [auto, setAuto] = useState(true);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0),
    busy = useRef(false),
    lastAttempt = useRef(0);
  const selectedCity =
    scope === "state" && citySelection?.uf === uf
      ? citySelection.city
      : undefined;
  const selectedMunicipality = selectedCity?.code;
  const selectedRegion =
    scope === "national" && nationalRegion !== "all"
      ? nationalRegion
      : undefined;
  const selectedUf = scope === "state" ? uf : scopeUf[scope];
  const selectedOffice = scope === "state" && round === '1' ? office : "1";
  const location = locationName(scope, uf, selectedRegion, selectedCity);
  const queryKey = JSON.stringify([
    round,
    selectedUf,
    selectedOffice,
    selectedRegion,
    selectedMunicipality,
  ]);
  const [query, setQuery] = useState(() => initialOfficialQuery(queryKey));
  // Reset before committing a new territory, not in a post-render effect.
  if (query.key !== queryKey) setQuery(initialOfficialQuery(queryKey));
  const currentQuery = query.key === queryKey ? query : initialOfficialQuery(queryKey);
  const { result, loading, error, lastCheck } = currentQuery;
  const load = useCallback(
    async () => {
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const id = ++sequence.current;
      busy.current = true;
      lastAttempt.current = Date.now();
      try {
        const data = await loadElectionResult(
          selectedUf,
          selectedOffice,
          ctrl.signal,
          30000,
          selectedRegion,
          selectedMunicipality,
          { round },
        );
        if (id !== sequence.current || ctrl.signal.aborted) return;
        const lastCheck = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });
        setQuery(current => completeOfficialQuery(current, queryKey, { result: data, lastCheck }));
      } catch (e) {
        if (id !== sequence.current || ctrl.signal.aborted) return;
        setQuery(current => completeOfficialQuery(current, queryKey, { error: e instanceof Error ? e.message : 'Falha na consulta.' }));
      } finally {
        if (id === sequence.current) busy.current = false;
      }
    },
    [selectedUf, selectedOffice, selectedRegion, selectedMunicipality, queryKey, round],
  );
  const refresh = useCallback(() => {
    if (busy.current) return;
    setQuery((current) => ({ ...current, loading: true }));
    void load();
  }, [load]);
  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const refreshIfDue = () => {
      if (shouldRefreshOfficial({ now: Date.now(), lastAttempt: lastAttempt.current, hidden: document.hidden, busy: busy.current, auto })) refresh();
    };
    const timer = setInterval(refreshIfDue, 60000);
    document.addEventListener('visibilitychange', refreshIfDue);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refreshIfDue); };
  }, [auto, refresh]);
  const snapshot = useRef({
    round,
    scope,
    municipality: selectedMunicipality,
    region: selectedRegion,
    uf: selectedUf,
    office: selectedOffice,
    result,
    error,
    loading,
  });
  useEffect(() => {
    snapshot.current = {
      round,
      scope,
      municipality: selectedMunicipality,
      region: selectedRegion,
      uf: selectedUf,
      office: selectedOffice,
      result,
      error,
      loading,
    };
  }, [
    round,
    scope,
    selectedMunicipality,
    selectedRegion,
    selectedUf,
    selectedOffice,
    result,
    error,
    loading,
  ]);
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: "read_election_results",
            description:
              "Leia os resultados atualmente exibidos, incluindo abrangência, fonte e atualização.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: (input: unknown) => {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error("Entrada inválida.");
              return snapshot.current;
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Unsupported browser: dashboard works normally. */
    }
    return () => lifecycle.abort();
  }, []);
  const hidden = result?.state === "withheld";
  return (
    <div className="min-h-screen">
      <header className="border-t-4 border-yellow-400 bg-[#075536] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <Vote className="size-8 text-yellow-300" />
            <div>
              <span className="text-lg font-bold tracking-tight">
                APURAÇÃO BRASIL
              </span>
              <p className="text-sm text-green-100">Eleições gerais 2026</p>
            </div>
          </div>
          <span className="rounded-full border border-white/25 px-3 py-1 text-sm">
            {round === '1' ? '1º turno · 04 out' : '2º turno · 25 out'}
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">
        <nav aria-label="Painéis" className="mb-5 flex gap-5"><Link href="/" aria-current="page" className="underline">Apuração oficial</Link><Link href="/projecao" className="underline">Projeção estatística</Link></nav>
        <label className="mb-6 block font-semibold">Turno da apuração{' '}
          <select className="mt-2 max-w-full rounded border bg-white p-2 sm:ml-2" value={round} onChange={event => changeRound(event.target.value as '1' | '2')}>
            <option value="1">1º turno · 04/10/2026</option><option value="2">2º turno · 25/10/2026 · Presidente</option>
          </select>
        </label>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Acompanhe a apuração
            </h1>
            <p className="mt-2 text-muted-foreground">
              Votos e candidaturas · fonte: Tribunal Superior Eleitoral
            </p>
          </div>
          <a
            className="flex items-center gap-2 text-sm font-medium text-[#155392] hover:underline"
            href="https://resultados.tse.jus.br/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Resultados oficiais <ExternalLink className="size-4" />
          </a>
        </div>
        <Tabs
          value={scope}
          onValueChange={(v) => setScope(v as Scope)}
          className="gap-5"
        >
          <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent p-0 sm:w-auto">
            <TabsTrigger value="national" className="scope-tab">
              <Landmark />
              Nacional
            </TabsTrigger>
            <TabsTrigger value="state" className="scope-tab">
              Por região / estado
            </TabsTrigger>
            <TabsTrigger value="abroad" className="scope-tab">
              <Globe2 />
              Exterior
            </TabsTrigger>
          </TabsList>
          <TabsContent value="national">
            <div className="rounded-lg border bg-card p-4">
              <label
                id="national-region-label"
                htmlFor="national-region"
                className="mb-2 block text-sm font-semibold"
              >
                Abrangência para presidente
              </label>
              <Select
                value={nationalRegion}
                onValueChange={(v) => setNationalRegion(v as RegionCode)}
              >
                <SelectTrigger
                  id="national-region"
                  aria-labelledby="national-region-label"
                  className="h-11 w-full bg-white sm:w-80"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="all">Brasil + exterior</SelectItem>
                  {REGIONS.map((r) => (
                    <SelectItem value={r.code} key={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-3 text-sm text-muted-foreground">
                {selectedRegion
                  ? `Soma dos votos para presidente nas ${regionByCode.get(selectedRegion)?.states.length} UFs da região. Não inclui o exterior.`
                  : "Presidente · total nacional, incluindo os votos do exterior."}
              </p>
            </div>
          </TabsContent>
          <TabsContent value="abroad">
            <p className="text-sm text-muted-foreground">
              Presidente · somente votos registrados no exterior (ZZ).
            </p>
          </TabsContent>
          <TabsContent value="state">
            <div className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label
                  className="mb-2 block text-sm font-semibold"
                  id="region-label"
                  htmlFor="region"
                >
                  Região
                </label>
                <Select value={region} onValueChange={changeRegion}>
                  <SelectTrigger
                    id="region"
                    aria-labelledby="region-label"
                    className="h-11 w-full bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="all">Todas as regiões</SelectItem>
                    {REGIONS.map((r) => (
                      <SelectItem value={r.code} key={r.code}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="shrink-0">
                <label
                  className="mb-2 block text-sm font-semibold"
                  id="state-label"
                  htmlFor="state"
                >
                  Estado / Distrito Federal
                </label>
                <Select
                  value={uf}
                  onValueChange={(value) => {
                    setCitySelection(null);
                    setUf(value);
                  }}
                >
                  <SelectTrigger
                    id="state"
                    aria-labelledby="state-label"
                    className="h-11 w-full bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {availableStates.map(([code, name]) => (
                      <SelectItem value={code} key={code}>
                        {name} ({code.toUpperCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <MunicipalityFilter
                key={`${uf}:${round}`}
                uf={uf}
                round={round}
                value={selectedMunicipality ?? "all"}
                onChange={(city) =>
                  setCitySelection(city ? { uf, city } : null)
                }
              />
              <div className="min-w-0 flex-1">
                <label
                  className="mb-2 block text-sm font-semibold"
                  id="office-label"
                  htmlFor="office"
                >
                  Cargo
                </label>
                <Select value={round === '2' ? '1' : office} onValueChange={setOffice}>
                  <SelectTrigger
                    id="office"
                    aria-labelledby="office-label"
                    className="h-11 w-full bg-white"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {OFFICES.filter(([code]) => round === '1' || code === '1').map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {code === "7" ? officeName(code, uf) : name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-4">
                A região filtra os estados; o estado filtra as cidades.
                Selecione uma cidade para ver sua votação ou mantenha “Todo o
                estado / DF” para o total da UF.
              </p>
            </div>
          </TabsContent>
        </Tabs>
        <div className="my-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-bold">
              {result?.title ?? officeName(selectedOffice, uf)}
            </h2>
            <span className="rounded-md bg-[#e6eef8] px-2.5 py-1 text-sm font-medium text-[#174e83]">
              {location}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch id="auto" checked={auto} onCheckedChange={setAuto} />
              <label htmlFor="auto" className="text-sm">
                Atualizar a cada 60s
              </label>
            </div>
            <button
              disabled={loading}
              onClick={refresh}
              className="action-button"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
              {loading ? "Consultando…" : "Atualizar"}
            </button>
          </div>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
          >
            <strong>Consulta indisponível.</strong> {error}{" "}
            {result
              ? "Os números abaixo pertencem à última consulta bem-sucedida."
              : "Nenhum resultado foi carregado."}
          </div>
        )}
        {result?.stale && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
          >
            <strong>Dados da última consulta.</strong> {result.message} A fonte
            pode ter resultados mais recentes.
          </div>
        )}
        {loading && !result && (
          <div
            aria-label="Carregando resultados"
            className="grid grid-cols-2 gap-4 lg:grid-cols-4"
          >
            {[1, 2, 3, 4].map((i) => (
              <Skeleton className="h-32 rounded-lg" key={i} />
            ))}
          </div>
        )}
        {result && (
          <>
            <section className="mb-5 rounded-lg border border-green-200 bg-white p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-[#075536]">
                    {result.state === "finished" && (
                      <CheckCheck className="size-5" />
                    )}
                    {resultStatus(result)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sectionDescription(result)}
                  </p>
                </div>
                <strong className="text-2xl tabular-nums text-[#075536]">
                  {hidden ? "—" : percent(result.sections.percent)}
                </strong>
              </div>
              <Progress
                value={hidden ? 0 : result.sections.percent}
                aria-label="Percentual de seções totalizadas"
                className="mt-4 h-2 bg-green-100 **:data-[slot=progress-indicator]:bg-[#098552]"
              />
            </section>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {voteLabels.map(([key, label]) => (
                <div key={label} className="rounded-lg border bg-card p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    {hidden ? "—" : number(result.votes[key])}
                  </p>
                </div>
              ))}
            </div>
            <MemoElectionCharts result={result} />
            <CandidateTable key={queryKey} result={result} />
            <div className="mt-5 space-y-2 text-sm text-muted-foreground">
              {result.sources ? (
                <div>
                  <p className="font-medium">
                    Arquivos oficiais usados na soma regional (horários do TSE):
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {result.sources.map((source) => (
                      <li key={source.uf}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#155392] underline"
                        >
                          {source.uf.toUpperCase()} · {source.generatedAt}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p>
                  Arquivo gerado em {result.generatedAt}.{" "}
                  {result.totalizedAt && `Totalização: ${result.totalizedAt}.`}{" "}
                  Horários informados pelo TSE.
                </p>
              )}
              <p>
                Última consulta no navegador: {lastCheck || "—"} (Brasília).{" "}
                <a
                  href={result.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#155392] underline"
                >
                  {result.region
                    ? "Resultados oficiais"
                    : "Ver arquivo de origem"}
                </a>
              </p>
              {result.collectionId && <p>
                Coleta nacional: <span title={result.collectionId}>{result.collectionId.slice(0, 12)}</span>.{" "}
                Arquivo obtido em {result.fetchedAt}; última tentativa do coletor: {result.checkedAt}.{" "}
                Horários ISO com fuso; consultar novamente não altera o horário da fonte.
              </p>}
              {result.state === "waiting" && (
                <p>
                  Zeros correspondem ao arquivo oficial anterior à apuração; não
                  representam o resultado da eleição.
                </p>
              )}
              <p>{resultDisclaimer(result)}</p>
              {selectedOffice === "5" && (
                <p>
                  Senador: duas vagas em 2026. A votação para o cargo não
                  corresponde ao número de eleitores.
                </p>
              )}
            </div>
          </>
        )}
        {!loading && !result && (
          <section className="rounded-lg border border-dashed bg-white p-10 text-center">
            <Vote className="mx-auto mb-4 size-9 text-[#075536]" />
            <h3 className="text-lg font-semibold">Aguardando dados da fonte</h3>
            <p className="mt-2 text-muted-foreground">
              A divulgação da apuração está prevista para depois das 17h de
              Brasília.
              <br />O painel tentará novamente se a atualização automática
              estiver ativada.
            </p>
          </section>
        )}
      </main>
      <footer className="mx-auto mt-4 max-w-6xl border-t px-5 py-6 text-sm text-muted-foreground">
        Painel independente, sem vínculo com a Justiça Eleitoral. Dados públicos
        do TSE · {round}º turno de 2026.
      </footer>
    </div>
  );
}

const CandidateTable = memo(function CandidateTable({
  result,
}: {
  result: Result;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const searchIndex = useMemo(
    () =>
      result.candidates.map((candidate) => ({
        candidate,
        text: `${candidate.name} ${candidate.party} ${candidate.number}`.toLocaleLowerCase("pt-BR"),
      })),
    [result.candidates],
  );
  const filtered = useMemo(() => {
    if (!search) return result.candidates;
    const term = search.toLocaleLowerCase("pt-BR");
    const matches: Result["candidates"] = [];
    for (const { candidate, text } of searchIndex) {
      if (text.includes(term)) matches.push(candidate);
    }
    return matches;
  }, [result.candidates, searchIndex, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * 20, safePage * 20 + 20);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b p-5">
        <div>
          <h3 className="text-lg font-bold">Candidaturas</h3>
          <p className="text-sm text-muted-foreground">
            {result.candidates.length} candidatos · {number(result.seats)}{" "}
            {result.seats === 1 ? "vaga" : "vagas"}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <input
            id="candidate-search"
            aria-label="Buscar candidato, partido ou número"
            className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder="Nome, partido ou número"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="pl-5">Candidato / partido</TableHead>
            <TableHead className="text-right">Votos</TableHead>
            <TableHead className="pr-5 text-right">
              {result.region ? "% na região" : "% TSE"}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="min-w-60 py-4 pl-5">
                <div className="flex items-start gap-3">
                  <CandidatePhoto
                    key={`${result.election}:${c.id}`}
                    name={c.name}
                    url={c.photoUrl}
                  />
                  <div className="min-w-0">
                    <p className="whitespace-normal font-semibold">{c.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.party} · {c.number}
                    </p>
                    {c.status && (
                      <p
                        className={`mt-1 whitespace-normal text-sm ${c.elected ? "font-semibold text-green-800" : "text-muted-foreground"}`}
                      >
                        {c.status}
                      </p>
                    )}
                    {c.destination && (
                      <p className="mt-1 whitespace-normal text-sm text-muted-foreground">
                        {c.destination}
                      </p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {number(c.votes)}
              </TableCell>
              <TableCell className="pr-5 text-right">
                <span className="font-semibold tabular-nums">
                  {percent(c.percent)}
                </span>
                <div
                  aria-hidden="true"
                  className="mt-2 ml-auto h-1 w-16 overflow-hidden rounded-full bg-green-100 sm:w-28"
                >
                  <div
                    className="h-full bg-[#098552]"
                    style={{ width: `${Math.min(100, c.percent ?? 0)}%` }}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!visible.length && (
        <p className="p-8 text-center text-muted-foreground">
          {search
            ? "Nenhum candidato corresponde à busca."
            : "Nenhuma candidatura disponível neste arquivo."}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {filtered.length
            ? `${safePage * 20 + 1}–${Math.min((safePage + 1) * 20, filtered.length)} de ${filtered.length}`
            : "0 candidatos"}
        </p>
        <nav aria-label="Páginas de candidatos" className="flex items-center gap-3">
          <button
            className="action-button"
            aria-label="Página anterior"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm">{safePage + 1} / {pages}</span>
          <button
            className="action-button"
            aria-label="Próxima página"
            disabled={safePage + 1 >= pages}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      </div>
    </section>
  );
});
