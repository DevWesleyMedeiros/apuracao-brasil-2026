import polls from '../../data/forecast/polls.json';
import candidates from '../../data/forecast/candidates.json';
import contest from '../../data/forecast/contest.json';
import evaluation from '../../data/forecast/evaluation.json';
import baseline from '../../data/forecast/baseline.json';
import snapshot from '../../data/forecast/live-snapshot.json';
import { MODEL_CONFIG, FLAGS } from '../forecast/config';
import { LIVE_CONFIG } from '../forecast/live';
import { buildLiveForecast } from './live-service';
import { buildForecast, type ForecastResponse, type ForecastMode } from './service';

export async function sha256(value: unknown) {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const cache = new Map<string, { expires: number; value: ForecastResponse }>();
const lastLive = new Map<string, ForecastResponse>();
export async function productionForecast(input: { mode: ForecastMode; asOf: string; historical: boolean; cutoffs: string[]; now: number }) {
    // Evaluation references this data hash; including evaluation itself would create a circular hash.
    const dataVersion = await sha256({polls,candidates,contest,baseline,snapshot}), parametersHash = await sha256({pre:MODEL_CONFIG,live:LIVE_CONFIG});
    const key = JSON.stringify({ cycle:'ele2026', year:2026, round:'2', office:'1', scope:'br', contest, mode:input.mode, asOf:input.asOf, cutoffs:input.cutoffs, historical:input.historical, dataVersion, evaluation, parametersHash, flags:FLAGS });
    const previous = cache.get(key);
    if (previous && previous.expires > input.now) return previous.value;
    const data={polls,candidates,contest,evaluation,dataVersion};
    let value = buildForecast({ ...input, data, config:MODEL_CONFIG, parametersHash, flags:FLAGS, computedAt:new Date(input.now).toISOString() });
    if(input.mode==='live' && FLAGS.liveEnabled) {
        const liveKey=await sha256({contest,baseline,polls,candidates,evaluation,parametersHash,flags:FLAGS});
        value=buildLiveForecast({base:value,data,baseline,snapshot,preConfig:MODEL_CONFIG,enabled:FLAGS.liveEnabled,probabilityEnabled:FLAGS.publicProbabilityEnabled},lastLive.get(liveKey));
        if(value.state==='ready'||value.state==='finished') {lastLive.set(liveKey,value);while(lastLive.size>8)lastLive.delete(lastLive.keys().next().value!);}
    }
    if (value.state === 'ready' || value.state === 'finished') {
        cache.set(key,{value,expires:input.now + (input.mode === 'pre' ? 300000 : 15000)});
        while (cache.size>32) cache.delete(cache.keys().next().value!);
    }
    return value;
}
