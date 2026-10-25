# Ingestão oficial e identidades — 25/10/2026

Branch atual `develop`, preservada. Alterações locais iniciais incluíam flags true, formatação de `production.ts` e `evaluation.json=true`. Somente as flags foram explicitamente desligadas conforme a tarefa; booleano preservado e bloqueado como avaliação inválida. Nenhuma pesquisa cadastrada/alterada, recalibração, dependência/lockfile alterado, commit automático, push, merge, deploy ou provisionamento. Mudanças externas na branch não foram revertidas.

## Fonte oficial real

- Descoberta por `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`: fase oficial, `ele2026`, 25/10/2026, turno 2, presidente, eleição **6258 descoberta**, sem fallback.
- Primeira coleta: configuração + 29 arquivos, ~32s, nacional `waiting`, fonte de 24/10 às 19:19:13 Brasília. Não foi convertido para parcial pelo relógio.
- Teste contínuo real: duas rodadas de ~31s, 60s de espera após conclusão, mesmo arquivo de histórico `05c60cfed5dd97d46332b58999a3e4a440e133da617cca2654f1e16495f3c406`, ainda `waiting` inclusive na consulta nacional às **17:00:31 Brasília**. Interrupção controlada pelo `timeout` reportou 130; não se interpreta como coleta íntegra nova. Um temporário de compilação dessa interrupção foi identificado e removido, sem tocar dados do usuário.
- Teste de SIGINT enviado diretamente ao processo Node durante a coleta: saída **0**, motivo `interrupted`, nacional validado preservado, arquivo parcial arquivado separadamente e limpeza do temporário executada.
- Coleta completa posterior (~31s): nacional **partial conforme a fonte**, não por horário; 29 arquivos recebidos. Último arquivo nacional normalizado em `data/forecast/data.json`:
  - fonte `2026-10-25T20:06:31.000Z` (17:06:31 Brasília);
  - fetch original `2026-10-25T20:08:28.921Z` (17:08:28 Brasília), preservado em consulta idêntica posterior;
  - última consulta nacional `2026-10-25T20:10:49.632Z` (17:10:49 Brasília);
  - `collectionId=7cac9fc1b2f8ada3c7722e1e37cb01ae6a6ccc5f7e56eba78e20543c356dfd57`;
  - hash canônico `f5c77eff755bb30e886f47ebf7ef577b6dfccfaff6e6c2594f1b700add177c5a`;
  - arquivo bruto imutável `.forecast-operation/collections/a5268bf5a4e7849e1864b63d7a3c61a381390ce90cbe9b36e15a58358932af30/`.

`data.json`, versões, ponteiro/status e histórico são locais e ignorados pelo Git. Coletor foi **parado após os testes**; o leitor marca stale conforme a idade da fonte/última tentativa, não presume acompanhamento contínuo ativo. Para operar, iniciar `pnpm collect:official:watch` em processo persistente.

Não foi promovido `live-snapshot.json`: permanece `null`. Bloqueio registrado: política de destinação oficial verificada ausente. Também faltam baseline final conciliado e mapeamento verificado. Não se inventaram códigos de destinação ou dados históricos. O nacional continuou independente desses bloqueios.

Pré real capturado às **16:38:09.340 Brasília**, corte igual à captura, em `.forecast-operation/frozen-pre.json`, com arquivo imutável das 12 pesquisas originais e parâmetros em `pre-archives/e396283953e2751fdcf9598a010437bcad591d0a8ffcfe3189c0afb9fd2bb9b9.json`. Captura anterior ao marco; não foi preenchido horário futuro. Não equivale a avaliação estatística.

## Checks executados

| Comando | Resultado final |
| --- | --- |
| `pnpm test` | Passou, harness Node ampliado, sem rede/novo runner |
| `pnpm lint` | Passou, sem warnings |
| `pnpm build` | Passou Vinext/Workers; avisos de análise estática de rotas/tempo de plugins, sem falha |
| `pnpm build:next` | Passou Next 16.3.4; APIs dinâmicas |
| `pnpm typecheck` | Passou após restauração dos tipos Next |
| `git diff --check` | Passou |
| `node scripts/smoke-ingestion-local.mjs --port 3012` | Passou: fixtures HTTP isoladas, sem TSE; espera/parcial/retido/final, arquivo dinâmico sem rebuild/restart, ponteiro inválido/recuperação, baseline ausente ou inválido não bloqueia nacional |
| `node scripts/smoke-official-runoff.mjs --url http://127.0.0.1:3010` | Última execução passou: nacional partial, RS/ZZ/Sul/Porto Alegre waiting e catálogo compatíveis; horários próprios, não leitura simultânea |
| `node scripts/smoke-forecast.mjs --url http://127.0.0.1:3010 --evaluation-state invalid` | Passou, probabilidades null e live disabled; corte pré corrente disabled depois das 17h |
| `node scripts/smoke-official-runoff.mjs --url https://apuracao-brasil-2026-nu.vercel.app` | Passou seis leituras, todas waiting antes da abertura; deploy existente não recebeu estas alterações |
| `node scripts/check-live-snapshot.mjs --data-dir data/forecast` | Saída 1 esperada: política verificada ausente, nenhum teste live real autorizado |
| `pnpm exec playwright --version` / procura por Chromium | Playwright e navegador não disponíveis; nenhuma checagem visual declarada aprovada |

Antes da coleta atualizada, smoke nacional local retornou 1 por **stale correto**, com fonte de 24/10 e depois 16:46 de 25/10. Preservou horário original, não mascarou atualização. Smoke forecast inicial assumia avaliação null; foi parametrizado para exigir especificamente `evaluation-invalid` no arquivo true existente (default continua exigindo `evaluation-missing`). Uma execução simultânea de lint/test teve ENOENT em temporário que o harness removeu; reexecução sequencial passou, sem excluir fontes/afrouxar regras. Falhas intermediárias de implementação/schema/tipos foram corrigidas; não foram tratadas como falhas preexistentes nem como calibração.

O harness cobre identidades determinísticas, nova observação sem alterar autorização compatível, invalidação por parâmetros/modo/transformação/baseline/política, revisão/validade/holdout independentes, revogação no fallback com horários/hashes originais, encerramento nacional sem previsão prospectiva, congelamento sem futuro, indisponibilidade/retido/parcial/final, UTC/Brasília antes/no/depois do marco, sequência/Retry-After/backoff/cancelamento/recuperação, completude e conciliação, final antigo versus parcial antigo (ambos bloqueados), escrita atômica/deduplicação/leitura dinâmica. Avaliações aprovadas e dados sintéticos ficam exclusivamente nos testes.

## Estado separado e pendências

1. **Oficial:** nacional real validado e painel/filtros preservados, sem depender do baseline. Artefato local não garante atualização futura.
2. **Contínuo local:** implementado e exercitado; sem processo persistente deixado ativo após teste.
3. **Deploy:** adaptador HTTPS configurável entregue; origem durável/publicador/job e configuração externa **pendentes**, sem alegação de produção pronta. Atualizar arquivos locais não atualiza Vercel/Workers.
4. **Live estatístico:** desabilitado; faltam política revisada, baseline e mapping reais conciliados. Pré congelado preservado. Nenhuma nova calibração executada.
5. **Probabilidades públicas:** `false`; avaliações ausentes/legadas/inválidas bloqueadas, pré não autoriza live. Nenhum anúncio de vitória pelo modelo.

Principais arquivos: `lib/forecast-server/{artifacts,storage,storage-node,official,production,production-runtime,live-service,tse-adapter,service}.ts`, `lib/forecast/{identity,types,quality,config}.ts`, rotas de results/forecast, painéis oficial/estatístico, CLIs de coleta/congelamento/verificação/backtest, harness existente e `OPERACAO.md`. Nenhum dado de pesquisa ou parâmetro estatístico foi substituído.
