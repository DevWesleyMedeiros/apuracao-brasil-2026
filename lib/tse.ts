import {
  CONFIG_URL,
  normalizeResult,
  querySelection,
  resolveElection,
  resultUrl,
  type Result,
} from "./election";
import { withDeadline } from "./deadline";
import { REGIONS, type MunicipalityList } from "./catalog";
import {
  InvalidMunicipalityError,
  municipalityConfigUrl,
  normalizeMunicipalities,
  validateMunicipalityFilter,
} from "./municipal";
import { aggregateRegion } from "./regional";
import { electionSelection, type ElectionOptions } from './electoral-context';
type Entry = {
  data?: unknown;
  etag?: string;
  expires: number;
  failure?: string;
  failures: number;
};
// Cache completed, plain JSON only. Worker I/O promises belong to the request that created them and must never survive globally after that request ends.
const cache = new Map<string, Entry>();
const CACHE_MAX_ENTRIES = 128;
const RESULT_MAX_ENTRIES = 128;
const REGION_MAX_ENTRIES = 8;

function getLru<K, V>(map: Map<K, V>, key: K): V | undefined {
  const value = map.get(key);
  if (value !== undefined) {
    map.delete(key);
    map.set(key, value);
  }
  return value;
}

function setLru<K, V>(map: Map<K, V>, key: K, value: V, limit: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > limit) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function removeExpiredFailures(now: number) {
  for (const [url, entry] of cache) {
    // Keep expired data long enough for conditional ETag revalidation.
    // Failure-only backoff entries have no such value and can be removed.
    if (entry.expires <= now && entry.data === undefined) cache.delete(url);
  }
}

let nextFetchAt = 0;
export class TseHttpError extends Error {
  constructor(public status: number, public retryAfter: string | null) { super(`TSE HTTP ${status}${retryAfter ? `; Retry-After: ${retryAfter}` : ''}`); }
}
// Manual collectors need the original bytes for audit hashes. Same pacing/deadline as app reads.
export async function downloadTseFile(url: string, signal?: AbortSignal) {
  if (!url.startsWith('https://resultados.tse.jus.br/oficial/')) throw new Error('Fonte não permitida.');
  const reservedAt = Math.max(Date.now(), nextFetchAt);
  nextFetchAt = reservedAt + 250;
  return withDeadline(async requestSignal => {
    await waitForSlot(Math.max(0, reservedAt - Date.now()), requestSignal);
    const response = await fetch(url, { signal: requestSignal });
    if (!response.ok) throw new TseHttpError(response.status, response.headers.get('retry-after'));
    const rawBytes = new Uint8Array(await response.arrayBuffer());
    let rawText = '', data: unknown = null, parseError = false;
    try { rawText = new TextDecoder('utf-8', {fatal:true}).decode(rawBytes); data = JSON.parse(rawText) as unknown; } catch { parseError = true; }
    return { rawBytes, rawText, data, parseError, url, fetchedAt: new Date().toISOString() };
  }, 12000, signal);
}
function waitForSlot(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export async function cachedJson(url: string, ttl: number, signal?: AbortSignal) {
  const now = Date.now();
  removeExpiredFailures(now);
  const entry = getLru(cache, url);
  if (entry && entry.expires > Date.now()) {
    if (entry.failure) throw new Error(entry.failure);
    return entry.data;
  }
  try {
    const reservedAt = Math.max(Date.now(), nextFetchAt);
    nextFetchAt = reservedAt + 250;
    return await withDeadline(
      async (requestSignal) => {
        await waitForSlot(Math.max(0, reservedAt - Date.now()), requestSignal);
        const response = await fetch(url, {
          headers: entry?.etag ? { "If-None-Match": entry.etag } : {},
          signal: requestSignal,
        });
        if (response.status === 304 && entry?.data) {
          setLru(
            cache,
            url,
            {
              ...entry,
              expires: Date.now() + ttl,
              failure: undefined,
              failures: 0,
            },
            CACHE_MAX_ENTRIES,
          );
          return entry.data;
        }
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "O TSE ainda não disponibilizou este arquivo."
              : response.status === 429 || response.status === 403
                ? "A fonte está temporariamente limitando as consultas."
                : "Não foi possível consultar o TSE agora.",
          );
        const data: unknown = await response.json();
        if (requestSignal.aborted) throw requestSignal.reason;
        setLru(
          cache,
          url,
          {
            data,
            etag: response.headers.get("etag") ?? undefined,
            expires: Date.now() + ttl,
            failures: 0,
          },
          CACHE_MAX_ENTRIES,
        );
        return data;
      },
      12000,
      signal,
      "O TSE não respondeu dentro de 12 segundos. Tente novamente em um minuto.",
    );
  } catch (error) {
    // Cancellation is local to the caller; it must not poison other users.
    if (!signal?.aborted) {
      const failures = (entry?.failures ?? 0) + 1;
      setLru(
        cache,
        url,
        {
          ...entry,
          failures,
          failure:
            error instanceof Error ? error.message : "Fonte indisponível.",
          expires: Date.now() + Math.min(600000, 60000 * 2 ** (failures - 1)),
        },
        CACHE_MAX_ENTRIES,
      );
    }
    throw error;
  }
}
const lastRegion = new Map<string, Result>();
export async function getRegionResult(
  code: string,
  signal?: AbortSignal,
  options: ElectionOptions = {},
): Promise<Result> {
  const region = REGIONS.find((r) => r.code === code);
  if (!region) throw new Error("Região inválida.");
  const selection = electionSelection(options);
  const config = await cachedJson(CONFIG_URL, 3600000, signal);
  const election = resolveElection(config, "1", options);
  const key = JSON.stringify({ ...selection, election, office: '1', region: code });
  try {
    // Only completed JSON is shared; all promises remain local to this request.
    const results = await Promise.all(
      region.states.map(async (uf) => {
        const url = resultUrl(uf, "1", election);
        const raw = await cachedJson(url, 30000, signal);
        return normalizeResult(raw, uf, "1", election, url, undefined, options);
      }),
    );
    const result = aggregateRegion(code, results);
    setLru(lastRegion, key, result, REGION_MAX_ENTRIES);
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    const previous = getLru(lastRegion, key);
    if (previous)
      return {
        ...previous,
        stale: true,
        message:
          "Não foi possível consultar todas as UFs. Exibindo a última soma completa da região.",
      };
    throw error;
  }
}
const lastGood = new Map<string, Result>();
export async function getMunicipalities(
  uf: string,
  signal?: AbortSignal,
  options: ElectionOptions = {},
  resolvedElection?: string,
): Promise<MunicipalityList> {
  querySelection(uf, "1");
  if (uf === "br" || uf === "zz")
    throw new InvalidMunicipalityError("Selecione uma UF brasileira.");
  const election = resolvedElection ?? resolveElection(await cachedJson(CONFIG_URL, 3600000, signal), "1", options);
  const sourceUrl = municipalityConfigUrl(election);
  const raw = await cachedJson(sourceUrl, 3600000, signal);
  return {
    uf,
    round: electionSelection(options).round,
    election,
    sourceUrl,
    municipalities: normalizeMunicipalities(raw, uf),
  };
}
export async function getResult(
  rawUf: string,
  rawOffice: string,
  signal?: AbortSignal,
  municipalityCode?: string,
  options: ElectionOptions = {},
): Promise<Result> {
  const { uf, office } = querySelection(rawUf, rawOffice, options);
  if (municipalityCode) validateMunicipalityFilter(uf, municipalityCode);
  const selection = electionSelection(options);
  const config = await cachedJson(CONFIG_URL, 3600000, signal);
  const election = resolveElection(config, office, options);
  const key = JSON.stringify({ ...selection, election, uf, office, municipalityCode });
  try {
    const municipality = municipalityCode
      ? (await getMunicipalities(uf, signal, options, office === '1' ? election : undefined)).municipalities.find(
          (c) => c.code === municipalityCode,
        )
      : undefined;
    if (municipalityCode && !municipality)
      throw new InvalidMunicipalityError(
        "A cidade não pertence à UF selecionada.",
      );
    const url = resultUrl(uf, office, election, municipalityCode);
    const raw = await cachedJson(url, 30000, signal);
    const data = normalizeResult(raw, uf, office, election, url, municipality, options);
    setLru(lastGood, key, data, RESULT_MAX_ENTRIES);
    return data;
  } catch (error) {
    if (error instanceof InvalidMunicipalityError || signal?.aborted)
      throw error;
    const previous = getLru(lastGood, key);
    if (previous)
      return {
        ...previous,
        stale: true,
        message: error instanceof Error ? error.message : "Fonte indisponível.",
      };
    throw error;
  }
}
