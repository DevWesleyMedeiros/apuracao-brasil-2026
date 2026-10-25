import polls from '../../data/forecast/polls.json';
import candidates from '../../data/forecast/candidates.json';
import contest from '../../data/forecast/contest.json';
import evaluation from '../../data/forecast/evaluation.json';
import { configuredReader, readBundle, readEvaluation } from './storage';
import { createForecastRuntime, type ForecastRequest } from './production-runtime';
export { sha256 } from '../forecast/identity';

const forecast=createForecastRuntime();
export async function productionForecast(input:ForecastRequest) {
    const reader=await configuredReader();
    let product=null,block='Armazenamento dinâmico não configurado.',officialFinished=false;
    if(reader) {
        try {const bundle=await readBundle(reader);product=bundle.statistical;block=bundle.statisticalBlock??'Conjunto estatístico indisponível.';officialFinished=bundle.official.state==='finished';}
        catch {block='Armazenamento dinâmico ausente ou inválido; nenhuma atualização estatística foi autorizada.';}
    }
    const activeEvaluation=await readEvaluation(reader,evaluation,input.mode);
    return forecast(input,{polls,candidates,contest,evaluation:activeEvaluation,product,block,officialFinished});
}
