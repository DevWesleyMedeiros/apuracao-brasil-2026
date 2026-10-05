'use client';
import { useEffect, useState } from 'react';
import type { Municipality, MunicipalityList } from '@/lib/catalog';
import { loadMunicipalities } from '@/lib/result-client';

export function MunicipalityFilter({ uf, value, onChange }: { uf: string; value: string; onChange: (city: Municipality | null) => void }) {
    const [data, setData] = useState<MunicipalityList | null>(null);
    const [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError(''); setData(null);
        void loadMunicipalities(uf, controller.signal).then(list => {
            if (!controller.signal.aborted) setData(list);
        }).catch(e => {
            if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Falha ao carregar cidades.');
        }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [uf, attempt]);
    const cities = data?.uf === uf ? data.municipalities : [];
    return <div className="min-w-0">
        <label htmlFor="municipality" className="mb-2 block text-sm font-semibold">Cidade</label>
        <select id="municipality" value={value} onChange={event => onChange(cities.find(c => c.code === event.target.value) ?? null)} disabled={loading || !cities.length} aria-describedby="municipality-help" className="h-11 w-full rounded-md border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-60">
            <option value="all">Todo o estado / DF</option>
            {cities.map(city => <option key={city.code} value={city.code}>{city.name}</option>)}
        </select>
        <p id="municipality-help" aria-live="polite" className="mt-2 text-sm text-muted-foreground">{loading ? 'Carregando cidades do TSE…' : error ? error : `${cities.length} cidades disponíveis`}</p>
        {error && <button type="button" className="mt-2 text-sm font-medium text-[#155392] underline" onClick={() => setAttempt(a => a + 1)}>Tentar carregar cidades novamente</button>}
    </div>;
}
