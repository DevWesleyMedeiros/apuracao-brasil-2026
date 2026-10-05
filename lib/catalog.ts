export const STATES = [['ac', 'Acre'], ['al', 'Alagoas'], ['ap', 'Amapá'], ['am', 'Amazonas'], ['ba', 'Bahia'], ['ce', 'Ceará'], ['df', 'Distrito Federal'], ['es', 'Espírito Santo'], ['go', 'Goiás'], ['ma', 'Maranhão'], ['mt', 'Mato Grosso'], ['ms', 'Mato Grosso do Sul'], ['mg', 'Minas Gerais'], ['pa', 'Pará'], ['pb', 'Paraíba'], ['pr', 'Paraná'], ['pe', 'Pernambuco'], ['pi', 'Piauí'], ['rj', 'Rio de Janeiro'], ['rn', 'Rio Grande do Norte'], ['rs', 'Rio Grande do Sul'], ['ro', 'Rondônia'], ['rr', 'Roraima'], ['sc', 'Santa Catarina'], ['sp', 'São Paulo'], ['se', 'Sergipe'], ['to', 'Tocantins']] as const;
export const OFFICES = [['1', 'Presidente'], ['3', 'Governador'], ['5', 'Senador'], ['6', 'Deputado federal'], ['7', 'Deputado estadual']] as const;
export const REGIONS = [
    { code: 'sul', name: 'Sul', states: ['pr', 'rs', 'sc'] },
    { code: 'sudeste', name: 'Sudeste', states: ['es', 'mg', 'rj', 'sp'] },
    { code: 'centro-oeste', name: 'Centro-Oeste', states: ['df', 'go', 'ms', 'mt'] },
    { code: 'norte', name: 'Norte', states: ['ac', 'am', 'ap', 'pa', 'ro', 'rr', 'to'] },
    { code: 'nordeste', name: 'Nordeste', states: ['al', 'ba', 'ce', 'ma', 'pb', 'pe', 'pi', 'rn', 'se'] },
] as const;
export type RegionCode = 'all' | typeof REGIONS[number]['code'];
export type Municipality = { code: string; name: string };
export type MunicipalityList = { uf: string; election: string; sourceUrl: string; municipalities: Municipality[] };
export function statesInRegion(region: RegionCode) {
    if (region === 'all') return [...STATES];
    const selected = REGIONS.find(r => r.code === region);
    return STATES.filter(([code]) => selected?.states.some(state => state === code));
}
export function selectRegionUf(region: RegionCode, currentUf: string) {
    const states = statesInRegion(region);
    return states.some(([code]) => code === currentUf) ? currentUf : states[0][0];
}
export type Candidate = {
    id: string;
    number: string;
    name: string;
    party: string;
    votes: number | null;
    percent: number | null;
    status: string;
    destination: string;
    elected: boolean;
    photoUrl: string | null;
};
export type Result = {
    office: string;
    uf: string;
    title: string;
    election: string;
    sourceUrl: string;
    generatedAt: string;
    totalizedAt: string | null;
    checkedAt: string;
    state: 'waiting' | 'partial' | 'finished' | 'withheld';
    seats: number;
    candidates: Candidate[];
    sections: {
        total: number;
        count: number;
        percent: number;
    };
    votes: {
        valid: number;
        blank: number;
        null: number;
        legend: number | null;
    };
    stale?: boolean;
    message?: string;
    region?: Exclude<RegionCode, 'all'>;
    sources?: { uf: string; url: string; generatedAt: string }[];
    municipality?: Municipality;
};
