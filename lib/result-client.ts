import type { Result, MunicipalityList } from './catalog';
import { withDeadline } from './deadline';

export async function loadElectionResult(uf: string, office: string, signal: AbortSignal, timeoutMs = 30000, region?: string, municipality?: string): Promise<Result> {
  return withDeadline(async requestSignal => {
    const response = await fetch(`/api/results?uf=${encodeURIComponent(uf)}&office=${encodeURIComponent(office)}${region ? `&region=${encodeURIComponent(region)}` : ''}${municipality ? `&municipality=${encodeURIComponent(municipality)}` : ''}`, {
      signal: requestSignal, cache: 'no-store',
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('O servidor não retornou os resultados. Tente atualizar novamente.');
    }
    const payload = await response.json() as Result & { message?: string };
    if (!response.ok) throw new Error(payload.message || 'Não foi possível carregar a apuração.');
    if (!payload || !Array.isArray(payload.candidates) || !payload.sections || !payload.votes) {
      throw new Error('O servidor retornou uma resposta incompleta. Tente novamente.');
    }
    return payload;
  }, timeoutMs, signal);
}
export async function loadMunicipalities(uf: string, signal: AbortSignal, timeoutMs = 30000): Promise<MunicipalityList> {
    return withDeadline(async requestSignal => {
        const response = await fetch(`/api/municipalities?uf=${encodeURIComponent(uf)}`, { signal: requestSignal });
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Não foi possível carregar as cidades.');
        const data = await response.json() as MunicipalityList & { message?: string };
        if (!response.ok) throw new Error(data.message || 'Não foi possível carregar as cidades.');
        if (data.uf !== uf || !Array.isArray(data.municipalities) || !data.municipalities.every(c => /^\d{5}$/.test(c.code) && typeof c.name === 'string')) throw new Error('Lista de cidades em formato inesperado.');
        return data;
    }, timeoutMs, signal);
}
