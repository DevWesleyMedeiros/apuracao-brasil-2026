import { CONFIG_URL, normalizeResult, querySelection, resolveElection, resultUrl, type Result } from './election';
import { withDeadline } from './deadline';
import { REGIONS, type MunicipalityList } from './catalog';
import { InvalidMunicipalityError, municipalityConfigUrl, normalizeMunicipalities, validateMunicipalityFilter } from './municipal';
import { aggregateRegion } from './regional';
type Entry = { data?: unknown; etag?: string; expires: number; failure?: string; failures: number };
// Cache completed, plain JSON only. Worker I/O promises belong to the request
// that created them and must never survive globally after that request ends.
const cache = new Map<string, Entry>();
let nextFetchAt = 0;
function waitForSlot(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal.aborted) { reject(signal.reason); return; }
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
        signal.addEventListener('abort', abort, { once: true });
    });
}
async function cachedJson(url: string, ttl: number, signal?: AbortSignal) {
    const entry = cache.get(url);
    if (entry && entry.expires > Date.now()) {
        if (entry.failure) throw new Error(entry.failure);
        return entry.data;
    }
    try {
        const reservedAt = Math.max(Date.now(), nextFetchAt);
        nextFetchAt = reservedAt + 250;
        return await withDeadline(async requestSignal => {
            await waitForSlot(Math.max(0, reservedAt - Date.now()), requestSignal);
            const response = await fetch(url, {
                headers: entry?.etag ? { 'If-None-Match': entry.etag } : {},
                signal: requestSignal,
            });
            if (response.status === 304 && entry?.data) {
                cache.set(url, { ...entry, expires: Date.now() + ttl, failure: undefined, failures: 0 });
                return entry.data;
            }
            if (!response.ok) throw new Error(response.status === 404
                ? 'O TSE ainda não disponibilizou este arquivo.'
                : response.status === 429 || response.status === 403
                    ? 'A fonte está temporariamente limitando as consultas.'
                    : 'Não foi possível consultar o TSE agora.');
            const data: unknown = await response.json();
            if (requestSignal.aborted) throw requestSignal.reason;
            cache.set(url, { data, etag: response.headers.get('etag') ?? undefined, expires: Date.now() + ttl, failures: 0 });
            return data;
        }, 12000, signal, 'O TSE não respondeu dentro de 12 segundos. Tente novamente em um minuto.');
    } catch (error) {
        // Cancellation is local to the caller; it must not poison other users.
        if (!signal?.aborted) {
            const failures = (entry?.failures ?? 0) + 1;
            cache.set(url, { ...entry, failures, failure: error instanceof Error ? error.message : 'Fonte indisponível.', expires: Date.now() + Math.min(600000, 60000 * 2 ** (failures - 1)) });
        }
        throw error;
    }
}
const lastRegion = new Map<string, Result>();
export async function getRegionResult(code: string, signal?: AbortSignal): Promise<Result> {
    const region = REGIONS.find(r => r.code === code);
    if (!region) throw new Error('Região inválida.');
    try {
        const config = await cachedJson(CONFIG_URL, 3600000, signal);
        const election = resolveElection(config, '1');
        // Only completed JSON is shared; all promises remain local to this request.
        const results = await Promise.all(region.states.map(async uf => {
            const url = resultUrl(uf, '1', election);
            const raw = await cachedJson(url, 30000, signal);
            return normalizeResult(raw, uf, '1', election, url);
        }));
        const result = aggregateRegion(code, results);
        lastRegion.set(code, result);
        return result;
    } catch (error) {
        if (signal?.aborted) throw error;
        const previous = lastRegion.get(code);
        if (previous) return { ...previous, stale: true, message: 'Não foi possível consultar todas as UFs. Exibindo a última soma completa da região.' };
        throw error;
    }
}
const lastGood = new Map<string, Result>();
export async function getMunicipalities(uf: string, signal?: AbortSignal): Promise<MunicipalityList> {
    querySelection(uf, '1');
    if (uf === 'br' || uf === 'zz') throw new InvalidMunicipalityError('Selecione uma UF brasileira.');
    const config = await cachedJson(CONFIG_URL, 3600000, signal);
    const election = resolveElection(config, '1');
    const sourceUrl = municipalityConfigUrl(election);
    const raw = await cachedJson(sourceUrl, 3600000, signal);
    return { uf, election, sourceUrl, municipalities: normalizeMunicipalities(raw, uf) };
}
export async function getResult(rawUf: string, rawOffice: string, signal?: AbortSignal, municipalityCode?: string): Promise<Result> {
    const { uf, office } = querySelection(rawUf, rawOffice);
    if (municipalityCode) validateMunicipalityFilter(uf, municipalityCode);
    const key = `${uf}:${office}:${municipalityCode ?? ''}`;
    try {
        const config = await cachedJson(CONFIG_URL, 3600000, signal);
        const election = resolveElection(config, office);
        const municipality = municipalityCode ? (await getMunicipalities(uf, signal)).municipalities.find(c => c.code === municipalityCode) : undefined;
        if (municipalityCode && !municipality) throw new InvalidMunicipalityError('A cidade não pertence à UF selecionada.');
        const url = resultUrl(uf, office, election, municipalityCode);
        const raw = await cachedJson(url, 30000, signal);
        const data = normalizeResult(raw, uf, office, election, url, municipality);
        lastGood.set(key, data);
        return data;
    }
    catch (error) {
        if (error instanceof InvalidMunicipalityError || signal?.aborted) throw error;
        const previous = lastGood.get(key);
        if (previous)
            return { ...previous, stale: true, message: error instanceof Error ? error.message : 'Fonte indisponível.' };
        throw error;
    }
}
