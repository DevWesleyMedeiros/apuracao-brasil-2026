# Apuração Brasil — primeiro e segundo turno das eleições gerais de 2026

## Versão 0.5.0

## O que está implementado

- Presidência: resultado nacional **incluindo o exterior**, resultado por UF e resultado somente do exterior (ZZ).
- Governador, senador, deputado federal e deputado estadual: resultados da UF selecionada, entre os 26 estados.
- Distrito Federal: deputado **distrital**, cargo 8, no lugar de deputado estadual.
- Todas as candidaturas presentes no arquivo escolhido, busca por nome/partido/número e páginas de 20 candidatos.
- Atualização automática a cada 60 segundos enquanto a aba está visível; atualização manual e opção de pausar.
- Estado de espera anterior à apuração, erro de conexão, votos não divulgados e identificação de dados antigos.
- Situações e percentuais reproduzidos do TSE. A ordenação por votos não define eleitos para cargos proporcionais.
- Senador: número de vagas vindo do TSE; duas vagas na eleição de 2026.

O recorte geográfico é UF, nacional ou exterior agregado. Esta versão não inclui filtros de município, país ou cidade do exterior, histórico persistido ou comparação entre turnos.

## Stack e arquitetura

A aplicação usa o App Router de Next.js (`app/`) e React 19. Para executar o projeto, use o **Next.js convencional** com os scripts `*:next` abaixo. Não é necessário instalar Express nem configurar sistema de gerenciamento de dados: o Route Handler já faz o papel da API e os resultados vêm da fonte pública. Instale o PostgreSQL caso você quiser guardar histórico de apuração; feature ainda não está implementado.

Fluxo: navegador → GET /api/results → configuração de eleições do TSE → arquivo do cargo/UF → validação com Zod → normalização → painel React.

| Arquivo | Responsabilidade |
| --- | --- |
| `app/page.tsx` | Painel, filtros, busca, paginação e atualização |
| `app/api/results/route.ts` | API de consulta e validação dos filtros |
| `lib/catalog.ts` | UFs, cargos e contratos TypeScript |
| `lib/election.ts` | Esquemas JSON, descoberta da eleição, URLs e normalização |
| `lib/tse.ts` | Consulta HTTP, cache, ETag, deduplicação e recuperação de falhas |
| `app/globals.css` | Tailwind e tema: verde, amarelo e azul |
| `scripts/test-election.mjs` | Verificação do domínio e da consulta, sem acessar o TSE |

## Rodar na sua máquina — Windows, Linux ou macOS

### 1. Conferir o ambiente

Instale Node.js 22.13 ou superior, preferencialmente uma versão LTS compatível. Depois abra um novo terminal e confira:

```sh
node --version
npm --version
```

Não precisa de conta no TSE, chave de API, arquivo `.env` ou banco de dados. Precisa de acesso à internet para consultar resultados. As únicas chamadas externas da funcionalidade são para `https://resultados.tse.jus.br`.

### 2. Instalar

Extraia o ZIP, abra um terminal dentro da pasta `apuracao-brasil-2026` (onde está `package.json`) e execute:

```sh
npm install
```

O repositório da versão hospedada preserva seu `pnpm-lock.yaml`. O caminho com npm é para facilitar a instalação local e gera `package-lock.json`. Se preferir manter exatamente o gerenciador e as versões travadas, instale pnpm e execute `pnpm install --frozen-lockfile`; os scripts podem ser chamados com `pnpm run`.

### 3. Iniciar com Next.js

```sh
npm run dev:next
```

Abra (<http://localhost:3000>). Para usar outra porta:

```sh
npm run dev:next -- --port 3001
```

Interrompa com Ctrl+C.

### 4. Usar o painel

1. A aba **Nacional** abre a presidência com Brasil + exterior.
2. Em **Por estado e cidade**, selecione UF, cidade e cargo. Todos os candidatos daquele recorte aparecem na lista; use busca e paginação para deputados.
3. Em **Exterior**, o único cargo disponível é presidente.
4. A atualização automática consulta a cada 60 segundos enquanto o navegador permanece na aba. Ela não cria tarefas em segundo plano quando o site está fechado.
5. Compare o horário de geração/totalização do arquivo, a abrangência e o link de origem com o site oficial.

### 5. Verificar e executar a versão de produção local

```sh
npm run typecheck
npm test
npm run build:next
npm run start:next
```

`start:next` exige que `build:next` tenha terminado com sucesso. Este caminho usa servidor Node.js. `npm run build` e `npm start` são os scripts da versão Vinext/Workers para Sites, não o caminho recomendado para começar localmente.

### 6. Publicar em outro provedor, se quiser

No Vercel, use Next.js e configure o comando de build como `npm run build:next`. Também pode hospedar o Next.js em um servidor Node com os comandos anteriores. Nesta entrega não foi criada conta nem configurado um deploy em Vercel, Railway ou Neon.

## Fonte oficial e construção das URLs

Configuração pública: (<https://resultados.tse.jus.br/oficial/comum/config/ele-c.json>)

O servidor encontra o ciclo `ele2026`, a data `04/10/2026` e o turno `1`. Identifica a eleição que contém o cargo solicitado, em vez de usar códigos de 2022. Na configuração consultada em 04/10/2026: presidente usa 6257; os cargos estaduais, incluindo deputado federal, usam 6259.

Exemplos:

```text
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.json
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/zz/zz-c0001-e006257-u.json
https://resultados.tse.jus.br/oficial/ele2026/6259/dados/rs/rs-c0006-e006259-u.json
```

| Cargo | Código |
| --- | --- |
| Presidente | 1 |
| Governador | 3 |
| Senador | 5 |
| Deputado federal | 6 |
| Deputado estadual | 7 |
| Deputado distrital | 8 |

Documentação de 2026: (<https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados>)

Leia os documentos EA11 (configuração), EA20 (resultado unificado) e as instruções de download. A documentação oficial informa disponibilização pública sem cadastro, limites de acesso e uso da abrangência ZZ para exterior. O painel informa fonte e horários e se identifica como projeto independente.

## Cache e indisponibilidade

- Configuração: cache de uma hora por instância de servidor.
- Arquivos de resultado: cache de 30 segundos; respostas de sucesso permitem cache HTTP de até 30 segundos no compartilhamento/CDN.
- Validação condicional por ETag; consultas em andamento são isoladas por requisição.
- Até quatro novas consultas à fonte por segundo **por instância**, com timeout de 12 segundos por arquivo, incluindo a leitura do corpo. Esse controle não é um limitador global distribuído.
- Falhas têm espera crescente entre 60 segundos e 10 minutos. Um 404 não vira uma sequência de tentativas a cada clique.
- Em falha, exibe a última resposta válida em memória com aviso de dados antigos; sem resposta válida, mostra erro. Reiniciar o servidor pode perder esse fallback.
- Aceita apenas UFs e cargos conhecidos; não aceita URLs fornecidas pelo usuário.
- Rejeita arquivos de simulado, outro turno, outra eleição, outro território e números inválidos.
- Se `dv=n`, oculta votos e percentuais. Campos opcionais ausentes não viram votos inventados.

Para tráfego público elevado ou várias réplicas, use cache e limitação distribuídos antes de escalar. O cache em memória e o controle por instância desta primeira versão não garantem um teto global por IP.

## Validação realizada nesta entrega

- TypeScript e builds de produção de Next.js e de Vinext/Workers.
- Testes de normalização, validação de abrangência/turno/fase, conversão de percentuais, DF, URL, votos ocultos, consultas simultâneas, ETag, fallback, espera após falha e recuperação.
- Consulta e normalização de sete arquivos oficiais reais: presidente BR/ZZ, governador/senador/deputado federal/deputado estadual RS e deputado distrital DF.
- Os arquivos consultados ainda indicavam apuração não iniciada e votos zero. Dados parciais posteriores precisam ser conferidos com a fonte à medida que forem publicados.
- A verificação visual e das interações em navegador não ficou disponível neste ambiente. O registro WebMCP opcional também não foi validado em navegador compatível.

## Problemas comuns

**`node` não reconhecido:** instale Node e reabra o terminal.

**Porta 3000 ocupada:** use o comando com `--port 3001`.

**Fonte indisponível:** verifique sua internet e o site oficial. O servidor usa espera após falhas; aguarde antes de atualizar. O painel não troca automaticamente para dados simulados.

**Todos os votos zero:** confira o estado “Aguardando apuração” e o horário do arquivo. Não representa eleição concluída.

**Layout ou filtro inesperado:** informe UF, cargo, navegador e a mensagem apresentada. Nunca envie credenciais no chat.

## regiões e fotos

- Na aba **Por região / estado**, selecione Sul, Sudeste, Centro-Oeste, Norte, Nordeste ou todas as regiões. O filtro restringe a lista de UFs; os resultados e gráficos continuam sendo da UF selecionada, sem somar disputas de cargos diferentes entre estados.
- Ao trocar a região, mantém a UF se ela pertencer à região; caso contrário, seleciona a primeira UF em ordem alfabética. DF mantém deputado distrital.
- Fotos públicas do TSE: `https://resultados.tse.jus.br/oficial/ele2026/{eleicao}/fotos/{uf}/{sqcand}.jpeg`. Padrão conferido no repositório de fotos do próprio aplicativo Resultados. Para presidente, a UF da foto é sempre `br`, inclusive nas consultas por estado e exterior.
- Imagens usam lazy loading, dimensões fixas e fallback de iniciais quando indisponíveis. Não entram no caminho da consulta nem alteram seus limites de tempo.
- Nenhuma chave ou conta adicional é necessária. A configuração e os comandos locais existentes continuam válidos.

## presidente por região na aba Nacional

A abrangência nacional permite Brasil + exterior (arquivo original do TSE) ou Sul, Sudeste, Centro-Oeste, Norte e Nordeste. As regiões somam todos os arquivos de presidente das UFs correspondentes, sem exterior. O filtro anterior por estado permanece independente.

A API aceita `/api/results?uf=br&office=1&region=sul` (e os demais códigos do catálogo). Recalcula votos, percentuais sobre votos válidos e avanço das seções pelo total de seções. Preserva fotos, busca, paginação, gráficos e atualização a cada 60 segundos. Expõe as fontes e os horários de cada UF; o recorte regional não determina eleitos.

Não publica uma soma faltando UFs ou com listas incompatíveis. Quando a fonte falha, usa somente a última soma completa da região, sinalizada como desatualizada, ou retorna erro. Se uma UF retém a votação, oculta a votação regional. Consultas à fonte são espaçadas em 250 ms, com cancelamento e os limites de tempo já existentes.

## filtro municipal

Na aba **Por região / estado**, o fluxo é Região → UF → Cidade → Cargo. “Todo o estado / DF” preserva a consulta estadual. Trocar região ou UF limpa a cidade; trocar cargo mantém a cidade. O filtro nacional por regiões e a consulta do exterior permanecem independentes.

A lista de municípios vem do arquivo oficial EA12 (`mun-e{eleicao com 6 dígitos}-cm.json`), resolvendo a eleição federal na configuração do TSE. O código usado é `mu.cd` (código eleitoral com 5 dígitos), não `cdi` (IBGE). A API `/api/municipalities?uf=rs` fornece códigos e nomes de cidades exclusivamente dessa UF, com cache de 1 hora e timeout.

Resultados: `/api/results?uf=rs&office=1&municipality=88633` EX.: (São Borja). Arquivo EA20: `rs88633-c0001-e006257-u.json`. A API valida que o município pertence à UF antes de consultar o arquivo, confere `tpabr=mu` e `cdabr`, preserva zeros iniciais e separa o cache por UF, cargo e município. Para DF, o catálogo eleitoral fornece Brasília; deputado distrital segue o ajuste existente.

Votos, gráficos, fotos, busca e paginação passam a usar o resultado municipal. A conclusão da apuração local usa `and=f`, sem depender da totalização final da eleição inteira (`tf`). A votação em uma cidade não determina eleitos para cargos estaduais ou nacionais. A lista tem carregamento com prazo máximo, cancelamento na troca de UF e botão de nova tentativa.

Referência oficial: (<https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados>)
