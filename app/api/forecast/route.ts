import { productionForecast } from '@/lib/forecast-server/production';
import { forecastQuery } from '@/lib/forecast-server/query';
import { withDeadline } from '@/lib/deadline';
export async function GET(request: Request) {
    const started = Date.now();
    let query;
    try { query = forecastQuery(new URL(request.url).searchParams, started); }
    catch (error) { return Response.json({message:error instanceof Error ? error.message : 'Consulta inválida.'},{status:400,headers:{'Cache-Control':'no-store'}}); }
    try {
        const result = await withDeadline(() => productionForecast(query), 10000, request.signal);
        console.info('[forecast]', {mode:query.mode,state:result.state,elapsedMs:Date.now()-started});
        // Authorization can be revoked independently of the observations.
        return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    } catch {
        console.warn('[forecast] unavailable');
        return Response.json({message:'Projeção indisponível. A apuração oficial permanece independente.'},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
    }
}
