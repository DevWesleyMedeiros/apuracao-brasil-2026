import { initialRound } from './official-dashboard';

// Request-time clock I/O stays outside the pure selection rule and the client render.
export async function officialEntryRound(searchParams: Promise<{ [key: string]: string | string[] | undefined }>) {
    const query = await searchParams;
    return initialRound(query.round, Date.now());
}
