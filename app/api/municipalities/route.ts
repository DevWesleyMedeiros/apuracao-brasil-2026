import { getMunicipalities } from "@/lib/tse";
import { STATES } from "@/lib/catalog";
import { withDeadline } from "@/lib/deadline";
import type { Round } from '@/lib/electoral-context';

export async function GET(request: Request) {
  const uf = new URL(request.url).searchParams.get("uf") ?? "";
  const round = new URL(request.url).searchParams.get('round') ?? '1';
  if (!['1','2'].includes(round) || !STATES.some(([code]) => code === uf))
    return Response.json({ message: "UF inválida." }, { status: 400 });
  try {
    const list = await withDeadline(
      (signal) => getMunicipalities(uf, signal, {round:round as Round}),
      26000,
      request.signal,
    );
    return Response.json(list, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as cidades.",
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" },
      },
    );
  }
}
