import { configuredReader, readOfficialSnapshot } from './storage';
import { timestamp } from '../forecast/types';
import { collectionStatusSchema } from './artifacts';

export async function storedOfficialResult(now:number) {
    const reader=await configuredReader();
    if(!reader)return null;
    let official;
    try {official=await readOfficialSnapshot(reader);}catch(error){if(!process.env.FORECAST_STORAGE && (error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    if(!official.result)throw new Error(official.diagnostic??'Apuração nacional ainda indisponível na fonte oficial.');
    if(official.fetchedAt && timestamp(official.fetchedAt)>now)throw new Error('Coleta nacional com horário futuro; verificar relógios.');
    let status=null;
    try {const parsed=collectionStatusSchema.parse(await reader.read('status.json'));if(parsed.collectionId===official.collectionId && timestamp(parsed.lastAttemptAt)<=now)status=parsed;} catch { /* Missing status cannot refresh an old product. */ }
    const checkedAt=status?.lastAttemptAt??official.lastAttemptAt;
    const stale=(status?.stale??official.stale) || now-timestamp(checkedAt)>120000 || !official.sourceUpdatedAt || now-timestamp(official.sourceUpdatedAt)>600000;
    return {...official.result,checkedAt,stale,
        collectionId:official.collectionId,contentHash:official.contentHash,fetchedAt:official.fetchedAt,sourceUpdatedAt:official.sourceUpdatedAt,
        ...(stale?{message:'Último nacional oficial preservado; fonte/coleta desatualizada. Horário original mantido.'}:{}),
    };
}
