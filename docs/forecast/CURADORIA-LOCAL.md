# Cadastro e curadoria local de pesquisas

Ferramenta local de curadoria. O cadastro não confirma a autenticidade de uma pesquisa nem valida a precisão do modelo estatístico.

Use dados de fontes verificadas. Testes de software não demonstram calibração. A ferramenta não consulta o TSE nem infere código eleitoral ou finalistas. Não há pesquisas de exemplo na interface.

## Iniciar

Na raiz do projeto, com Node >=22.13 e pnpm 11.25.0 e as dependências instaladas:

```sh
pnpm admin:pesquisas
```

Abra **http://127.0.0.1:4179**. Encerre com Ctrl+C. Porta ocupada é erro: não há mudança automática de porta. O comando não aceita argumentos, inclusive `--host`; não exponha este servidor por túnel, proxy ou rede local.

É uma aplicação React/TypeScript em `tools/pesquisas/`, com Vite 8 e plugin React já instalados. `scripts/admin-pesquisas.mjs` usa configuração própria (`configFile:false`), sem carregar `vite.config.ts`, plugins Workers/Vinext, `.env` ou diretório público. Escuta exclusivamente no loopback IPv4; CORS desabilitado, filesystem restrito à ferramenta, módulos compartilhados necessários e dependências. Não há endpoint de escrita. Nenhuma dependência nova foi adicionada.

Não há rota administrativa, link ou bundle da ferramenta no aplicativo público. Os comandos Next.js/Workers continuam independentes. O typecheck/lint do repositório também verificam os fontes da ferramenta.

## Proteja o trabalho

- Todos os dados e formulários ficam apenas na memória da aba. **Não há salvamento automático**, localStorage, IndexedDB ou File System Access API.
- Recarregar, fechar ou uma falha do navegador pode perder o trabalho. O aviso ao sair depende das permissões/limitações do navegador; não é garantia de recuperação.
- Salvar um formulário significa somente salvar em memória. Baixe os três JSONs para preservar uma versão consistente e confirme que foram realmente salvos pelo navegador.
- O indicador só fica sem pendências quando não há edições de formulário e os três downloads correspondem ao estado atual. Um download solicitado não comprova gravação no disco.

## 1. Disputa e candidaturas

1. Informe o **código oficial da eleição**, obtido e conferido manualmente, e um identificador fixo do cenário.
2. O escopo é presidente, segundo turno, nacional. Ano 2026 fica identificado e sem edição: o serviço de produção não aceita outros anos nesta versão.
3. Confira o pleito: o serviço atual exige o instante **2026-10-25T17:00:00-03:00**. Pode usar outro fuso representando exatamente o mesmo instante. O formulário exige segundos e fuso, mesmo que `contestSchema` também aceite datas sem horário. Outro instante é bloqueado.
4. Cadastre exatamente duas candidaturas, com IDs oficialmente confirmados, nomes, URLs de fontes e datas de verificação. Não há sugestão de finalistas.
5. **A = primeiro ID; B = segundo ID**, tanto em `contest.candidateIds` quanto em `candidates.json`. Transcreva resultados nessa ordem, não na ordem de classificação do relatório.
6. Salve disputa e candidaturas em memória.

Trocar dupla/cenário após cadastrar pesquisas exige confirmação. Os registros existentes conservam suas identidades, cenário e valores, tornam-se incompatíveis e bloqueiam exportação. Edite cada um: o comando explícito de vincular ao contexto atual limpa A/B **no rascunho** e exige nova transcrição/conferência. Não há reatribuição automática.

Datas de verificação posteriores ao pleito são bloqueadas: não existiria corte pré-eleitoral compatível. A prévia também exige que a verificação das duas candidaturas esteja disponível no instante escolhido.

## 2. Primeira pesquisa e revisão

1. Clique **Criar pesquisa pendente** depois de salvar a configuração.
2. Preencha ID interno único, registro eleitoral, nome canônico do instituto, modalidade, cenário, onda, URL do relatório, referência da conferência do registro e ao menos uma URL de proveniência (uma por linha). Contratante é opcional. Os nomes de institutos existentes são sugeridos, nunca unidos automaticamente.
3. Preencha início/fim de campo, publicação e acesso. Use `YYYY-MM-DD` quando só houver data. O domínio interpreta como **fim do dia em America/Sao_Paulo**, inclusive horário de verão histórico. Não é meia-noite UTC. Para horário conhecido, use ISO com segundos e fuso `Z` ou `±HH:mm`. Não usamos `datetime-local` nem conversão silenciosa.
4. Informe amostra, unidade, denominador e resultados A/B com os nomes/IDs mostrados. Confira explicitamente a correspondência com o relatório.
5. Para percentual, valores vão de 0 a 100; para proporção, de 0 a 1. A margem usa a mesma unidade. **Vírgula e ponto são separadores decimais**, nunca de milhar: `46,5` significa `46.5`. Não use agrupamento (`1.000,50`, `1 000`), expoentes ou formatos mistos. A confiança visual é sempre em %, por exemplo `95` ou `95%` exporta `0.95`.
6. Deixe opcionais desconhecidos vazios: eles serão omitidos, não convertidos em zero, null ou string vazia. Zero explicitamente informado permanece zero.
7. Denominador `valid` exige amostra útil conhecida, A+B = 100% (ou 1) e ausência de brancos/nulos/indecisos. Trocar unidade/denominador exige confirmação, mas **não converte nem apaga números**. Confira-os manualmente.
8. Salve como pendente. Para marcar `reviewed`, selecione revisada e confirme os sete itens: relatório original, registro, cenário/identidades, orientação A/B, unidade/denominador, datas/amostra, duplicidade. Qualquer edição de dados limpa essas confirmações. São auxiliares locais, não auditoria/revisão independente; não integram o JSON.

Somente revisadas **e elegíveis** entram na seleção. `withdrawn` significa retirada. Editar uma revisada abre um rascunho pendente para nova conferência; o registro salvo só muda ao salvar. Retiradas mantêm esse estado ao abrir a edição. Arquivos importados mantêm a curadoria informada: a importação não comprova revisão.

Na tabela, filtre instituto/curadoria, busque registro, abra a fonte, edite, exclua com confirmação ou duplique como rascunho. A duplicação limpa ID, registro e onda; exige novo ID, nova chave registro+cenário+onda e confirmação de conferência. Não serve para produzir uma segunda cópia da mesma pesquisa. Links externos só são abertos com protocolo HTTP(S), sem acesso à aba de origem ou referrer. HTML dos dados nunca é renderizado.

## 3. Importar, validar e exportar

### Importação manual

Selecione arquivos locais com nomes exatos `contest.json`, `candidates.json`, `polls.json` (um ou mais). Limite: **2 MiB por arquivo, 2.000 pesquisas, duas candidaturas**. O tamanho é verificado antes da leitura e novamente no texto. Só após validação aparece a prévia, com confirmação de substituição, especialmente se houver trabalho não exportado.

Sem mescla: arquivos selecionados substituem seus conjuntos; os demais são preservados. Para trocar toda a base, selecione os três juntos. Estrutura inválida, campos desconhecidos, incompatibilidades presentes ou conflitos detectados impedem a importação e preservam o trabalho atual. `null` para disputa e `[]` para listas são estados iniciais aceitos; conjuntos incompletos ainda exigem configuração antes da exportação. Não é possível importar dados malformados para corrigi-los na interface: corrija a origem ou cadastre manualmente.

Os JSONs já presentes no checkout podem conter marcadores de preenchimento que não passam nos schemas. A ferramenta não os carrega automaticamente, não inventa substitutos e não altera os arquivos de produção.

### Validação e prévia

Schemas estritos em `lib/forecast/types.ts` são a fonte da verdade. Compatibilidade de contexto usa os mesmos predicados do serviço/seleção. Para duplicidades, a ferramenta chama `selectPolls`, inclusive para inspecionar conflitos entre cópias ainda pendentes/retiradas antes de revisão. Exige IDs internos únicos mesmo quando o domínio aceita cópias exatas. Cópias compatíveis de chave igual são sinalizadas e deduplicadas; curadorias/cópias conflitantes são bloqueadas e apontadas por registro/índice.

Dados degenerados que o agregador rejeitaria (A ou B sem votos positivos) também bloqueiam exportação. Não há clipping, arredondamento ou renormalização. Divergência de soma por arredondamento editorial exige conferir a fonte, não fabricar uma correção.

Escolha um corte com segundos e fuso e execute a prévia: mostra cadastradas, revisadas, elegíveis antes de deduplicar, elegíveis deduplicadas e selecionadas após a regra de última onda por instituto. **Somente os IDs retornados pelo domínio aparecem como selecionados.** Várias pesquisas do mesmo instituto não necessariamente entram juntas. Não são geradas probabilidades, simulações ou gráficos estatísticos. A prévia confere entradas; não substitui os limites temporais da API pública.

### Exportação e aplicação no agregador

Salve ou cancele formulários abertos. A exportação valida novamente os três conjuntos, bloqueia incompatibilidades e informa pendentes/revisadas/retiradas. Pendentes válidas podem ser exportadas, mas não participam do cálculo. Baixe **separadamente os três arquivos**, com JSON identado e quebra de linha final; só contêm campos dos contratos.

1. Revise os downloads e suas fontes.
2. Substitua manualmente os correspondentes em `data/forecast/`.
3. Confira `git diff -- data/forecast/`.
4. Execute, nessa ordem: `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm build:next`, `pnpm typecheck`. A ordem Workers → Next restaura os tipos gerados de Next antes do typecheck; veja [OPERACAO.md](OPERACAO.md).
5. Com o aplicativo local em execução, abra `/projecao` e `/api/forecast?mode=pre`; para um corte histórico compatível, use `asOf` ISO com fuso devidamente codificado na URL. Confira mensagens, IDs, fontes e seleção; depois do pleito, utilize corte histórico identificado. `no-data`/`insufficient-data` são esperados se faltarem entradas elegíveis, não estimativas 50/50.
6. A produção só muda após novo build/deploy realizado por você. A ferramenta não publica nem altera o site automaticamente.

As flags estatísticas permanecem intactas: probabilidades públicas e live continuam desabilitados. Esta ferramenta não fornece avaliações, baseline, finalistas confirmados ou fontes verificadas.

## Verificação e limitações

- `pnpm test` inclui `scripts/test-curation.mjs` no harness existente: decimais/confiança, opcionais, datas/fusos, importação sem mutação, exportação lida pelo serviço real, ordem da dupla, conflitos, rascunhos pendentes e seleção real. Fixtures sintéticas ficam somente nos testes.
- Com a ferramenta aberta, `node scripts/smoke-curation.mjs` verifica HTTP/transformações TSX, ausência de CORS entre origens, allowlist de arquivos e ausência de API de escrita. Não é teste de interação no navegador.
- Não há persistência, desfazer, mescla, edição de registros estruturalmente inválidos importados, revisão multiusuário, coleta automática, scraping, PDF, IA, banco ou autenticação. Use exclusivamente no seu computador.
- Teste manual ainda necessário em navegador: importação válida/inválida, cadastro/edição/revisão, troca de contexto/unidade, duplicação/exclusão, downloads, aviso de saída, viewport de 375px e percurso por teclado. Os estilos e atributos de acessibilidade não constituem auditoria de acessibilidade.

Resultados desta implementação: [VERIFICACAO-CURADORIA.md](VERIFICACAO-CURADORIA.md).
