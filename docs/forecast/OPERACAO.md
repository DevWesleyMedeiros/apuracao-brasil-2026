# Projeção presidencial de segundo turno

## Estado e arquitetura

Software experimental, **não modelo estatisticamente calibrado**. Em `lib/forecast/config.ts`: `preEnabled=true`, `liveEnabled=false`, `publicProbabilityEnabled=false`. Checkout revalidado em 24/10/2026, referência `52c3aeaa3498184d8fbadc6f833afe11d4490bca`: há 12 registros de pesquisas, duas candidaturas e disputa cadastradas nos JSONs; isso não equivale a auditoria independente das fontes. Baseline, avaliação e snapshot continuam `null`. Pré pode retornar `ready` com parcela de votos e probabilidades null; live continua `disabled`. Não há coletor em execução, infraestrutura nova, LLM nem PostgreSQL. D1 existente é opcional e não provisionado para esta feature.

- `lib/electoral-context.ts`, `election.ts`, `tse.ts`: descoberta exata por ciclo/data/turno/cargo, validação oficial e transporte. Padrão legado é primeiro turno; segundo turno explícito, somente presidente. Municípios preservam cinco dígitos e pertencimento à UF; DF, ZZ e regiões completas continuam suportados. Cache/fallback não cruzam turnos ou eleições.
- `lib/forecast/`: schemas Zod e matemática pura; relógio, seed, dados e parâmetros explícitos. Sem fetch/fs/aleatoriedade ambiente.
- `lib/forecast-server/`: dados, adaptadores e política de publicação. Rotas sem filesystem gravável, sem `cloudflare:workers` no caminho Next.
- `scripts/`: CLIs manuais Node e extensão do harness existente, sem novo test runner. Fixtures sintéticas só nos testes.

Unidades internas: proporções [0,1]. `weightedPollShare` é média ponderada das pesquisas; `median` é mediana preditiva; `probabilityA/B/Tie` são chances condicionais ao modelo, não parcela de votos. `sectionFraction` mede seções; `estimatedVoteFraction` depende do volume estimado.

## Apuração oficial presidencial · 25/10/2026

- Entrada compartilhável: `/?round=2`; `/?round=1` preserva acesso ao primeiro turno. A partir de 00h de 25/10/2026 em America/Sao_Paulo, a página sem turno válido inicia no segundo. Regra pura com relógio injetado nos testes; resolução no servidor por requisição e valor serializado para hidratação. API mantém padrão legado de primeiro turno.
- Segundo turno suporta somente presidente, inclusive nacional, UFs, exterior, regiões completas e municípios. Não anuncia governadores. Troca de contexto limpa resultado antes de exibir o novo recorte; abortos, sequência e chave impedem respostas antigas.
- Atualização automática a cada 60s, sem sobreposição e pausada em aba oculta; retorno à aba consulta imediatamente se a última tentativa estiver vencida. Falha preserva o resultado e horário da consulta bem-sucedida, com alerta. `stale` do servidor mantém o horário original da fonte; horário da consulta no navegador não é atualização da fonte. `waiting`, `withheld`, `partial` e `finished` continuam distintos.
- Limites existentes, **sem refatoração de infraestrutura**: configuração e catálogo municipal em cache por uma hora (mudança do TSE pode demorar a aparecer); backoff por falhas de até dez minutos; fallback apenas em memória/instância, perdido em reinício; nenhuma deduplicação global de I/O concorrente. Cache completo por URL/contexto, sem compartilhar promises entre requisições Workers. Um build não garante disponibilidade da fonte ou capacidade sob carga.

Smoke manual somente leitura, uma passagem sequencial (1s entre consultas, timeout de 30s, sem retry automático):

```sh
node scripts/smoke-official-runoff.mjs --url http://127.0.0.1:3000
```

Consulta nacional, RS, ZZ, Sul, catálogo municipal do RS e Porto Alegre com `round=2`. Código municipal vem do catálogo e código de eleição das respostas; nenhum fallback fixo. Valida HTTP/JSON, contexto, identificação territorial e estados; aceita zeros antes da abertura. Erros, stale ou catálogo ausente geram saída não zero; 429 interrompe consultas restantes. Não repetir agressivamente; observar Retry-After e diagnóstico. Pode receber URL base do ambiente autorizado, sem credenciais.

Checklist: conferir relógio/turno e link compartilhável; executar smoke; revisar fonte versus consulta e alertas de stale; conferir nacional/RS/ZZ/Sul/Porto Alegre; testar retorno à aba; deixar flags probabilísticas/live desligadas; manter acesso direto a resultados.tse.jus.br em contingência. Não substituir indisponibilidade por dados sintéticos.

API discriminada: `disabled`, `no-data`, `insufficient-data` têm `estimate:null`; `ready`, `stale`, `finished` carregam estimativas. Metadados: contexto, modo, corte/cálculo/fonte, versão/hashes, seed, calibração, fontes, candidatos, contagem, pesos e concentração. `finished` não publica probabilidade de previsão. `stale` preserva horários e contexto originais. Ausência nunca significa 50/50.

Cache só de valores concluídos (32 respostas, oito fallbacks live), nunca promises entre requisições Workers. Pré TTL 300s, live 15s; corte atual em baldes de cinco minutos/15 segundos respectivamente, sem informação posterior ao corte. Falha/ausência/stale: `no-store`. CDN: pré pronto 300s, live pronto 15s. Reiniciar perde fallback. SHA-256 dos dados exclui avaliação para não criar hash circular; relatório integra a chave separadamente. Nenhum arquivo bruto ou amostra Monte Carlo vai ao navegador.

## Execução local

Node >=22.13 e pnpm 11.25.0, na raiz:

```sh
pnpm install --frozen-lockfile
pnpm dev:next
```

Abra `http://localhost:3000/`, `/projecao`, `/projecao/metodologia`.

```sh
pnpm test
pnpm lint
pnpm build
pnpm build:next
pnpm typecheck
```

Next produção local: `pnpm start:next` depois de `pnpm build:next`. Workers: `pnpm dev`, ou `pnpm start` após `pnpm build`. Não é necessário publicar.

Ao alternar runtimes, Vinext pode regenerar `.next/types` num formato incompatível com o validator Next anterior. A ordem acima restaura tipos Next antes do typecheck; não é necessário apagar fontes ou enfraquecer checks. Para smoke HTTP local: `node scripts/smoke-forecast.mjs --url http://127.0.0.1:3000` com o servidor em execução.

## API

```text
GET /api/results?uf=br&office=1&round=2
GET /api/results?uf=br&office=1&round=1&region=sul
GET /api/results?uf=ac&office=1&round=2&municipality=01120
GET /api/municipalities?uf=ac&round=2
GET /api/forecast?mode=pre
GET /api/forecast?mode=live
GET /api/forecast?mode=pre&asOf=2026-10-14T23%3A59%3A59-03%3A00
GET /api/forecast?mode=pre&asOf=2026-10-14T23%3A59%3A59-03%3A00&from=2026-10-05&to=2026-10-13
```

Forecast exige `mode`. Só aceita `mode`, `asOf`, `from`, `to`, sem duplicatas, URLs ou parâmetros estatísticos livres. Histórico entre 04/10/2026 e o pleito, nunca no futuro, intervalo máximo 31 dias; datas sem horário entram ao final do dia de Brasília (America/Sao_Paulo, UTC−3 em 2026). Sem intervalo, série diária até o corte, apenas enquanto pré-eleitoral. Após o pleito, pré apenas com corte histórico identificado.

## Adicionar pesquisas reais

Fonte dos contratos: `lib/forecast/types.ts`.

Para preencher por interface visual exclusivamente local, execute `pnpm admin:pesquisas` e abra `http://127.0.0.1:4179`. Importação/edição em memória e exportação manual dos três JSONs, sem escrita no projeto ou publicação automática. Fluxo completo, limites e cuidados: [CURADORIA-LOCAL.md](CURADORIA-LOCAL.md).

1. Obtenha relatório original; confira manualmente registro/divulgação no TSE. Regex não confirma existência/autorização. Notícia repetida não é nova pesquisa.
2. Preencha `contest.json` conforme `contestSchema`: ano, turno 2, cargo 1, BR, eleição descoberta, horário do pleito com fuso, cenário e **dois ids confirmados em ordem fixa**. `candidates.json` exige id/nome real, fonte e data de verificação. Sem dupla confirmada, mantenha vazios.
3. `polls.json`: id, registro TSE, instituto canônico, contratante quando disponível, modo, contexto/dupla/cenário/onda, datas de campo/publicação, relatório, referência da verificação do registro, amostra, unidade (`percent`/`proportion`), denominador (`total`/`valid`), A/B, brancos/nulos/indecisos quando publicados, n útil, margem/confiança quando publicados, acesso, curadoria e proveniência. Não invente opcionais.
4. `valid` exige `validSampleSize` conhecido e soma A+B unitária; categorias do total não entram nesse denominador. `total` usa n útil≈n·(A+B)/100 na unidade percentual. Margem acompanha unidade declarada; confiança é proporção.
5. Datas reais e ordenadas: campo encerrado antes da publicação, acesso não anterior à publicação. Datas sem horário entram no fim do dia. Idade futura não vira zero. Soma não tem tolerância editorial: 1e-10 só para ponto flutuante; arredondamento excessivo exige correção documentada, nunca clamp.
6. Comece `pending`; revisão independente confirma fonte, orientação, denominador/registro e deduplicação antes de `reviewed`; `withdrawn` não entra. Registro+cenário+onda deduplica; conflito bloqueia cálculo; proveniência é reunida. Só última onda por instituto/cenário, empates por publicação/id estável.
7. Execute checks e revise API/navegador. Arquive dataset e parâmetros de históricos publicados: recalcular série não é preservar previsão imutável. Nunca importe fixtures na aplicação.

## Modelo A e avaliação

Peso ∝ exp(−idade/τ)/variância, idade desde fim do campo. τ=10 dias é escala, não meia-vida (τ·ln2≈6,93 dias). Variância amostral≈deff·p(1−p)/n útil. Variância preditiva=Σw²v + sigma comum² + sigma deriva²·dias até eleição. Erro comum não desaparece com mais pesquisas. House effects desabilitados.

Centro logit=log(μ/(1−μ)); sigma logit≈sigmaP/[μ(1−μ)]. Dados degenerados são recusados. Student df=5 reescalada por sqrt((df−2)/df), variância 1, aplicada em logit: não é sempre mais conservadora que normal. Mulberry32, seed explícita, 4000 amostras, pares antitéticos, quantil tipo 7 em (n−1)q. Mediana é transformação do centro simétrico; B usa complemento da mesma distribuição. Sigma zero/empates explícitos. Rótulos <0,1%/>99,9% não alteram número bruto.

`logit-v1-experimental`: deff=1,8, erro comum=0,02, deriva=0,003 proporção/raiz de dia são **hipóteses de engenharia não calibradas**. Alterar exige nova versão e avaliação, nunca só para passar teste. Não aplicamos house effects aprendidos com futuro nem reproduzimos modelo exato da ÍRIS.

CLI aceita dataset real conforme `evaluationDatasetSchema` (`lib/forecast/evaluate.ts`): raiz `dataVersion`, URLs `provenance`, `elections`; por eleição, `contest`, pesquisas, `officialShareA`, `resultSource`, parâmetros, `parameterProvenance` (`trainedOn`, `availableAt`, referência, `independentHoldout`) e `cutoffs`. Uma entrada por eleição, máximo 62 cortes. Nenhum dataset real está incluído.

```sh
node scripts/backtest-forecast.mjs --input /CAMINHO/dataset-real.json --output /CAMINHO/relatorio.json
```

MAE/RMSE, cobertura/largura, Brier e log loss; horizontes são agregados dentro de eleição antes da média entre eleições. Log loss protege p em [1e-6,1−1e-6] **só no escore**. Empate oficial não recebe escore binário. Sem treino em eleições anteriores, parâmetros disponíveis até o corte e holdout independente, métricas operacionais ficam `null`. Diagnósticos sem esses requisitos não são previsões produzíveis naquela data. Não há LOEO rotulado operacional. Sensibilidade: 0,5×/1,5× erro comum/deriva e remoção de instituto dominante; valores fora do schema falham. Não ajustar e avaliar repetidamente no mesmo conjunto. Três eleições não demonstram cobertura de 95%; fixtures só validam software.

## Snapshot do primeiro turno

Crie política real revisada: JSON com `valid` (códigos de `dvt` que integram válidos), `excluded` (demais destinos conhecidos, incluindo anulados/sub judice) e `reference` (documentação oficial). Sem política implícita nem identidade falsa entre todos os votos nominais e válidos.

```sh
node scripts/snapshot-turno1.mjs --output /CAMINHO/snapshots-turno1 --policy /CAMINHO/politica-destinacao.json
```

Configuração, BR, 27 UFs e ZZ sequencialmente; mínimo 250ms por instância, timeout 12s/arquivo, até duas repetições para rede/5xx. 403/404 não repetem; 429 encerra e informa Retry-After. Respeite essa espera antes de nova execução. Quatro consultas/s é **política conservadora do app**, não teto oficial nem limite global distribuído. Parecer consultado registra 100 req/s/IP oficiais; não aumentamos tráfego. Página oficial retornou 403 durante implementação: confira documentos atuais antes de operar.

`--election CODIGO` opcional deve coincidir com descoberta e payload; não há fallback 6257/6258. Fase oficial, turno/cargo/território e divulgação são validados. Conclusão exige `tf=s`, `and=f`, contagens de seções exatas, não `pst=100` arredondado; revisão documental com arquivos reais permanece necessária.

Arquivos originais/configuração têm URLs, coleta, horário da fonte, SHA-256 e versão do schema em manifesto. Diretório temporário promovido por rename para chave conteúdo/contexto/versão. Horário de fetch não muda idempotência. Coleta incompleta preserva arquivos recebidos e falha; manifesto diz **arquivo bruto, não aprovação de baseline**. Falha de configuração antes de obter contexto não produz baseline. Divergência/conclusão incompleta permite só uma nova coleta após 30s, nunca arredonda diferença nem promove aviso como sucesso.

Para baseline, arquivo de mapeamento segue entrada de `createBaseline`: `schemaVersion:'1'`, `target` (disputa confirmada), `verifiedAt`, `verificationUrl`, `secondRoundConfirmed:true`, duas entradas ordenadas `mapping` com `firstId`/`secondId`. `sourceElection`, `sourceHash`, `targetEvidenceHash` e territórios vêm da coleta. Além da aprovação humana, o CLI exige que os dois ids alvo correspondam ao arquivo BR oficial do segundo turno; preserva configuração e esse arquivo em outro arquivo imutável, referenciado por `targetEvidenceHash`. Finalistas nunca são inferidos por ranking/nome/sqcand presumido. Sem segundo turno aplicável, arquivo alvo disponível ou dupla confirmada, apenas arquivo bruto.

```sh
node scripts/snapshot-turno1.mjs --output /CAMINHO/snapshots-turno1 --policy /CAMINHO/politica-destinacao.json --mapping /CAMINHO/finalistas-verificados.json --baseline /CAMINHO/baseline.json
```

Soma exata de válidos e cada candidato BR=27 UFs+ZZ, conjuntos/destinos compatíveis, sem duplicatas. Baseline temporário no mesmo filesystem renomeado só após validação; falha conserva anterior. Revise antes de copiar baseline real para `data/forecast/baseline.json`.

## Live e coletor manual

Vc=a+b; R=Vexp−Vc≥0; A final=Σ(a+R·p restante), V final=ΣVexp. Observados nunca desaparecem/recebem incerteza. Fechamento oficial R=0 reproduz parcela/intervalo colapsado, inclusive vitória de B/empate, sem inventar desempate. Zero votos/denominador, baseline degenerado ou evidência nacional insuficiente produzem indisponibilidade, não falsa atualização do pré.

Volume experimental Vc/fração de seções, limitado a 0,5–2× válidos anteriores e nunca abaixo do observado; zero seções usa baseline. Incerteza lognormal do restante (sigma log-volume=0,1) e choques logit comum=0,08/territorial=0,12 afetam só votos não observados. Limiar nacional/local=5%; logit local degenerado não gera swing. Versão `LIVE_CONFIG`, parâmetros não calibrados. Parcial de UF versus UF inteira anterior não compara mesmas seções, não elimina viés capital/interior nem estima transferência individual. Não há probabilidade por UF ou intervalo monotônico.

Adaptador exige BR+28 parcelas, contexto/dupla/destinos/válidos conciliados. Horário da fonte, não fetch: idade máxima 600s e defasagem entre arquivos ≤120s. UF/ZZ ausente/retido/antigo bloqueia; fallback íntegro fica stale com horário original e chave completa. BR nunca vira 29ª parcela.

```sh
node scripts/collect-forecast-snapshots.mjs --output /CAMINHO/snapshots-live --baseline /CAMINHO/baseline.json --policy /CAMINHO/politica-destinacao.json
```

Uma coleta. Repetição manual, interromper Ctrl+C:

```sh
node scripts/collect-forecast-snapshots.mjs --output /CAMINHO/snapshots-live --baseline /CAMINHO/baseline.json --policy /CAMINHO/politica-destinacao.json --interval-seconds 60 --pre-as-of 2026-10-25T16:55:00-03:00
```

`--pre-as-of` é o corte real disponível do pré congelado, nunca futuro; produz `latest.json` somente após validação. Arquive dataset/parâmetros do pré junto. Falhas encerram coleta; nenhum serviço de recuperação automático. Snapshots imutáveis/idempotentes por conteúdo/contexto/schema. Fonte divergente pode ser arquivada mas não promovida a latest.

**Limitação operacional:** rota usa imports estáticos. Para testar live local, revise e copie `latest.json` para `data/forecast/live-snapshot.json`, baseline real para `baseline.json`, disputa/candidaturas/pesquisas correspondentes, novo build/restart (dev detecta alterações). Não é ingestão contínua de produção. Antes de ativação live pública falta fonte durável atualizável de snapshots com o mesmo contrato e revisão operacional; não foi provisionada. Polling do navegador não grava histórico.

## Gates e dependências reais

- Pré-agregação ligada, com pesquisas/candidaturas/disputa cadastradas. Elegibilidade depende do corte e das validações; não há relatório independente de calibração no checkout.
- Probabilidades: `evaluation.json` real conforme `evaluationMetadataSchema`, relatório independente, versões/hashes correspondentes, treino/avaliação separados e anteriores ao pleito, revisão de qualidade/holdout/operacional, publicação até o corte. Depois de revisão humana, `publicProbabilityEnabled=true` e novo build. Flag sozinha não habilita nada; JSON não substitui auditoria do relatório. Gate por modelo/modo, live requer avaliação própria.
- Live: baseline final conciliado, finalistas/mapping confirmados, política de destinos, snapshots atuais completos, avaliação específica e resolução da ingestão acima. `liveEnabled` continua false. Desabilitar: flags false e reconstruir.
- Não fornecidos: baseline/29 arquivos finais conciliados e mapping auditados, política revisada, snapshots atuais/ingestão contínua, datasets retrospectivos e relatório independente. Testes sintéticos não são evidência de qualidade eleitoral. Candidaturas e fontes cadastradas não foram novamente auditadas externamente por esta correção.

### Bloqueio auditável de probabilidades

`probabilityReason` permanece compatível (resumo humano); `probabilityBlocks` contém motivos cumulativos com `code` e `message`: publicação desligada, avaliação ausente/inválida, revisão/holdout/operacional ausentes, incompatibilidade de modelo/dados/parâmetros e avaliação/eleições indisponíveis no corte. Não envia conteúdo arbitrário de validação, credenciais ou relatório bruto ao navegador. A consulta pode estar `ready` e ainda ter probabilidades null: isso não é erro React nem de carregamento. Zero é exibido como zero segundo `probabilityLabel`; null nunca vira 0% ou 50%.

No checkout atual há **dois bloqueios concretos**: flag desligada e `evaluation.json=null`. Falta dataset retrospectivo auditável com pesquisas/resultados oficiais e proveniência, treino em eleições anteriores, parâmetros disponíveis à época, holdout independente por eleição, relatório operacional público com versões/hashes e data até o corte, e revisão humana documentada. Booleanos de metadados não comprovam calibração. Uma avaliação real futura deve ser conferida contra o relatório e os hashes antes de qualquer autorização; esta alteração não habilita publicação automaticamente.

`dataVersion=SHA256(JSON.stringify({polls,candidates,contest,baseline,snapshot}))`; `parametersHash=SHA256(JSON.stringify({pre:MODEL_CONFIG,live:LIVE_CONFIG}))`. Qualquer mudança nesses dados atuais invalida a vinculação da avaliação à dataVersion, inclusive uma nova pesquisa. Exige revisão/reavaliação documentada vinculada ao novo hash, não relaxamento silencioso da comparação. Avaliação não entra no próprio hash para evitar circularidade.

Empate exato no modelo contínuo com dispersão tem probabilidade zero, não uma impossibilidade de empate na contagem real discreta. Sem dispersão há tratamento degenerado próprio. Não mede “empate técnico”, sobreposição de intervalos ou disputa apertada; tal métrica exigiria definição e trabalho separados.

O gráfico converte cada data uma vez pelo contrato `timestamp`: datas sem hora no fim do dia de Brasília, offsets preservados. Círculos observados, linha reta/quadrados de mediana e faixa/segmentos preditivos de 95%; tabela e seletor permitem inspecionar pesquisas sobrepostas sem deslocar instantes. Escala completa por padrão; ampliada identificada contém todos os valores, intervalos, margem e 50%. Série **recalculada por corte com os dados desta versão**, não snapshots imutáveis de publicação. Sem nova pesquisa elegível o decaimento comum cancela na normalização; platôs da mediana podem ser corretos enquanto a incerteza muda. Pesos e parâmetros não foram alterados.

Evidências atuais: [VERIFICACAO-2026-10-24.md](VERIFICACAO-2026-10-24.md). [VERIFICACAO.md](VERIFICACAO.md) é o registro histórico de 15/10, anterior ao cadastro das pesquisas atuais. Metodologia acessível também em `/projecao/metodologia`.
