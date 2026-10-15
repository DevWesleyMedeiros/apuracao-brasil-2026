# Evidências de verificação — 15/10/2026

Branch mantida: `feat/second-round-forecast`. Árvore inicialmente limpa. Node 24.21.0, pnpm 11.25.0; dependências/lockfile não alterados. Sem push, merge, deploy, infraestrutura ou coletor permanente.

## Comandos e resultados reais

| Comando | Resultado final |
| --- | --- |
| `pnpm test` | Passou, harness Node existente ampliado, sem rede TSE |
| `pnpm lint` | Passou, sem erros/avisos |
| `pnpm build` | Passou, Vinext/Vite/Workers; aviso informativo de classificação estática de páginas `?` |
| `pnpm build:next` | Passou, Next 16.3.4; rotas `/`, `/projecao`, metodologia e três APIs geradas |
| `pnpm typecheck` | Passou após o build Next final |
| `git diff --check` | Passou |
| `pnpm start:next --port 3001` + `node scripts/smoke-forecast.mjs --url http://127.0.0.1:3001` | Smoke API/HTML passou |
| `pnpm start --port 8787` + `node scripts/smoke-forecast.mjs --url http://127.0.0.1:8787` | Smoke API/HTML passou em Wrangler local |
| `node scripts/snapshot-turno1.mjs` sem argumentos | Recusou com uso esperado (exit 1); não houve coleta real |

Smoke verifica pré `no-data`, live `disabled`, estimativa null, candidaturas vazias, probabilidades públicas bloqueadas, `no-store`, parâmetros desconhecidos/repetidos/futuros inválidos, guardas de segundo turno/cargo/código municipal, HTML/navegação/aviso/metodologia em português. Não consulta arquivos reais do TSE.

Medição final HTTP local, incluindo transporte/inicialização: Next pré 625,7ms/live 75,2ms; Workers pré 399,0ms/live 33,8ms. São estados vazios e medidas pontuais, não benchmark universal nem evidência de latência para dados reais. Benchmark de engenharia do harness: dez agregações de dois institutos sintéticos ×4000 sorteios, 74,1ms numa execução e 406,0ms na execução final, ilustrando a variabilidade local. Isso não mede precisão eleitoral.

## Falhas encontradas e tratamento

- **Preexistente:** primeiro `pnpm test` falhou com `ERR_MODULE_NOT_FOUND` de `tse.mjs` importando `election` sem extensão. Harness adaptava apenas aspas simples; corrigido para ambos os estilos, sem remover testes.
- Typecheck inicial passou. Durante desenvolvimento, erros de tipagem novos em query/`raw` Zod foram corrigidos e os checks repetidos.
- Uma execução paralela de lint/test falhou porque ESLint tentou ler diretório temporário já removido pelo harness; verificações finais feitas separadamente, sem enfraquecer lint.
- **Interação dos runtimes:** após Vinext, `.next/types/routes` gerado ficou incompatível com o validator Next (`AppRoutes`, `LayoutRoutes`, `ParamMap`, `AppRouteHandlerRoutes` ausentes). Não é falha do domínio da feature; build Next regenerou seus arquivos e typecheck passou. Não se afirma que foi reproduzida no checkout anterior. Ao alternar, use `pnpm build` → `pnpm build:next` → `pnpm typecheck` (ou regenere tipos Next antes do typecheck). Não apagar arquivos do usuário para contornar.
- Servidores temporários de smoke foram interrompidos após uso; SIGTERM pode aparecer como exit 143 de `next start`, não falha de build/API.

## Cobertura de domínio

- Primeiro/segundo turno, incompatibilidade de fase/eleição/cargo/território; contexto e fallbacks não cruzam turnos; ambiguidade na configuração é recusada.
- Regressões existentes: DF, ZZ, cinco regiões/27 UFs, municípios com zeros, pertencimento à UF, conclusão local, retenção de votos inclusive na API, isolamento Workers, cancelamento/timeouts, ETag/backoff/fallback.
- Pesquisas futuras/não publicadas, fim conservador do dia, datas reais e horário de verão histórico de Brasília, cenários/duplas, curadorias conflitantes, deduplicação e proveniência, denominadores/unidades/amostra, NaN/Infinity/negativos/somas inválidas.
- Pesos/recência, última onda/instituto, erro comum não desaparece com amostra maior, reprodução da parcela, logit válido, sigma zero, empate, quantis/complementos, seed/ordem reproduzíveis e histórico sem informação futura.
- Avaliação com e sem treino anterior; horizontes não contam como eleições independentes; configuração experimental não autoriza probabilidade pública.
- Snapshots completos, conjuntos/duplicidades/destinos, reconciliação exata, finalistas explícitos, falha conserva baseline anterior, arquivos imutáveis/idempotentes e 404 sem repetição.
- Live: 40/60 concluído retorna 0,4 e [0,4;0,4], vitória de B, empate explícito, múltiplas UFs, observados abaixo de 5%, denominador zero, Vexp inválido, volume com participação diferente, zero seções numa UF, assimetria capital/interior, pequenas UFs chegando primeiro, 100% arredondado não fecha, revisões sem monotonicidade artificial, ausência de ZZ, retenção, idade/skew da fonte e fallback com horário original.
- Serviços pré/live offline, estados ready/insufficient/disabled/no-data e remoção efetiva dos campos probabilísticos na API pública.

## Navegador: bloqueio e risco restante

Tentado Playwright em `http://localhost:3001/projecao`: falhou porque Chromium/Chrome não existe em `/opt/google/chrome/chrome`. Chrome DevTools também falhou (`Target closed`). Nenhum binário `chromium`, `chromium-browser` ou `google-chrome` foi encontrado no PATH.

Portanto **não** foi validada interação real, screenshot, layout mobile, foco/teclado, contraste calculado ou leitor de tela. HTML/contratos e estados de domínio passaram, mas não substituem esse teste. Revisar em navegador os filtros/turnos existentes, retry e modos da projeção, tabelas e gráfico com dataset real ou mock exclusivamente de teste, viewport 375px, zoom e teclado. A UI usa labels, caption/headers, navegação, aviso persistente, alternativa tabular e SVG sem animação; essas características de código não constituem auditoria de acessibilidade.

## Dependências externas e limites

Não houve download/validação de pesquisas reais ou dos 29 arquivos finais. Página de documentação oficial TSE retornou HTTP 403. Marcadores/destinos e limites operacionais devem ser confirmados contra documentação/arquivos reais antes da ativação. Não há métricas reais de backtest, calibração, finalistas aprovados ou baseline de produção. Testes sintéticos não substituem isso.

Live público continua false. Rota usa snapshots importados estaticamente; coleta manual não é ingestão contínua de produção. Essa limitação e os passos exatos de operação/ativação estão em [OPERACAO.md](OPERACAO.md). Nenhum histórico está sendo gravado automaticamente.
