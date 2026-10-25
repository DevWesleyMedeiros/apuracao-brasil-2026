# Verificação · visibilidade e segundo turno · 24/10/2026

Branch: `fix/forecast-visibility-and-runoff-readiness`. Checkout inicial limpo, HEAD exatamente `52c3aeaa3498184d8fbadc6f833afe11d4490bca` (referência da investigação). Node v24.21.0, pnpm 11.25.0, Next 16.3.4. Sem alteração de dependências, lockfile, parâmetros estatísticos ou dados de produção. Sem push, merge, deploy, serviço provisionado ou coletor permanente.

## Diagnóstico revalidado

- `preEnabled=true`, `publicProbabilityEnabled=false`, `liveEnabled=false`.
- 12 registros de pesquisas, duas candidaturas e disputa nos arquivos atuais. Não foram inventados nem alterados pela correção. Não houve auditoria externa renovada das fontes desses registros.
- `evaluation.json`, `baseline.json` e `live-snapshot.json` continuam `null`. Não foi encontrado relatório independente de avaliação no checkout. Não há relatório real cujo conteúdo/hashes possam ser aprovados nesta entrega.
- A distribuição calcula probabilidades, mas o serviço as publica como null sob o gate. Agora informa `publication-disabled` e `evaluation-missing`, cumulativamente, mantendo `probabilityReason`.
- Consulta local de `/api/forecast?mode=pre`: `ready`, dez pesquisas elegíveis/selecionadas e oito cortes nesta consulta. Esses números dependem do corte; não são expectativa permanente de teste. As três probabilidades ficaram null.
- Hash dos dados observado: `17a44b7004bb3f412c7f2723886bb4045623a97931e764d5f2f625d0bc601d84`.
- Hash dos parâmetros observado: `050c52b2d85a44546643f8de694743b53af8b9d1a01dac469ccf1faf78857097`.
- Não há avaliação associada a esses hashes. Mudar pesquisas/candidaturas/disputa/baseline/snapshot muda dataVersion e invalida o vínculo anterior. Alterar parâmetros também exige revisão/reavaliação vinculada ao novo hash, não mera alteração de booleanos.

## Implementação e arquivos

- `lib/forecast/quality.ts`, `lib/forecast-server/service.ts`: motivos públicos estruturados, sem expor conteúdo arbitrário do schema/relatório. Mesmas condições de autorização; não há autorização automática.
- `components/forecast/ForecastPanel.tsx`: cartões por candidato, mediana 36–48px, intervalo preditivo condicionado de 95%, probabilidade separada, média ponderada em destaque, bloco de publicação expansível e empate exato explicado. Parcelas com duas casas pt-BR; probabilidades preservam `probabilityLabel`.
- `lib/forecast/chart.ts`, `components/forecast/ForecastSeries.tsx`: timestamp único por ponto, tempo numérico, eixo civil de Brasília, escala completa/ampliada explícita, referência 50%, linha reta/marcadores/faixa preditiva, inspeção agrupada e individual de sobreposições, tabela e timestamps brutos. Valores e instantes não são deslocados. Histórico identificado como recalculado por corte.
- `app/page.tsx`, `components/OfficialDashboard.tsx`, `lib/official-entry.ts`, `lib/official-dashboard.ts`: página servidor resolve turno com relógio de requisição e passa valor serializável ao painel cliente. Segundo turno inicial a partir de meia-noite de 25/10 em Brasília; URL explícita prevalece, inclusive primeiro turno, e seleção manual atualiza URL/voltar do navegador. Atualização de 60s/visibilidade sem concorrência; erro mantém alerta até consulta bem-sucedida.
- `lib/result-client.ts`: além de turno, rejeita contexto/UF/região/município/cargo divergentes, preservando alias distrital do DF. API mantém padrão legado.
- `scripts/test-election.mjs`, `scripts/test-forecast.mjs`, `scripts/test-forecast-visibility.mjs`: extensão do mesmo harness Node, fixtures exclusivamente de teste, sem novo framework.
- `scripts/smoke-official-runoff.mjs`: seis leituras sequenciais com turno explícito, contexto descoberto e timeout; sem votos mínimos, fallback de eleição ou código municipal presumido.
- `scripts/smoke-forecast.mjs`: remove premissas obsoletas de base vazia e verifica bloqueios/URL explícita.
- `docs/forecast/OPERACAO.md` e `app/projecao/metodologia/page.tsx`: estado atual, metodologia, gates e checklist operacional corrigidos.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `pnpm test` | Passou, incluindo novos casos de gates, distribuição autorizada só em teste, zero/null/empates, gráfico/tempo e estados do painel oficial |
| `pnpm lint` | Passou na execução final separada do harness |
| `pnpm build` | Passou, Vinext/Vite/Workers; avisos informativos de tempo de plugins/classificação `?` |
| `pnpm build:next` | Passou, Next/Turbopack, raiz dinâmica por requisição |
| `pnpm typecheck` | Passou após regeneração Next, conforme ordem documentada |
| `pnpm start:next --port 3001` + `node scripts/smoke-forecast.mjs --url http://127.0.0.1:3001` | Passou: API, gates, parâmetros, HTML e navegação |
| `pnpm start --port 8787` + `node scripts/smoke-forecast.mjs --url http://127.0.0.1:8787` | Passou no Workers local |
| Leitura HTTP de `/?round=1` e `/?round=2` em ambos os runtimes | HTTP 200 e opção correspondente selecionada no HTML do servidor |
| `node scripts/smoke-official-runoff.mjs --url http://127.0.0.1:3001` | Passou contra fonte real: nacional, RS, ZZ, Sul e Porto Alegre em `waiting`, catálogo municipal RS HTTP 200; sem exigir votos positivos |
| `git diff --check` | Passou |

Smoke oficial em uma passagem, sem retries: nacional 1122ms, RS 85ms, ZZ 179ms, Sul 296ms, catálogo RS 272ms, Porto Alegre 103ms. Medições pontuais locais, não garantia de latência/capacidade/disponibilidade futura. Não criam snapshots nem avaliação estatística.

### Falhas durante desenvolvimento

- Lint executado em paralelo ao harness encontrou `ENOENT` quando o diretório temporário foi removido. Corrida já descrita na verificação anterior; checks finais separados, sem relaxar ESLint.
- Primeiro lint isolado apontou `Date.now()` no render da página. Introduzido nesta implementação e corrigido separando I/O do relógio da regra pura e do componente. Não foi desabilitada a regra de pureza.
- Não houve falha de domínio no harness nesta sessão. Os tipos entre runtimes foram regenerados na ordem `build` → `build:next` → `typecheck`, sem apagar fontes.
- Servidores de smoke foram encerrados após uso; exit 143 do Next corresponde ao SIGTERM solicitado, não a falha de build ou HTTP.

## Cobertura e limite visual

Testes de software cobrem flag/avaliação nula/inválida/pós-corte, revisão/holdout/operacional, versões e hashes, fixture autorizada, soma A+B+empate, empate contínuo/degenerado, zero distinto de null, datas sem hora/offset/virada UTC-Brasília, cortes sem futuro, zero pontos/instante único/sobreposições/intervalos e limites da escala ampliada. Painel oficial: meia-noite em Brasília, URL explícita, pausa/retorno vencido/busy, waiting→partial→finished, withheld, erro/stale/recuperação, resposta antiga rejeitada por chave e guardas de contexto no cliente. Testes preexistentes de abortos, deadlines, backoff/fallback e isolamento permanecem.

**Revisão visual não executada:** não há ferramenta de navegador disponível, nenhum Chromium/Chrome no PATH, `/opt` está vazio e não foi encontrado navegador no cache local. Portanto não há screenshots nem validação real a 360px, tablet e desktop, foco/teclado, tooltip em toque, contraste calculado ou leitor de tela. HTML/contratos e responsividade por código não substituem essa revisão. Antes da operação, conferir esses tamanhos, escala ampliada, inspeção de pontos sobrepostos, tabelas com rolagem e troca de turno/retorno à aba em navegador.

## Checklist e pendências externas

1. Abrir `/?round=2`, conferir presidente e o horário de Brasília; preservar `/?round=1`.
2. Executar o smoke de uma passagem, observar Retry-After em falha e conferir fonte versus consulta/stale.
3. Revisar visualmente 360px/tablet/desktop, zoom, teclado e retorno à aba.
4. Manter flags probabilísticas e live desligadas; não confundir apuração oficial com projeção.
5. Manter contingência pelo site oficial. Cache de configuração de 1h, backoff até 10min, fallback por instância e ausência de deduplicação global continuam limitações conhecidas, não corrigidas por um build.

Probabilidades **continuam bloqueadas** por flag e avaliação independente ausente. Faltam dataset retrospectivo auditável, resultados/proveniência, treino anterior com parâmetros disponíveis em cada corte, holdout independente, relatório operacional com versões/hashes/datas compatíveis e revisão humana documentada. Live continua desabilitado: baseline/snapshot nulos, sem ingestão contínua; coletor manual não atualiza imports estáticos do deploy. Nenhuma calibração, prontidão live ou garantia para 25/10/2026 é anunciada.
