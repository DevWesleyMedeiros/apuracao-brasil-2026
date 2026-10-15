import { ForecastPanel } from "@/components/forecast/ForecastPanel";
import Link from "next/link";
export default function ProjectionPage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-5 py-8">
      <nav aria-label="Painéis" className="flex flex-wrap gap-5">
        <Link className="underline" href="/">
          Apuração oficial
        </Link>
        <Link className="underline" aria-current="page" href="/projecao">
          Projeção estatística
        </Link>
        <Link className="underline" href="/projecao/metodologia">
          Metodologia
        </Link>
      </nav>
      <header>
        <p className="font-semibold text-[#075536]">APURAÇÃO BRASIL · 2026</p>
        <h1 className="mt-2 text-3xl font-bold">
          Projeção para o segundo turno
        </h1>
        <p className="mt-2">
          Presidente · Brasil + exterior · 25 de outubro de 2026
        </p>
      </header>
      <aside
        role="note"
        className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-amber-950"
      >
        <strong>Projeção estatística — não é resultado oficial.</strong> Somente
        o TSE determina resultados e situações eleitorais.
      </aside>
      <ForecastPanel />
    </main>
  );
}
