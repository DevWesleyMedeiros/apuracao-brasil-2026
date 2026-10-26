/**
 * /**
 * Página inicial (/) da apuração oficial.
 *
 * Atua como ponto de entrada do dashboard eleitoral,
 * identificando o turno inicial através dos parâmetros
 * da URL e delegando a interface ao OfficialDashboard.
 *
 * Utiliza officialEntryRound para determinar o turno
 * antes da renderização no servidor.
 */

import OfficialDashboard from "@/components/OfficialDashboard"; // Importa o componente React responsável por apresentar o painel de apuração oficial, que inclui os candidatos, os votos, os gráficos e os filtros

import { officialEntryRound } from "@/lib/official-entry"; //Importa o componente React responsável por apresentar o painel de apuração oficial, incluindo candidatos, votos, gráficos e filtros

export default async function Page({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
  // Resolva uma vez por solicitação; hidrate com o mesmo valor, não com o relógio do navegador
  const round = await officialEntryRound(searchParams);
  return <OfficialDashboard key={round} initialRound={round} />;
}
