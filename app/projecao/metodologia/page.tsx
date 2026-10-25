import { MODEL_CONFIG } from "@/lib/forecast/config";
import Link from "next/link";
export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-5 py-8">
      <nav aria-label="Painéis" className="flex flex-wrap gap-5">
        <Link className="underline" href="/">
          Apuração oficial
        </Link>
        <Link className="underline" href="/projecao">
          Projeção
        </Link>
      </nav>
      <h1 className="text-3xl font-bold">
        Metodologia · segundo turno presidencial
      </h1>
      <p className="rounded border border-amber-400 bg-amber-50 p-4">
        <strong>Projeção estatística — não é resultado oficial.</strong> Apenas
        dados oficiais do TSE determinam situações eleitorais. Software testado
        não equivale a modelo calibrado.
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Fontes e elegibilidade</h2>
        <p>
          A versão atual contém pesquisas e candidaturas cadastradas. Pesquisas precisam de relatório, registro TSE
          verificado manualmente, amostra, denominador, datas de campo,
          divulgação e revisão de curadoria. Formato de registro não comprova
          sua existência. Notícias repetidas não são novas pesquisas.
        </p>
        <p>
          Só entram pesquisas encerradas e publicadas até o corte. Datas sem
          horário entram no fim do dia de Brasília (America/Sao_Paulo, UTC−3 em
          2026). Conservamos apenas a última onda por instituto e cenário;
          empates usam publicação e id estável. Isso reduz repetição, mas não
          elimina correlação.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Agregação e distribuição</h2>
        <p>
          Proporções internas em [0,1]. Em percentuais sobre todos os
          entrevistados, p=A/(A+B) e n útil≈n·(A+B)/100. Se já são votos
          válidos, exigimos n útil conhecido. Não interpretamos brancos, nulos
          ou abstenção como rejeição.
        </p>
        <p>
          Variância amostral≈deff·p·(1−p)/n útil. Peso proporcional a
          exp(−idade/τ)/variância, idade desde o fim do campo. τ=
          {MODEL_CONFIG.decayDays} dias é escala, não meia-vida:
          meia-vida=τ·ln(2). A média ponderada das pesquisas é separada da
          probabilidade de vitória.
        </p>
        <p>
          Variância preditiva soma Σw²·variância amostral, erro comum² e deriva
          diária²·dias até o pleito. Erro comum não diminui ao adicionar
          pesquisas. Em logit, sigma≈sigmaP/[μ·(1−μ)]; valores degenerados são
          recusados, não truncados.
        </p>
        <p>
          Distribuição t com {MODEL_CONFIG.degreesOfFreedom} graus de liberdade,
          reescalada para variância 1, aplicada em logit. Não é universalmente
          mais conservadora que a normal. Mediana é a transformação do centro
          logit. Quantis 2,5% e 97,5% usam interpolação linear (tipo 7); B usa a
          mesma distribuição complementar.
        </p>
        <p>
          Monte Carlo com {MODEL_CONFIG.simulations} amostras limitadas, PRNG
          Mulberry32, seed explícita e pares antitéticos. Probabilidade é
          frequência condicional ao modelo, não certeza. Extremos são rotulados
          &lt;0,1% e &gt;99,9%, sem modificar valor bruto. Sigma zero e massa em
          empate são tratados separadamente. “Empate exato no modelo” é igualdade
          exata: com dispersão, sua probabilidade no modelo contínuo é zero, sem
          excluir empate numa contagem real discreta. Não é “empate técnico”,
          sobreposição de intervalos nem uma métrica de disputa apertada.
        </p>
        <p>
          deff={MODEL_CONFIG.designEffect}, erro comum=
          {MODEL_CONFIG.commonSigmaP} e deriva=
          {MODEL_CONFIG.driftSigmaPPerSqrtDay} por raiz de dia são hipóteses de
          engenharia não validadas. House effects estão desabilitados. Versão:{" "}
          {MODEL_CONFIG.version}; alterações exigem nova versão e reavaliação.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">
          Histórico e autorização de probabilidades
        </h2>
        <p>
          Série recalculada por corte com os dados desta versão usa cortes estritos de publicação e parâmetros
          versionados; não é um arquivo imutável de previsões publicadas.
          Reavaliações não substituem silenciosamente históricos arquivados.
          Nenhuma previsão pré-eleitoral atual é produzida após o pleito.
        </p>
        <p>
          Probabilidades públicas estão desabilitadas e são null na API. Para
          habilitar, exigem autorização explícita, relatório independente,
          parâmetros/dados identificados e revisão de qualidade. Avaliação
          temporal exige treino apenas em eleições anteriores ao corte; sem
          isso, não existe teste operacional válido. Horizontes da mesma eleição
          não são eventos independentes.
        </p>
        <p>
          Nesta versão, evaluation.json é null: faltam dataset retrospectivo com
          fontes oficiais e parâmetros disponíveis nos cortes, treino anterior e
          holdout independente, relatório operacional e revisão documentada.
          Baseline e snapshot ao vivo também não foram fornecidos. Metadados
          booleanos sozinhos não comprovam calibração. A interface informa os
          bloqueios por códigos auditáveis; null não é zero nem falha de consulta.
          Alterações nos dados atuais mudam dataVersion e invalidam a vinculação
          da avaliação anterior; exigem nova revisão dos hashes, não relaxamento do gate.
        </p>
        <p>
          A escala completa do gráfico vai de 0 a 100%. A escala ampliada é
          identificada e inclui pesquisas, intervalos preditivos, margem visual e
          50%, limitada a [0,1]. Sem nova pesquisa elegível, o decaimento comum
          cancela na normalização dos pesos: platôs da mediana podem ser corretos,
          mesmo que a incerteza temporal mude. Não alteramos pesos para animar a curva.
        </p>
        <p>
          O CLI calcula MAE, RMSE, cobertura, largura, Brier e log loss
          (proteção epsilon=10⁻⁶ somente no escore). Sensibilidade a erro comum,
          deriva e concentração não demonstra calibração de 95%. Três eleições
          não bastam para essa promessa. Não há ML, Kalman nem reprodução do
          modelo proprietário de terceiros.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Motor ao vivo experimental</h2>
        <p>
          Desabilitado por padrão. Exige baseline auditado, 27 UFs + ZZ e
          reconciliação com BR. BR nunca é uma 29ª parcela. Arquivo ausente,
          retido ou antigo suspende novo cálculo; stale preserva horário
          original.
        </p>
        <p>Imports estáticos de baseline/snapshot e um coletor manual não alimentam continuamente o deploy. Enquanto esse fluxo não for revisado, use a <Link className="underline" href="/?round=2">apuração oficial presidencial de segundo turno</Link>, independente do motor estatístico.</p>
        <p>
          Preservamos votos observados: A final=Σ(a+R·p restante); R=volume
          esperado−(a+b)≥0. No fechamento oficial, R=0 e intervalo colapsa no
          resultado, sem previsão de eleito. Progresso de seções não é progresso
          de votos.
        </p>
        <p>
          Swing logit compara parcial atual com UF inteira anterior, não as
          mesmas seções: pode sofrer viés capital/interior e participação
          desigual. Incerteza de volume e choques nacionais/territoriais afetam
          apenas votos ainda não observados. Não inferimos transferência
          individual de votos nem probabilidades por UF.
        </p>
      </section>
      <p>
        Referência oficial:{" "}
        <a
          className="underline"
          href="https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados"
        >
          TSE · documentação da divulgação
        </a>
        . Operação, contratos e critérios de ativação:{" "}
        <code>docs/forecast/OPERACAO.md</code> no repositório.
      </p>
    </main>
  );
}
