# Avaliação e prompt de implementação — Apuração Brasil 2026

Análise: 15/10/2026. Repositório consultado: `DevWesleyMedeiros/apuracao-brasil-2026`, branch `main`, commit `52a7e11293d116f11fdb6da289bbd31fc31c6829`.

## Parecer

A arquitetura proposta é uma boa base, mas os exemplos não estão prontos para produção. Recomendo implementar o agregador pré-eleitoral com rastreabilidade, estados sem dados, testes e metodologia primeiro. Implementar também a infraestrutura e o motor experimental ao vivo, mantendo a divulgação de probabilidades condicionada à qualidade dos dados e à avaliação do modelo. Não é necessário acrescentar ML, Kalman, PostgreSQL ou Vitest para entregar essa primeira versão.

### Problemas concretos encontrados

1. **Bug crítico em `live.ts`, seção 8.6:** `A += u.Vc + (u.Vexp - u.Vc) * p` atribui a A todos os votos já apurados, inclusive os de B. Executei o exemplo extraído do documento com A=40, B=60 e apuração=100%: retornou `pVitoriaA=1`, `media=1`, `lo=1`, `hi=1`. A contribuição correta começa com `u.a`. Além disso, o exemplo zera `Vc` abaixo de 5%, descartando votos observados. O limiar pode controlar o uso do swing local, mas nunca apagar os votos contados.
2. **Suporte ao segundo turno ausente:** `resultSchema` exige `t='1'`; `resolveElection` fixa 04/10/2026 e turno 1. `Result` não inclui turno e os caches de fallback não incluem o contexto eleitoral completo. O cabeçalho e o rodapé da página também citam primeiro turno.
3. **Vazamento temporal:** `aggregate` transforma idade negativa em zero e aceita pesquisas futuras. O schema não exige divulgação. Uma pesquisa cujo campo terminou em 10/10, mas que foi divulgada em 12/10, não pode aparecer na previsão de 11/10.
4. **Correlação:** pesquisas do mesmo instituto, ondas sobrepostas e múltiplos cenários da mesma amostra não são observações independentes. O erro comum não deve desaparecer ao acrescentar pesquisas.
5. **House effects frágeis:** erro contra resultado final mistura efeito de instituto, mudança da campanha e erro compartilhado. Não somar erros de candidatos diferentes sem alinhar orientação; erros de A e B podem se cancelar. Não aplicar automaticamente o erro do primeiro turno ao segundo, nem contar duas vezes a mesma evidência.
6. **Amostra efetiva:** `n*(A+B)/100` só é uma aproximação utilizável quando A e B são percentuais sobre o total de entrevistados. Se já estiverem em votos válidos, é necessário conhecer o denominador original. O teste “amostra 4× maior reduz sigma à metade” não vale para a incerteza total quando há pisos de erro.
7. **Distribuição:** `mu + sigma*t` pode sair de [0,1]. O campo `media` do motor ao vivo é, na verdade, a mediana. Definir distribuição, escala e estatística central explicitamente.
8. **Snapshot permissivo:** o script grava o baseline mesmo com divergências e arquivos não finalizados. Não valida integralmente os payloads, não verifica a soma de votos válidos e usa finalistas automáticos por votação. Pode sobrescrever um snapshot bom com coleta incompleta.
9. **UF não equivale a seção:** o modelo compara uma parcial de segundo turno com toda a UF do primeiro turno; isso não é comparar as mesmas seções. `municipal.ts` fornece catálogo/validação municipal; não há pareamento de seções já pronto. O avanço das seções não mede diretamente o avanço dos votos.
10. **Infraestrutura:** o projeto usa pnpm e testes Node existentes. `AGENTS.md` manda estender esse harness. `db/index.ts` usa Cloudflare D1; `db/schema.ts` está vazio. O exemplo com `pgTable` não se encaixa nessa configuração.
11. **Calibração:** três eleições com quatro horizontes são três eventos eleitorais, não doze eventos independentes. Leave-one-election-out não é retrospectiva operacional se usa eleições futuras para prever o passado. Separar validação cruzada por eleição de avaliação temporal estrita.
12. **Comunicação:** 99% no modelo não prova eleição definida. Evitar “praticamente decidido” e “empate técnico” como classes automáticas de probabilidade. Não exigir que a faixa encolha a cada atualização: nova evidência pode aumentar incerteza.

### Correções adicionais

- No exemplo com A=51,8% e B=48,2%, A está 1,8 p.p. acima de 50%, mas sua vantagem sobre B é 3,6 p.p.
- A documentação do TSE consultada informa 6257/6258 para eleição federal do primeiro/segundo turno e limite máximo de 100 requisições por segundo por IP. Os 4 req/s são a política conservadora do aplicativo, não o limite oficial anunciado. Manter a política conservadora; ela não é distribuída entre instâncias.
- A documentação pública da ÍRIS confirma agregação, simulações, avaliação histórica e distinção entre intenção atual e projeção eleitoral. Não fornece base para afirmar que o código proposto reproduz seu modelo exato ou que ela usa especificamente Kalman.
- Brancos, nulos e abstenção não equivalem a uma medida de rejeição a candidatos. Corrigir esse conceito no roadmap.
- Não realizei build ou suite completa do repositório: esta foi uma revisão de código e documentos. A execução foi o caso mínimo do motor estatístico anexado. Não coletei nem validei uma base real de pesquisas ou os 29 arquivos oficiais nesta avaliação.

## Prompt completo para colar no OpenCode

Copie a partir da próxima linha até “FIM DO PROMPT”. Os anexos originais são referências opcionais: as correções obrigatórias estão reproduzidas aqui.

---

Você está trabalhando no projeto `apuracao-brasil-2026`, aberto localmente no OpenCode. Implemente a feature “Sistema de Projeção Estatística para Segundo Turno”, com foco inicial na eleição presidencial brasileira, preservando o painel de apuração existente.

Atue como engenheiro fullstack sênior com cuidado estatístico. Execute a implementação e a verificação; não entregue apenas um plano. Faça mudanças pequenas e rastreáveis. Não publique, não faça push, não realize merge e não crie infraestrutura paga. Não adicione chamadas a LLM: o modelo OpenAI é a ferramenta de desenvolvimento, não parte do motor de projeção.

### 1. Inspeção obrigatória e compatibilidade

Leia `AGENTS.md`, instruções de subpastas, `package.json`, lockfile, `README.md`, `LEIA-PRIMEIRO.md`, `lib/catalog.ts`, `lib/election.ts`, `lib/tse.ts`, `lib/regional.ts`, `lib/municipal.ts`, `lib/result-client.ts`, `lib/deadline.ts`, rotas existentes, `app/page.tsx`, componentes de gráficos e `scripts/test-election.mjs`.

A referência analisada foi `main@52a7e11293d116f11fdb6da289bbd31fc31c6829`; o checkout pode ter evoluído. Use o código local como fonte atual. Inspecione git status e preserve alterações do usuário. Crie uma branch local `feat/second-round-forecast` se isso for adequado ao estado encontrado; nunca descarte trabalho nem force checkout.

Na referência havia Node >=22.13, pnpm 11.25.0, Next 16.3.4, React 19, TypeScript, Zod 3, Tailwind 4, Recharts, e dois alvos: Next e Vinext/Workers. Leia a documentação local relevante em `node_modules/next/dist/docs/` conforme `AGENTS.md`, quando disponível. Respeite o lockfile. Não migre frameworks, não troque o gerenciador e não acrescente Vitest por padrão: amplie o harness Node existente, extraindo helpers se necessário. Não apague testes anteriores.

### 2. Escopo e ordem de execução

Implemente em etapas verificáveis:

1. Contexto eleitoral explícito para turnos 1 e 2, preservando consultas existentes.
2. Contratos, validação de pesquisas, configuração versionada e testes de domínio.
3. Script seguro de snapshot do primeiro turno.
4. Agregador pré-eleitoral, distribuição limitada e avaliação retrospectiva.
5. API, página `/projecao`, metodologia e navegação.
6. Motor experimental ao vivo, adaptador de dados, coleta local de snapshots e testes adversariais.
7. Verificação dos dois runtimes e documentação de operação.

O MVP público é o agregador pré-eleitoral e sua metodologia. Implemente o motor ao vivo atrás de feature flag desabilitada por padrão. A falta de dados externos não deve impedir implementar e testar o software: entregue estados vazios funcionais e relate precisamente quais dados faltam. Nunca crie pesquisas, registros, nomes de finalistas, resultados ou métricas fictícias para preencher a produção.

Adie Kalman, ML, transferência individual de votos, mapas de probabilidade por UF e banco de dados. Séries temporais podem ser calculadas por cortes históricos estritos. Não extrapole pesquisas nacionais para probabilidades estaduais.

### 3. Contexto eleitoral e consulta ao TSE

Crie um contexto tipado contendo ciclo/ano, turno, data do pleito, cargo, código de eleição e abrangência. Acrescente o turno ao contrato normalizado. Evite parâmetros posicionais ambíguos; prefira objeto de opções, preservando compatibilidade com os consumidores atuais.

- Resolver configuração por ciclo + data + turno + cargo; rejeitar resultados ambíguos.
- Aceitar estruturalmente turnos 1 e 2, mas validar que o turno recebido corresponde ao solicitado. Não basta trocar literal por enum e aceitar qualquer turno.
- Validar fase oficial, eleição, cargo, território, tipo de abrangência e divulgação. Não permitir simulado em produção.
- Manter primeiro turno como comportamento padrão para chamadas antigas. Expor seleção explícita de turno na UI e API; nunca mudar silenciosamente para o mais recente.
- Nesta entrega, habilitar consulta de segundo turno apenas para presidente. Não oferecer segundo turno para senador ou proporcionais. Tratar cargos incompatíveis e não regressar o primeiro turno, DF, regiões, municípios e ZZ.
- Atualizar cabeçalho, rodapé, chaves de requisição, cancelamento e rótulos de data conforme seleção.
- Incluir contexto completo nas chaves de cache, fallback regional e resultados anteriores. Fallback de turno 1 jamais pode atender turno 2.
- Preservar códigos municipais de cinco dígitos e pertencimento à UF.
- Códigos federais 6257/6258 constam da documentação consultada, mas preferir descoberta validada. Um override CLI explícito precisa ser validado contra o arquivo baixado; não usar código silencioso de fallback.
- Reutilizar HTTP, timeout, backoff e validações existentes. Deduplicar consultas dentro da mesma operação; não guardar promises de I/O entre requisições Workers. Cachear somente dados serializáveis concluídos, com limite de tamanho.
- Manter política conservadora de espaçamento. Documentar que limite por instância não garante teto global. Não aumentar tráfego por existir um limite oficial maior.

### 4. Estrutura recomendada

Adapte nomes ao projeto, mantendo separação entre matemática pura e I/O:

```text
lib/forecast/
  types.ts
  config.ts
  eligibility.ts
  aggregate.ts
  distribution.ts
  rng.ts
  history.ts
  live.ts
  quality.ts
lib/forecast-server/
  service.ts
  tse-adapter.ts
app/api/forecast/route.ts
app/projecao/page.tsx
app/projecao/metodologia/page.tsx
components/forecast/
data/forecast/
scripts/snapshot-turno1.*
scripts/collect-forecast-snapshots.*
scripts/backtest-forecast.*
docs/forecast/
```

Funções matemáticas recebem dados, parâmetros e relógio explicitamente. Sem fetch, fs, Date.now ou Math.random ocultos no domínio. Scripts de coleta podem usar Node/fs; rotas devem funcionar sem sistema de arquivos gravável. Não importar `cloudflare:workers` no caminho de execução Next da feature. JSONs de produção pequenos podem entrar por import estático no servidor; não mandar arquivos brutos ou milhares de amostras Monte Carlo ao navegador.

### 5. Dados de pesquisas e governança

Defina schemas Zod para pesquisas, candidatos, configurações, baseline, resultados e metadados de avaliação. Trabalhe internamente com proporções [0,1]; registre explicitamente a unidade dos percentuais importados.

Cada pesquisa deve ter: id estável, registro TSE, instituto, contratante quando disponível, modo, ano, turno, cargo, abrangência, ids dos dois candidatos, cenário, datas de campo, `publishedAt`, URL do relatório, referência de verificação do registro, amostra, denominador dos percentuais, percentuais A/B, brancos/nulos/indecisos quando disponíveis, margem de erro e nível de confiança quando publicados, data de acesso e estado da curadoria. Não inventar campos ausentes.

Valide datas reais e ordenação; rejeite NaN/Infinity, percentuais negativos, soma impossível e amostra inválida. Defina tolerância apenas para arredondamentos comprováveis, documentada. Um regex valida formato do registro, não existência nem autorização de divulgação. Não use uma notícia duplicada como pesquisa nova. Deduplicate por registro + cenário + onda e mantenha proveniência.

Regra de elegibilidade em `asOf`: campo encerrado e publicação ocorrida até esse instante; ano, turno, cargo, abrangência e dupla de candidatos compatíveis; pesquisa revisada e não retirada. Não converter datas futuras em idade zero. Trate datas sem horário de forma conservadora e documentada no fuso America/Sao_Paulo.

Distinga percentuais sobre total de entrevistados de percentuais já em votos válidos. Para o primeiro caso, `p=A/(A+B)` e a aproximação `nValid=n*(A+B)/100` só se aplica às unidades correspondentes. Para o segundo, exija denominador útil/n efetivo conhecido ou política conservadora explicitamente marcada como hipótese. Não use o total n como se toda a amostra tivesse escolhido A ou B.

Não exigir arbitrariamente oito pesquisas para o código funcionar. Retornar contagem, número de institutos, recência e concentração de pesos. Separar capacidade de calcular de autorização para divulgar probabilidade.

Comece a base de produção vazia se não houver fontes verificadas disponíveis. Fixtures sintéticas ficam exclusivamente nos testes; não importar essas fixtures na aplicação. Documente como adicionar e revisar uma pesquisa real.

### 6. Modelo A — agregação e incerteza

Implemente uma versão simples e documentada:

- Recência baseada em campoFim; decaimento exponencial com escala configurável. Especificar diferença entre escala de decaimento e meia-vida.
- Erro amostral aproximado com efeito de desenho explícito. Não apresentar deff=1,8 ou sigmaSys=0,02 como valores validados.
- No MVP, usar somente a última onda elegível por instituto para cada disputa/cenário. Isso reduz repetição, mas não elimina correlação entre institutos; mantenha componente sistemático comum. Resolva empates de seleção de forma determinística.
- House effects desabilitados por padrão. Caso a base válida seja posteriormente fornecida, exija orientação consistente de candidato/campo, método e período de estimação, eleições usadas e incerteza. Não transferir automaticamente erro bruto de turno 1 para turno 2. Sem evidência, não inventar correções.
- Agregar por pesos normalizados de recência/variância, expondo pesos e pesquisas selecionadas para auditoria. Separar variância amostral, componente comum e deriva até a eleição. Não contar o mesmo componente duas vezes.
- Aplicar um modelo em escala logit para manter os resultados em (0,1). Definir e testar a conversão aproximada da incerteza de proporção para logit (`sigmaLogit ≈ sigmaP/[mu*(1-mu)]`), somente em domínio válido; rejeitar entradas degeneradas com mensagem clara. Não corrigir silenciosamente dados inválidos com clamp.
- Pode usar t de Student com graus de liberdade inteiros >2, reescalada para variância 1, como hipótese experimental. Configurar e validar a distribuição. Não afirmar que t produz probabilidade mais conservadora em todos os casos.
- PRNG com semente explícita, ordenação estável dos dados e parâmetros versionados. Não usar Math.random na saída pública.
- Estimativa central da distribuição será a mediana; nomear `median`/`mediana`, nunca `media` se não for média. Exibir a média ponderada das pesquisas separadamente quando necessário.
- Calcular quantis 2,5% e 97,5% com método documentado. Para B usar transformação complementar da mesma distribuição: mediana B=1-mediana A e intervalo B=[1-hiA,1-loA].
- Computar probabilidade de vitória por Monte Carlo com tamanho limitado no servidor. Informar que é condicional ao modelo e evitar mostrar 0%/100% como certeza quando apenas nenhuma simulação perdeu/ganhou. Usar rótulos '<0,1%' ou '>99,9%' quando cabíveis, sem alterar secretamente o número bruto.
- Tratar sigma zero e empates explicitamente. Para cenários com massa em empate, expor probabilidade de empate; não usar automaticamente `pB=1-pA`. Em distribuições contínuas não degeneradas, empate tem probabilidade zero.
- Para data posterior ao pleito, não continuar produzindo previsão pré-eleitoral como se fosse atual: permitir apenas histórico identificado ou modo live/finished.

Expor `calibrationStatus` e `publicProbabilityEnabled`. Sem relatório de avaliação e dados de qualidade, não retornar probabilidade como disponível na API pública: retornar null com motivo. O motor deve continuar testável offline. A UI pode apresentar agregação válida e informar indisponibilidade da probabilidade. Não basta esconder o número em CSS.

### 7. Histórico e avaliação

Recalcular séries com cortes `asOf`, usando apenas informações publicadas até cada corte. Uma pesquisa entra no histórico quando se torna pública, ainda que sua recência seja calculada pelo fim do campo. Registrar versões de dados e parâmetros. Não reescrever histórico publicado silenciosamente com calibração nova.

Criar CLI de avaliação que aceite datasets reais fornecidos e produza relatório com MAE/RMSE da parcela de votos, cobertura e largura dos intervalos, Brier e log loss, além de procedência dos dados e parâmetros. Proteger log loss numericamente e documentar a proteção.

Separar treino e avaliação por eleição. Para avaliação temporal operacional, treinar somente com eleições anteriores ao corte; se faltarem dados anteriores, declarar que não há teste operacional válido. Leave-one-election-out pode ser um diagnóstico separado, nunca apresentado como previsão produzível naquela data se treinou com futuro.

Não considerar horizontes da mesma eleição como amostras independentes. Não ajustar repetidamente parâmetros e reportar como teste independente o mesmo conjunto usado no ajuste. Não prometer calibração de 95% com apenas três eleições. Incluir análise de sensibilidade a deriva, erro comum e concentração de institutos. Resultados sintéticos servem para testes de engenharia, não validam acurácia eleitoral.

### 8. Snapshot auditável do primeiro turno

Reescreva ou corrija o script anexado em vez de copiá-lo diretamente. Ele deve:

- Consultar BR, ZZ e as 27 UFs com limites, timeout, retry seletivo e respeito a 429/403; evitar repetir 404 continuamente.
- Validar schema, eleição, turno, fase, cargo, abrangência e autorização de divulgação antes de aceitar dados.
- Guardar arquivos brutos e manifesto com URLs, horário de coleta, horário da fonte, identificadores, hash de conteúdo e versão do schema.
- Usar diretório temporário por execução e promover baseline validado atomicamente. Falha não deve sobrescrever baseline válido anterior. Não promover divergências como sucesso com apenas console.warn.
- Exigir critérios de conclusão compatíveis com a documentação oficial. Não confundir `pst` arredondado em 100 com encerramento confirmado.
- Conciliar votos válidos BR com soma das 27 UFs + ZZ e, para cada candidato compatível, votos nacionais com a soma territorial. Conferir conjuntos de candidatos, duplicidades e destinação dos votos; votos anulados/sub judice exigem tratamento explícito, não identidade falsa entre soma de todos os candidatos e válidos.
- Para coleta final coerente, igualdade deve ser exata. Caso arquivos estejam sendo atualizados, registrar divergência e tentar uma nova coleta limitada; nunca arredondar para fazê-la desaparecer.
- Exigir exatamente dois finalistas distintos explicitamente configurados e verificados. Pode sugerir os dois mais votados, mas não aprová-los automaticamente como finalistas oficiais.
- Mapear identidades entre turnos explicitamente. Não presumir que `sqcand`, nome ou posição no ranking bastam para relacionar disputas distintas.
- Recusar baseline de modelo quando não houver segundo turno aplicável ou dupla confirmada.
- Manter o snapshot bruto geral independente do mapeamento dos finalistas: é possível arquivar dados sem fingir que o baseline está pronto.

### 9. Modelo B — motor experimental ao vivo

Implementar como função pura e deixar divulgação live desabilitada por padrão. O adaptador exige 27 UFs + ZZ, sem duplicatas, mesmo contexto de eleição/turno/cargo, candidatos mapeados e dados válidos. BR serve à reconciliação, nunca como 29ª parcela da soma nacional.

Ao receber arquivo ausente, retido, inválido ou velho além do limite documentado: não excluir silenciosamente o território. Suspender nova projeção; se houver resultado anterior íntegro, mostrá-lo como stale, com seu horário original. Disponibilidade e atualidade precisam usar horário da fonte, não apenas hora do fetch. Definir tolerância de defasagem entre arquivos e expô-la.

Conservar votos observados sempre:

```text
Vc_u = a_u + b_u
Vexp_u >= Vc_u
R_u = Vexp_u - Vc_u >= 0
Afinal = soma(a_u + R_u * pRestante_u)
Vfinal = soma(Vexp_u)
parcelaA = Afinal / Vfinal
```

NUNCA usar `Vc_u` no lugar de `a_u` na soma de votos de A. Abaixo de limiar de evidência, não usar swing local, mas preservar a_u e b_u. O fallback de volume não pode ser menor que o observado. No encerramento confirmado, R=0; a parcela deve reproduzir os votos oficiais exatamente, com intervalo colapsado e estado `finished`, sem rótulo probabilístico de previsão. Empate numérico não significa vitória automática de B; reproduzir a situação oficial sem inventar desempate.

O swing logit por UF é uma aproximação experimental. Parcial da UF contra UF inteira do primeiro turno não corresponde às mesmas seções. Documentar esse viés. Não afirmar que eliminou o efeito capital/interior. Se não houver pareamento geográfico fino, não inventá-lo.

`Vc/fSecoes` pode ser usado apenas como estimativa experimental de volume, com limites e diagnóstico. Distinguir `sectionFraction` de `estimatedVoteFraction`. Não tratar a estimativa de votos restantes como certeza: incluir sensibilidade a comparecimento/volume e choques correlacionados nacional e por UF. Documentar unidades (proporção versus logit) e parâmetros não calibrados. Não estimar transferência individual dos eleitores somente por agregados territoriais.

Quando não houver evidência suficiente para swing nacional, retornar estado apropriado. Se mostrar Modelo A nesse momento, informar claramente que é previsão pré-eleitoral congelada, sem apresentá-la como atualização pela apuração.

Não impor faixa monotonamente decrescente. Testar assimetrias: capital chegando antes do interior, UFs pequenas chegando primeiro, nenhuma seção em uma UF, participação diferente entre turnos, 100% arredondado antes do fechamento, revisões de contagem e ausência de ZZ.

Criar coletor Node separado, executável manualmente, com snapshots imutáveis e chaves idempotentes por conteúdo/contexto/versão. Documentar execução contínua e interrupção. Polling do navegador não é coletor confiável. Não iniciar tarefa permanente nem configurar serviços externos nesta implementação. Sem coletor ativo, não dizer que o histórico está sendo gravado. Não criar PostgreSQL: o repositório possui D1 opcional e não tem banco provisionado para esta feature.

### 10. API e interface

Criar `GET /api/forecast` com parâmetros estritamente permitidos, sem aceitar URL arbitrária, número de simulações ou parâmetro estatístico livre pelo cliente. O escopo inicial é presidente nacional, segundo turno. Modos pré/live devem ser explícitos. Histórico aceito apenas em intervalo limitado e validado.

Usar união discriminada com estados como `disabled`, `no-data`, `insufficient-data`, `ready`, `stale`, `finished`. Não substituir ausência por 50/50. `stale` deve conservar o contexto e os horários originais do cálculo.

Metadados: eleição/turno/cargo/abrangência, modo, `asOf`, `computedAt`, `sourceUpdatedAt`, `modelVersion`, `dataVersion` ou hash, parâmetros/hash, seed, calibração, fontes, contagem de pesquisas/institutos, candidatos e avisos. Incluir `publicProbabilityEnabled` e motivo quando os campos probabilísticos forem null. Separar central agregado, mediana preditiva e probabilidade de vitória.

Cache limitado, chave completa com contexto, versão, modo e corte temporal; TTL maior no pré e curto no live. Usar `no-store` para falhas/stale conforme o padrão existente. Incluir cabeçalhos adequados, timeout/cancelamento e logs resumidos. Não disparar 29 fetches a cada render ou recalcular Monte Carlo sem mudança de dados/corte relevante. Medir desempenho no ambiente, sem prometer latência universal de 300 ms.

UI em português, responsiva e acessível, integrada ao estilo existente:

- Navegação entre apuração oficial e projeção.
- Aviso persistente “Projeção estatística — não é resultado oficial”.
- Diferença visível entre percentual de votos estimado e chance de vitória.
- Indicador/pêndulo em SVG opcional, sem movimento contínuo obrigatório; respeitar reduced motion.
- Tabela de estimativas com fontes, intervalo de 95% condicionado ao modelo, versão e atualização.
- Gráfico com pontos das pesquisas e série estritamente temporal; separar intenção atual de projeção para a eleição. Não desenhar curva falsa se não houver dados.
- Tabela acessível equivalente ao gráfico, contraste e navegação por teclado; não depender apenas de cores.
- Estados vazio, insuficiente, erro com nova tentativa, stale e desabilitado. Falha da feature não derruba apuração.
- Labels neutros: “probabilidade estimada de vitória”, “estimativa experimental”. Não usar “praticamente decidido”, “eleito” pelo modelo ou “empate técnico” derivado só de faixa de probabilidades.
- Página de metodologia explicando fórmulas, hipóteses, fontes, limitações, mudança de parâmetros e critérios de habilitação. Resultado oficial só vem do TSE.

### 11. Testes obrigatórios

Ampliar o harness Node. Testar funções reais, não reimplementações das fórmulas no teste. Fixtures eleitorais sintéticas exclusivamente nos testes. Cobertura mínima de comportamentos:

1. Turnos corretos aceitos; outro turno/fase/eleição/cargo/território recusados; cache não cruza turnos.
2. Regressão de municípios com zeros, DF, ZZ, regiões completas, cancelamento e votos retidos.
3. Pesquisas futuras e ainda não publicadas excluídas; corte no dia de divulgação, duplicatas, cenários incompatíveis e datas inválidas.
4. Denominadores total/válidos tratados corretamente; unidades, NaN, Infinity e percentuais inválidos recusados.
5. Uma pesquisa sem correção reproduz sua parcela; recência reduz peso; nova cópia da mesma pesquisa não altera resultado; componente comum não desaparece ao aumentar a amostra.
6. Mesmos dados, ordem canônica, seed e parâmetros produzem mesma saída. Probabilidades/quantis válidos; complementaridade A/B; distribuição simétrica centrada em 0,5; tratamento explícito de empate e sigma zero.
7. Histórico não recebe dados publicados no futuro nem house effects aprendidos com eleição avaliada.
8. Snapshot incompleto/divergente não substitui baseline bom; duplicidade e finalistas inválidos falham.
9. Regressão crítica: a=40, b=60, conclusão=100% -> parcela A=0,4 e intervalo [0,4;0,4], nunca 1. Repetir com múltiplas UFs e vitória de B.
10. Apuração abaixo de 5% preserva votos observados; zero votos, zero denominador, Vexp abaixo do observado e limites de logit tratados sem corrupção.
11. 27 UFs + ZZ somados uma vez; BR só reconcilia; UF/ZZ ausente, stale ou withheld bloqueia nova projeção.
12. API desabilitada/sem dados não vaza probabilidades nem fixtures. Configurações experimentais não se tornam calibradas automaticamente.
13. Smoke de API e UI nos estados principais; verificar layout mobile, tabela, rótulos, acessibilidade e preservação dos filtros existentes.

### 12. Verificação e entrega

Execute `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build:next` e `pnpm build`, respeitando as instruções locais. Registre falhas preexistentes separadamente e não diga que passou quando não executou. Testes de domínio não devem exigir rede do TSE. Se ambiente bloquear build ou navegador, informe comando, erro e risco restante sem fabricar resultado.

Atualize o README e crie documentação com arquitetura, metodologia, contratos, comandos, configuração, passos para inserir dados reais, gerar baseline, rodar backtest, coletar snapshots e habilitar/desabilitar a feature. Corrigir menções incompatíveis: banco PostgreSQL já existente, troca automática de turno, limite oficial de 4 req/s e brancos/nulos como rejeição.

Documente que a implementação está pronta separadamente de dados/calibração/ativação pública. Sem pesquisas ou baseline reais, concluir código e testes com estado indisponível; listar a dependência real restante. Não marcar dados sintéticos como evidência de qualidade estatística.

Na resposta final, apresentar: arquivos alterados e motivo, fluxos implementados, comandos executados e resultados, limitações conhecidas, estado das flags, dados externos faltantes e instruções exatas para executar localmente. Não fazer deploy, push ou merge.

FIM DO PROMPT

## Referências consultadas

- Repositório: https://github.com/DevWesleyMedeiros/apuracao-brasil-2026/tree/52a7e11293d116f11fdb6da289bbd31fc31c6829
- TSE — documentação de divulgação: https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados
- TSE — Resolução 23.747/2026: https://www.tse.jus.br/legislacao/compilada/res/2026/resolucao-no-23-747-de-26-de-fevereiro-de-2026
- ÍRIS — metodologia: https://voga-iris.com/metodologia
- ÍRIS — institutos: https://voga-iris.com/institutos
- Estudo sobre erros de pesquisas e correlação: https://sites.stat.columbia.edu/gelman/research/published/polling-errors.pdf
- Anexos fornecidos: PROJECAO-ELEITORAL(1).md; projeção-eleitoral(2)(1).md; snapshot-turno1.mjs; captura da conversa de planejamento.
