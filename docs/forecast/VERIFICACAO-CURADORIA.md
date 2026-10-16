# Verificação da curadoria local — 16/10/2026

Branch mantida: `develop`; árvore inicialmente limpa. Node 24.21.0, pnpm 11.25.0. Nenhuma dependência nova, alteração de lockfile, push, merge, deploy ou provisionamento.

## Comandos executados e resultados

| Verificação | Resultado |
| --- | --- |
| `pnpm test` | Passou, incluindo o novo `test-curation.mjs` no harness existente e todas as regressões eleitorais/forecast |
| `pnpm lint` | Passou isoladamente, sem erros/avisos |
| `pnpm build` | Passou: Vinext/Vite/Workers, somente as rotas públicas existentes |
| `pnpm build:next` | Passou: Next 16.3.4, compilação e TypeScript, mesmas rotas públicas |
| `pnpm typecheck` | Passou após o build Next final, respeitando a ordem Workers → Next → typecheck |
| `git diff --check` | Passou |
| `pnpm admin:pesquisas` | Servidor Vite independente iniciado em `http://127.0.0.1:4179` |
| `ss -ltnp 'sport = :4179'` | Confirmou socket exclusivamente em `127.0.0.1:4179` |
| `node scripts/smoke-curation.mjs` | Passou: HTML/TSX/CSS, módulos reais, CORS ausente, acesso fora da allowlist recusado (403), POST de aplicação sem rota (404) |
| `node scripts/admin-pesquisas.mjs --host 0.0.0.0` | Recusa esperada, exit 1 antes de iniciar servidor; argumentos não são encaminhados ao Vite |
| Build isolado via API do Vite, descrito abaixo | Passou; bundle da ferramenta gerado somente em `/tmp/opencode/pesquisas-bundle`, fora do projeto e dos builds públicos |
| Busca dos textos/título da ferramenta e `admin-pesquisas` em `.next/static` e `dist/client` | Sem ocorrências |
| `git diff --exit-code -- data/forecast lib/forecast/config.ts pnpm-lock.yaml vite.config.ts next.config.ts` | Passou: arquivos de produção, flags/modelo, dependências e configurações dos runtimes preservados |

Build avulso de verificação (não é comando integrado ao build do projeto):

```sh
node --input-type=module -e "import { build } from 'vite'; import react from '@vitejs/plugin-react'; await build({configFile:false,envFile:false,root:process.cwd()+'/tools/pesquisas',publicDir:false,plugins:[react()],build:{outDir:'/tmp/opencode/pesquisas-bundle',emptyOutDir:false}});"
```

O servidor temporário de verificação foi encerrado depois do smoke. Nenhuma consulta a pesquisas/TSE foi feita.

## Problemas encontrados durante o desenvolvimento

- O primeiro typecheck encontrou colisão do tipo `append` do DOM com as tipagens Workers existentes. A inserção do link de download passou a usar `appendChild`; typecheck e ambos os builds posteriores passaram. Não houve mudança de tsconfig ou enfraquecimento dos checks.
- Uma repetição de `pnpm lint` em paralelo ao build excedeu o timeout de 120 segundos. Repetido isoladamente com limite de 240 segundos, passou. Não se afirma uma causa de performance específica nem uma falha preexistente de lint.
- Vinext continua informando sua limitação de classificação estática de algumas páginas (`?`) e avisos de tempo gasto em plugins. O build concluiu com sucesso; esses avisos não foram suprimidos.

## Cobertura nova

- Vírgula/ponto decimal, rejeição de agrupamento/formatos mistos/expoentes, confiança percentual para proporção.
- Opcionais vazios omitidos e zero explícito preservado; round-trip dos campos.
- Datas sem horário intactas, fim do dia de Brasília, horário com segundos/fuso obrigatório para pleito/corte e rejeição de datas inexistentes.
- Contexto estrito do serviço: 2026 e instante de pleito exato/equivalente, identidades A/B em ordem, cenário, verificação das candidaturas disponível no corte.
- IDs únicos; cópias exatas deduplicadas; curadorias e cópias conflitantes, inclusive pendentes, identificadas por índice/ID.
- Rascunho novo/duplicado pendente; pendentes fora da seleção; última onda/instituto e IDs selecionados vindos do domínio real.
- Importação inválida sem mutação do estado anterior, inclusive falha no segundo arquivo de um lote; tamanho declarado e tamanho real em bytes; campos desconhecidos, limites e estados `null`/`[]`.
- Exportação estrita com quebra de linha final, sem metadados de interface; JSONs exportados aceitos pelos schemas e pelo serviço real em fixture sintética, sem probabilidades públicas.
- Isolamento dos comandos/configurações públicos e links sem esquemas executáveis.

As únicas alterações nos caminhos de domínio/serviço existentes extraem **predicados idênticos** de compatibilidade de disputa, compartilhados com a ferramenta. Não alteram seleção, matemática, parâmetros ou flags. Testes de regressão existentes continuam passando.

## Limitações e verificações não realizadas

Não havia Chromium/Chrome/Firefox, Playwright ou Puppeteer disponíveis no ambiente, nem ferramenta MCP de navegador. **Não foi executado fluxo interativo real**, download em navegador, viewport estreito, teclado, cálculo de contraste ou auditoria de acessibilidade. A compilação/HTTP e os testes puros não substituem essas verificações. O roteiro manual está em [CURADORIA-LOCAL.md](CURADORIA-LOCAL.md).

Os arquivos `data/forecast/contest.json`, `candidates.json` e `polls.json` já continham marcadores inválidos pelos contratos antes da implementação. Foram preservados. Não se afirma que a API pública atual lê esses marcadores com sucesso; esta entrega valida importação/exportação e leitura pelo serviço usando somente fixtures sintéticas de teste. Para operação real, faltam código eleitoral, finalistas, fontes e pesquisas verificadas fornecidos e revisados pelo operador. Não foi executado smoke da API pública com dados reais.

Não há recuperação automática de sessão, revisão independente comprovada, coleta, banco, autenticação ou publicação. Probabilidades públicas e live permanecem desabilitados. Testes aprovados não estabelecem precisão estatística.
