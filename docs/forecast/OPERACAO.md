# Projeção presidencial de segundo turno

## Estado e arquitetura

Software experimental, **não modelo estatisticamente calibrado**. Em `lib/forecast/config.ts`: `preEnabled=true`, `liveEnabled=false`, `publicProbabilityEnabled=false`. As 12 pesquisas existentes foram preservadas integralmente; nenhum peso ou parâmetro foi recalibrado. Baseline e live-snapshot continuam `null`. O `evaluation.json` local encontrado com `true` foi preservado: booleano **inválido**, não aprovação. Pré pode retornar `ready` com probabilidades null; live continua `disabled`. O coletor Node descrito abaixo é independente do site; nenhuma infraestrutura foi provisionada. D1 existente não foi utilizado: não há armazenamento de artefatos provisionado para esta feature.

- `lib/electoral-context.ts`, `election.ts`, `tse.ts`: descoberta exata por ciclo/data/turno/cargo, validação oficial e transporte. Padrão legado é primeiro turno; segundo turno explícito, somente presidente. Municípios preservam cinco dígitos e pertencimento à UF; DF, ZZ e regiões completas continuam suportados. Cache/fallback não cruzam turnos ou eleições.
- `lib/forecast/`: schemas Zod e matemática pura; relógio, seed, dados e parâmetros explícitos. Sem fetch/fs/aleatoriedade ambiente.
- `lib/forecast-server/`: dados, adaptadores e política de publicação. Rotas sem filesystem gravável, sem `cloudflare:workers` no caminho Next.
- `scripts/`: CLIs manuais Node e extensão do harness existente, sem novo test runner. Fixtures sintéticas só nos testes.

Unidades internas: proporções [0,1]. `weightedPollShare` é média ponderada das pesquisas; `median` é mediana preditiva; `probabilityA/B/Tie` são chances condicionais ao modelo, não parcela de votos. `sectionFraction` mede seções; `estimatedVoteFraction` depende do volume estimado.

## Apuração oficial presidencial · 25/10/2026

- Entrada compartilhável: `/?round=2`; `/?round=1` preserva acesso ao primeiro turno. A partir de 00h de 25/10/2026 em America/Sao_Paulo, a página sem turno válido inicia no segundo. Regra pura com relógio injetado nos testes; resolução no servidor por requisição e valor serializado para hidratação. API mantém padrão legado de primeiro turno.
- Segundo turno suporta somente presidente, inclusive nacional, UFs, exterior, regiões completas e municípios. Não anuncia governadores. Troca de contexto limpa resultado antes de exibir o novo recorte; abortos, sequência e chave impedem respostas antigas.
- Atualização automática a cada 60s, sem sobreposição e pausada em aba oculta; retorno à aba consulta imediatamente se a última tentativa estiver vencida. Falha preserva o resultado e horário da consulta bem-sucedida, com alerta. `stale` do servidor mantém o horário original da fonte; horário da consulta no navegador não é atualização da fonte. `waiting`, `withheld`, `partial` e `finished` continuam distintos.
- A configuração para resultados diretos é reconsultada em até 60s; catálogo municipal mantém TTL de uma hora. O coletor redescobre a eleição em **cada rodada**, sem cache de erros de descoberta por uma hora. Resultados filtrados diretos mantêm cache/fallback por contexto, sem promises compartilhadas entre requisições Workers. O nacional pode usar o armazenamento configurado, independentemente das UFs e do baseline. Um build não garante disponibilidade da fonte ou capacidade sob carga.

Smoke manual somente leitura, uma passagem sequencial (1s entre consultas, timeout de 30s, sem retry automático):

```sh
node scripts/smoke-official-runoff.mjs --url http://127.0.0.1:3000
```

Consulta nacional, RS, ZZ, Sul, catálogo municipal do RS e Porto Alegre com `round=2`. Código municipal vem do catálogo e código de eleição das respostas; nenhum fallback fixo. Valida HTTP/JSON, contexto, identificação territorial e estados; aceita zeros antes da abertura. Erros, stale ou catálogo ausente geram saída não zero; 429 interrompe consultas restantes. Não repetir agressivamente; observar Retry-After e diagnóstico. Pode receber URL base do ambiente autorizado, sem credenciais.

Checklist: conferir relógio/turno e link compartilhável; executar smoke; revisar fonte versus consulta e alertas de stale; conferir nacional/RS/ZZ/Sul/Porto Alegre; testar retorno à aba; deixar flags probabilísticas/live desligadas; manter acesso direto a resultados.tse.jus.br em contingência. Não substituir indisponibilidade por dados sintéticos.

API discriminada: `disabled`, `no-data`, `insufficient-data` têm `estimate:null`; `ready`, `stale`, `finished` carregam estimativas. Metadados: contexto, modo, corte/cálculo/fonte, versão/hashes, seed, calibração, fontes, candidatos, contagem, pesos e concentração. `finished` não publica probabilidade de previsão. `stale` preserva horários e contexto originais. Ausência nunca significa 50/50.

Cache só de valores concluídos (32 respostas, oito fallbacks live), nunca promises entre requisições Workers. Pré TTL 300s, com autorização revalidada; live revalida os insumos por chamada. Corte atual em baldes de cinco minutos/15 segundos respectivamente, sem informação posterior ao corte. APIs de resultados/projeção e leitura HTTPS usam `no-store`, inclusive erros/stale: revogação não pode ficar escondida em CDN. Reiniciar perde fallback em memória, não o histórico do coletor. Avaliação tem identidade própria na chave; nenhum arquivo bruto ou amostra Monte Carlo vai ao navegador.

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

O CLI agora escreve envelope v2 com `historicalDatasetHash` canônico do input, protocolo/transformação, identidades dos parâmetros avaliados e relatório. Imprime `reportHash` do artefato completo, sem campos temporais não determinísticos; duração fica apenas no log. Não gera aprovação nem preenche `evaluation.json`; auditor deve conferir input/relatório/metadados. `dataVersion` dentro do relatório é a referência histórica fornecida no dataset, nunca a coleta operacional atual.

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

## Ingestão oficial contínua e armazenamento dinâmico

Marco configurado: **2026-10-25T17:00:00-03:00** (`DISCLOSURE_AT`). Nunca determina disponibilidade. O arquivo oficial pode continuar `waiting` ou `withheld` depois das 17h. 404 produz indisponibilidade explícita, sem nomes/votos fabricados. Eleição é descoberta por ciclo/data/fase/turno/cargo, sem fallback numérico.

### Comandos locais

Uma coleta (não exige baseline nem política):

```sh
pnpm collect:official
```

Processo persistente, intervalo **após terminar** a rodada, sem sobreposição; Ctrl+C ou SIGTERM cancela requisição/espera e encerra:

```sh
pnpm collect:official:watch --interval-seconds 60
```

Padrões: artefatos em `data/forecast/`, histórico em `.forecast-operation/` (ignorados pelo Git, sem commits automáticos). Alternativa:

```sh
node scripts/collect-forecast-snapshots.mjs --mode continuous --interval-seconds 60 --output /CAMINHO/artefatos --history /CAMINHO/historico
FORECAST_STORAGE=local FORECAST_DATA_DIR=/CAMINHO/artefatos pnpm dev:next
```

Para o diretório padrão: `FORECAST_STORAGE=local pnpm dev:next`, `FORECAST_STORAGE=local pnpm start:next` após build, ou o equivalente Vinext. Em Next dev, sem configuração explícita, tenta leitura local; ausência de `current.json` permite consulta direta oficial. Em produção, sem configuração de armazenamento, mantém consulta direta ao TSE; **não importa snapshot de build**. Não iniciar o coletor numa rota nem no navegador.

### Arquivos e promoção

- `polls.json` (plural): pesquisas; nunca é escrito pelo coletor. Não há `poll.json` nem segunda fonte de pesquisas.
- `data.json`: schema `officialSnapshotSchema` v1; **nacional oficial do turno 2**, não pesquisas/baseline. Contexto, fase, estado, fonte, coleta, `fetchedAt` original, horário da fonte, última tentativa, stale e SHA-256 do JSON canônico. Configuração e payload originais permitem redescobrir/renormalizar na leitura. Sem arquivo: `result=null`, sem candidatos/votos sintéticos.
- `baseline.json`: referência histórica do turno 1; gerada apenas pelo processo revisado `snapshot-turno1.mjs` acima, nunca pelo coletor live.
- `live-snapshot.json`: contrato estrito original (`frozenPreAsOf`, `files`, `policy`), somente BR + 27 UFs + ZZ aprovados. Ausência de política/baseline/pré, retenção, defasagem ou divergência BR/parcelas bloqueia promoção; conserva `null`/último íntegro. **Ter 29 downloads não significa aprovação estatística.**
- `versions/<SHA256>.json`: conjunto imutável com nacional e produto estatístico (este inclui baseline e pré exatos), cada qual com identidade e horários próprios. `current.json` é o ponteiro atômico de versão. Consumidores **não juntam** espelhos mutáveis de rodadas diferentes; validam ponteiro/hash/schemas/contexto. Nacional é promovido assim que validado, antes da coleta territorial.
- `status.json`: última tentativa do coletor, ligada à identidade nacional, sem alterar o horário original da fonte/coleta. `data.json` é espelho individual atômico; leituras conjugadas usam exclusivamente o ponteiro. Uma falha no meio da gravação não troca o ponteiro antes do conjunto íntegro.
- `.forecast-operation/collections/<hash>/`: bytes originais e manifesto de contexto, URLs, timestamps e hashes; coletas parciais ficam aqui com diagnóstico, nunca como live íntegro. Identidade exclui fetchedAt: consultas idênticas não duplicam o histórico. `versions/` também não cresce por consulta idêntica; mudanças de diagnóstico podem gerar uma versão operacional distinta.

Correções oficiais, inclusive reduções de votos, passam novamente por validação, são arquivadas e registradas como `official-correction-revalidated`, com transições em `.forecast-operation/corrections/`; não há filtro genérico de monotonicidade. Retenção não é interpretada como redução para zero. Hash canônico normalizado e hash dos bytes são produtos distintos e ambos são auditáveis. Os horários de produtos diferentes **não** representam uma leitura simultânea.

### Limites, recuperação e intervenção

Configuração → nacional → territórios em sequência, espaçamento de 1s além da proteção do transporte. Timeout 12s por requisição incluindo corpo. Rede/5xx: até duas repetições, backoff exponencial limitado com jitter; demais erros não são repetidos dentro da rodada. 404 é arquivo ausente; retenção é `withheld`, não erro de transporte. 429 suspende a rodada e respeita `Retry-After` (segundos ou data HTTP); espera pelo maior valor entre intervalo/backoff/Retry-After. Backoff de rodadas limitado a 10 minutos, exceto `Retry-After` maior. **403 encerra e exige intervenção**, sem retry agressivo. Erro de schema/contexto bloqueia promoção e redescobre configuração na próxima rodada; se persistir, conferir contrato oficial antes de intervir. Falha de disco exige corrigir permissões/espaço, não editar o ponteiro manualmente.

Falha nacional preserva último produto, horário original e status stale. Falha territorial não invalida um novo nacional válido; grava bloqueio estatístico específico. Reinício lê a última versão validada. Não remover arquivos íntegros para “recuperar”. Mantenha apenas **um processo escritor por diretório** (não há lock distribuído). Para recuperar, corrigir a causa e reiniciar o mesmo comando; não é necessário rebuild para ler novas versões. Logs curtos incluem duração, estado, idade da fonte e bloqueio. Idade do nacional >600s ou coletor sem tentativa >120s gera alerta; não converte espera em parcial.

### Pré congelado real

Capturar **antes ou no marco**, com relógio real. Não aceita capturas retroativas após o marco, nem pesquisas publicadas depois do corte; não usa horário futuro. Arquiva todas as pesquisas originais separadamente, e apenas as elegíveis entram no pré congelado:

```sh
node scripts/freeze-forecast-pre.mjs --output .forecast-operation/frozen-pre.json
```

`--as-of ISO_COM_FUSO` opcional só restringe o corte; não permite fingir captura passada. Copiar o arquivo e `pre-archives/` para armazenamento seguro. Nesta execução foi capturado em **2026-10-25T19:38:09.340Z (16:38:09 Brasília)**, com as 12 pesquisas, arquivo `e396283953e2751fdcf9598a010437bcad591d0a8ffcfe3189c0afb9fd2bb9b9`. Nada foi reescrito em `polls.json`. Isso preserva proveniência, não comprova calibração.

Somente quando existirem insumos reais revisados:

```sh
node scripts/collect-forecast-snapshots.mjs --mode continuous --interval-seconds 60 --baseline /CAMINHO/baseline.json --policy /CAMINHO/politica-destinacao.json --frozen-pre .forecast-operation/frozen-pre.json
node scripts/check-live-snapshot.mjs --data-dir data/forecast
```

O segundo comando é teste **local explícito** do motor com contratos reais completos e atuais. Não muda flags nem publica probabilidades. Sem conjunto válido encerra com diagnóstico, não promove fixtures. `--pre-as-of` antigo foi substituído por `--frozen-pre`: um horário isolado não prova congelamento.

### Vercel / Workers: configuração pendente

**Atualizar arquivos no computador não atualiza o site publicado.** Não usar filesystem gravável do deploy como persistência; nenhuma rota escreve artefatos. O adaptador `HttpsSnapshotReader` é compatível com ambos os alvos, mas exige origem durável externa realmente publicada:

```text
FORECAST_STORAGE=https
FORECAST_ARTIFACT_ORIGIN=https://ORIGEM-FIXA/artefatos/
FORECAST_ARTIFACT_TOKEN=<somente se exigido pelo armazenamento>
```

Variáveis exclusivamente no servidor, nunca `NEXT_PUBLIC_*` nem query string. HTTPS fixo, sem credenciais na URL/redirects, autenticação Bearer opcional, timeout total 10s/arquivo, limite de 12MB e validação integral. Publicador externo deve enviar `versions/<hash>.json` imutável **antes** de trocar `current.json` atomicamente; publicar também `status.json` e `evaluation.json` (registro v2 ou null). Se falhar leitura/autorização, bloqueia projeção; não reutiliza avaliação estática como aprovação. Espelhos `data.json`/`live-snapshot.json` não são protocolo de transação entre produtos.

Pendências externas: escolher/provisionar pelo operador uma origem durável, mecanismo de publicação atômica e execução persistente do coletor/job único, configurar segredo/origem e testar o deploy. Não há uploader universal implementado, recurso novo provisionado, loop serverless, push nem deploy. D1 do projeto não tem contrato de artefatos existente para reaproveitar com segurança. Não declarar ingestão de produção ativa apenas por definir as variáveis.

### Verificação da ingestão

```sh
# Requer build:next; usa servidor/diretório isolados e fixtures só de teste.
node scripts/smoke-ingestion-local.mjs --port 3012
# Servidor real local iniciado em outro terminal com FORECAST_STORAGE=local.
node scripts/smoke-official-runoff.mjs --url http://127.0.0.1:3010
node scripts/smoke-forecast.mjs --url http://127.0.0.1:3010 --evaluation-state invalid
```

O último parâmetro corresponde ao `true` inválido preservado neste checkout; para `evaluation.json=null`, usar `--evaluation-state missing` (padrão). Não relaxa a exigência de bloqueio. O smoke HTTP isolado cobre espera, parcial, retenção, conclusão, corrupção de ponteiro/recuperação, ausência ou invalidade do baseline e atualização de arquivo sem rebuild/restart. **Não é teste de navegador.** Evidências reais e limitações: [VERIFICACAO-INGESTAO-2026-10-25.md](VERIFICACAO-INGESTAO-2026-10-25.md).

## Motor live (continua desabilitado)

Vc=a+b; R=Vexp−Vc≥0; A final=Σ(a+R·p restante), V final=ΣVexp. Observados nunca desaparecem/recebem incerteza. Fechamento oficial R=0 reproduz parcela/intervalo colapsado, inclusive vitória de B/empate, sem inventar desempate. Zero votos/denominador, baseline degenerado ou evidência nacional insuficiente produzem indisponibilidade, não falsa atualização do pré.

Volume experimental Vc/fração de seções, limitado a 0,5–2× válidos anteriores e nunca abaixo do observado; zero seções usa baseline. Incerteza lognormal do restante (sigma log-volume=0,1) e choques logit comum=0,08/territorial=0,12 afetam só votos não observados. Limiar nacional/local=5%; logit local degenerado não gera swing. Versão `LIVE_CONFIG`, parâmetros não calibrados. Parcial de UF versus UF inteira anterior não compara mesmas seções, não elimina viés capital/interior nem estima transferência individual. Não há probabilidade por UF ou intervalo monotônico.

Adaptador exige BR+28 parcelas, contexto/dupla/destinos/válidos conciliados. Horário da fonte, não fetch: idade máxima 600s e defasagem entre arquivos ≤120s. UF/ZZ ausente/retido/antigo bloqueia; fallback íntegro fica stale com horário original e chave completa. BR nunca vira 29ª parcela.

Não foi relaxada idade de territórios finalizados: final antigo e parcial antigo continuam bloqueados. Uma futura exceção exigiria comprovação oficial de conclusão estável e conciliação; não inferir conclusão por percentual arredondado. Ao fim, resultado oficial é reproduzido sem probabilidade prospectiva.

## Gates e dependências reais

- Pré-agregação ligada, com pesquisas/candidaturas/disputa cadastradas. Elegibilidade depende do corte e das validações; não há relatório independente de calibração no checkout.
- Probabilidades: `evaluation.json` real conforme registro v2 abaixo, relatório independente, treino/avaliação separados e anteriores ao pleito, revisão documentada/holdout/operacional, validade temporal e disponibilidade até o corte. **Continuam desligadas nesta tarefa.** Flag sozinha não habilita nada; JSON não substitui auditoria do relatório. Pré não autoriza live.
- Live: baseline final conciliado, finalistas/mapping confirmados, política de destinos e snapshots atuais completos. Probabilidades exigem avaliação específica adicional; motor local não a fabrica. `liveEnabled` continua false.
- Não fornecidos: baseline/29 arquivos finais conciliados e mapping auditados, política revisada, snapshots atuais/ingestão contínua, datasets retrospectivos e relatório independente. Testes sintéticos não são evidência de qualidade eleitoral. Candidaturas e fontes cadastradas não foram novamente auditadas externamente por esta correção.

### Bloqueio auditável de probabilidades

`probabilityReason` permanece compatível (resumo humano); `probabilityBlocks` contém motivos cumulativos com `code` e `message`: publicação desligada, avaliação ausente/inválida, revisão/holdout/operacional ausentes, incompatibilidade de modelo/dados/parâmetros e avaliação/eleições indisponíveis no corte. Não envia conteúdo arbitrário de validação, credenciais ou relatório bruto ao navegador. A consulta pode estar `ready` e ainda ter probabilidades null: isso não é erro React nem de carregamento. Zero é exibido como zero segundo `probabilityLabel`; null nunca vira 0% ou 50%.

No checkout atual há **dois bloqueios concretos**: flag desligada e `evaluation.json=true` inválido (preservado do trabalho local). Também `null` continua bloqueado. Falta dataset retrospectivo auditável com resultados/proveniência, treino anterior, parâmetros disponíveis à época, holdout independente, relatório público com hashes e revisão humana documentada. Booleanos não comprovam calibração. Esta alteração não autoriza publicação.

### Identidades e migração de avaliação

Serialização canônica v1 (`lib/forecast/identity.ts`): objetos com chaves ordenadas por UTF-16, arrays na ordem original, JSON finito, sem undefined/datas implícitas/espaços; SHA-256 UTF-8. Bytes originais do TSE são arquivados com hash separado.

1. `parametersHash`: pré = modo + MODEL_CONFIG + transformação; live = modo + LIVE_CONFIG + configuração do pré **realmente usado** + transformação. Nenhum parâmetro mudou. Mudança de algoritmo/transformação exige versionar `TRANSFORMATION_VERSION`/modelo e avaliar/revisar.
2. Avaliação: `evaluationRegistrySchema` v2, `{schemaVersion:'2',pre:<metadado ou null>,live:<metadado ou null>}`. Cada `evaluationMetadataSchema` exige modo/versão/hash de parâmetros, `historicalDatasetHash`, `reportHash`, URL/protocolo, escopo (ano/turno/cargo/BR), transformação, dependências (`baselineHash`, `policyHash`, nulos no pré), publicação/revisão/validUntil/referência da revisão e eleições independentes. Conferir hashes contra o **dataset histórico e relatório arquivados**, não a coleta corrente. Baseline/política diferentes requerem revisão/avaliação explicitamente vinculada aos novos hashes; não há wildcard. Schema antigo, booleanos, null ou campos desconhecidos ficam bloqueados; não há migração automática para aprovado.
3. `operationalHashes`: pesquisas, candidatos, contexto e, no live, baseline/política/snapshot/pré congelado efetivamente usados. `dataVersion` é hash desses hashes. Novas observações compatíveis mudam dados/cache/auditoria, **não** o dataset histórico avaliado. Avaliação/hash/flags integram autorização/chave separadamente. API informa `evaluationHash` e identidade histórica quando reconhecida.

Fallback exige mesmo contexto, modelo, parâmetros, baseline, política, candidatos e pré congelado. Mantém corte/cálculo/fonte e hashes operacionais originais; revalida autorização corrente, revogação e validade antes de devolver probabilidades. Não há cache HTTP de probabilidades. Avaliação pré não aprova live; mudanças de parâmetros invalidam o gate. Testes com avaliação aprovada usam apenas fixtures sintéticas locais.

Empate exato no modelo contínuo com dispersão tem probabilidade zero, não uma impossibilidade de empate na contagem real discreta. Sem dispersão há tratamento degenerado próprio. Não mede “empate técnico”, sobreposição de intervalos ou disputa apertada; tal métrica exigiria definição e trabalho separados.

O gráfico converte cada data uma vez pelo contrato `timestamp`: datas sem hora no fim do dia de Brasília, offsets preservados. Círculos observados, linha reta/quadrados de mediana e faixa/segmentos preditivos de 95%; tabela e seletor permitem inspecionar pesquisas sobrepostas sem deslocar instantes. Escala completa por padrão; ampliada identificada contém todos os valores, intervalos, margem e 50%. Série **recalculada por corte com os dados desta versão**, não snapshots imutáveis de publicação. Sem nova pesquisa elegível o decaimento comum cancela na normalização; platôs da mediana podem ser corretos enquanto a incerteza muda. Pesos e parâmetros não foram alterados.

Evidências atuais: [VERIFICACAO-2026-10-24.md](VERIFICACAO-2026-10-24.md). [VERIFICACAO.md](VERIFICACAO.md) é o registro histórico de 15/10, anterior ao cadastro das pesquisas atuais. Metodologia acessível também em `/projecao/metodologia`.
