import OfficialDashboard from '@/components/OfficialDashboard';
import { officialEntryRound } from '@/lib/official-entry';

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
    // Resolve once per request; hydrate with the same value, not the browser clock.
    const round = await officialEntryRound(searchParams);
    return <OfficialDashboard key={round} initialRound={round} />;
}
