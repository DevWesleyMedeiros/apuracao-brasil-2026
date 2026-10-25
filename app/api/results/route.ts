import { getResult, getRegionResult } from "@/lib/tse";
import { withDeadline } from "@/lib/deadline";
import { REGIONS } from "@/lib/catalog";
import { querySelection } from "@/lib/election";
import type { Round } from '@/lib/electoral-context';
import { storedOfficialResult } from '@/lib/forecast-server/official';
import {
  InvalidMunicipalityError,
  validateMunicipalityFilter,
} from "@/lib/municipal";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const region = params.get("region");
  const municipality = params.get("municipality");
  const round = (params.get('round') ?? '1') as Round;
  const uf = params.get("uf") ?? "br",
    office = params.get("office") ?? "1";
  try {
    querySelection(uf, office, { round });
    if (
      region &&
      (uf !== "br" || office !== "1" || !REGIONS.some((r) => r.code === region))
    )
      throw new Error("Região inválida.");
    if (municipality) {
      if (region) throw new Error("Combinação inválida.");
      validateMunicipalityFilter(uf, municipality);
    }
  } catch {
    return Response.json(
      { message: "Combinação de região, UF, cidade e cargo inválida." },
      { status: 400 },
    );
  }
  try {
    const started = Date.now();
    console.info("[results] start", { uf, office, region, municipality });
    const result = await withDeadline(
      async (signal) =>
        region
          ? getRegionResult(region, signal, { round })
          : (uf==='br' && office==='1' && round==='2' && !municipality ? await storedOfficialResult(Date.now()) : null) ?? getResult(uf, office, signal, municipality ?? undefined, { round }),
      26000,
      request.signal,
    );
    console.info("[results] complete", {
      uf,
      office,
      region,
      municipality,
      elapsedMs: Date.now() - started,
      stale: !!result.stale,
    });
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.warn("[results] failed", {
      uf,
      office,
      region,
      municipality,
      message: error instanceof Error ? error.message : "Fonte indisponível.",
    });
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Fonte indisponível. Tente novamente em um minuto.",
      },
      {
        status: error instanceof InvalidMunicipalityError ? 400 : 503,
        headers: { "Retry-After": "60", "Cache-Control": "no-store" },
      },
    );
  }
}
