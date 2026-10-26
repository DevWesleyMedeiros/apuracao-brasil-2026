import { initialRound } from "./official-dashboard";

// A E/S de relógio no momento da solicitação (request-time) permanece fora da regra de seleção pura e da renderização no cliente.
export async function officialEntryRound(
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>,
) {
  const query = await searchParams;
  return initialRound(query.round, Date.now());
}
