# Apuração Brasil — primeiro e segundo turno das eleições gerais de 2026

## 🎯 Objetivo e Propósito do Projeto

O **Apuração Brasil** nasceu como um projeto independente e open-source para democratizar o acesso aos resultados das eleições gerais brasileiras de 2026 (primeiro e segundo turnos) de forma transparente, rápida e sem dependência exclusiva do portal oficial do Tribunal Superior Eleitoral (TSE).

### Por que este projeto existe?

- **Transparência**: Qualquer pessoa pode auditar o código-fonte, verificar a origem dos dados e confirmar que não há manipulação de informações.
- **Acessibilidade**: Interface moderna, responsiva e com filtros intuitivos para que eleitores de todos os níveis técnicos possam acompanhar a apuração em tempo real.
- **Desempenho**: Sistema de cache inteligente e tratamento de falhas que garante estabilidade mesmo em cenários de alta demanda ou instabilidade temporária na fonte oficial.
- **Granularidade**: Permite visualizar resultados não apenas nacionalmente, mas por estado, município, região e exterior, além de filtrar por cargos específicos.
- **Independência**: Não é afiliado a partidos políticos, veículos de comunicação ou instituições governamentais — apenas aos dados públicos oficiais do TSE.

### Público-alvo

- Eleitores brasileiros que querem acompanhar a apuração de forma prática e confiável.
- Desenvolvedores e pesquisadores que precisam de uma base para análises de dados eleitorais.
- Jornalistas e criadores de conteúdo que buscam uma fonte secundária verificável de resultados.
- Estudantes de ciência política, estatística e áreas afins.

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

## 🛠️ Stack Tecnológica e Arquitetura

O projeto foi arquitetado com foco em **performance**, **tipagem segura**, **facilidade de manutenção** e **baixo custo de infraestrutura**. Abaixo, as tecnologias principais e suas funções:

### Tecnologias Principais

| Tecnologia | Versão | Propósito no Projeto |
| --- | --- | --- |
| **Next.js** | 15+ (App Router) | Framework fullstack React que combina renderização no servidor (SSR/SSG), rotas de API (Route Handlers) e otimizações automáticas de performance. Elimina a necessidade de um backend separado. |
| **React** | 19 | Biblioteca para construção de interfaces de usuário modernas e interativas, com suporte a Hooks, Server Components e Client Components. |
| **TypeScript** | 5+ | Tipagem estática para prevenir erros em tempo de desenvolvimento, garantir contratos de dados e melhorar a legibilidade do código. |
| **Tailwind CSS** | 3+ | Framework CSS utilitário para estilização rápida, consistente e responsiva, com tema customizado nas cores oficiais do Brasil (verde, amarelo e azul). |
| **Zod** | 3+ | Validação e parsing de dados em tempo de execução para garantir que os arquivos recebidos do TSE estejam no formato esperado, rejeitando dados corrompidos ou de outras eleições. |
| **Node.js** | 22.13 LTS | Runtime de execução JavaScript no servidor, compatível com todas as funcionalidades do Next.js e bibliotecas usadas. |

### Decisões de Arquitetura

- **Sem backend separado**: Os Route Handlers do Next.js (pasta `app/api/`) atuam como camada de API, fazendo a ponte entre o navegador e as APIs públicas do TSE. Isso reduz complexidade e custos de infraestrutura.
- **Server Components + Client Components**: Componentes de exibição de dados são renderizados no servidor para performance, enquanto interações do usuário (busca, filtros, paginação) usam Client Components.
- **Cache em múltiplas camadas**: Implementado tanto no servidor (memória) quanto via cabeçalhos HTTP para CDNs, evitando sobrecarga nas APIs do TSE e garantindo resposta rápida.
- **Sem banco de dados obrigatório**: Os dados são consumidos diretamente das fontes oficiais e armazenados temporariamente em cache. O PostgreSQL é opcional para futuras funcionalidades de histórico persistido.

> ⚠️ **Nota**: Para executar o projeto localmente, use sempre os scripts com sufixo `*:next` (ex: `dev:next`, `build:next`). Os scripts sem sufixo são destinados à versão hospedada em plataforma edge (Vinext/Workers), não recomendada para desenvolvimento local.

## 📁 Estrutura de Arquivos e Pastas

O projeto segue a convenção do Next.js App Router, com separação clara entre camadas de interface, API, lógica de negócio e utilitários. Abaixo, a estrutura completa e a responsabilidade de cada componente:

```
apuracao-brasil-2026/
├── app/                              # Diretório principal do App Router (Next.js)
│   ├── api/                          # Rotas de API (Route Handlers)
│   │   ├── results/
│   │   │   └── route.ts              # Endpoint principal de resultados: valida filtros, consulta TSE, normaliza e retorna dados
│   │   └── municipalities/
│   │       └── route.ts              # Endpoint de municípios: retorna lista de cidades por UF a partir dos dados oficiais
│   ├── page.tsx                      # Página principal do painel (Client Component): filtros, busca, paginação, gráficos e UI
│   ├── layout.tsx                    # Layout raiz da aplicação (Server Component): metadados, fontes e estrutura global
│   └── globals.css                   # Estilos globais: configuração do Tailwind CSS e tema customizado nas cores do Brasil
├── lib/                              # Camada de lógica de negócio e utilitários (compartilhada entre API e UI)
│   ├── catalog.ts                    # Catálogo estático: UFs (26 + DF + ZZ), regiões, cargos eleitorais e contratos TypeScript (interfaces/types)
│   ├── election.ts                   # Lógica eleitoral: esquemas Zod de validação, descoberta do ciclo eleitoral, construção de URLs do TSE e normalização de dados brutos
│   ├── tse.ts                        # Integração com o TSE: cliente HTTP, cache em memória, validação ETag, deduplicação de requisições, retry com espera exponencial e fallback de dados
│   └── normalize.ts                  # Funções auxiliares de formatação: números, percentuais, datas, nomes de partidos, etc.
├── scripts/                          # Scripts utilitários para desenvolvimento e testes
│   └── test-election.mjs             # Script de verificação: valida construção de URLs e configurações sem fazer requisições reais ao TSE
├── public/                           # Arquivos estáticos públicos (imagens, ícones, robots.txt, etc.)
├── package.json                      # Dependências, scripts e metadados do projeto
├── tsconfig.json                     # Configurações do TypeScript
├── next.config.mjs                   # Configurações específicas do Next.js
├── tailwind.config.ts                # Configurações do Tailwind CSS (tema, cores, plugins)
└── postcss.config.mjs                # Configurações do PostCSS (processamento de CSS)
```

### Arquivos-chave em Detalhe

| Arquivo | Função Detalhada |
| --- | --- |
| `app/page.tsx` | Componente principal da interface: gerencia estado global de filtros (UF, cidade, cargo, região), busca por candidatos, paginação (20 por página), atualização automática (60s) e manual, exibição de gráficos, tratamento de erros e estados de carregamento. |
| `app/api/results/route.ts` | Ponto de entrada da API: recebe parâmetros de consulta (`uf`, `office`, `region`, `municipality`), valida com Zod, chama as funções do `lib/tse.ts`, agrega dados regionais/municipais, aplica normalização e retorna uma resposta padronizada com cabeçalhos de cache. |
| `lib/catalog.ts` | Fonte da verdade para dados estáticos: lista de UFs com códigos e nomes, regiões (Sul, Sudeste, Norte, Nordeste, Centro-Oeste), cargos (presidente, governador, senador, etc.) com seus códigos oficiais do TSE e tipos TypeScript compartilhados por toda a aplicação. |
| `lib/election.ts` | Coração da lógica eleitoral: descobre automaticamente o ciclo eleitoral atual (ex: `ele2026`), data e turno a partir da configuração pública do TSE; constrói URLs corretas para cada combinação de cargo/UF/município; define esquemas Zod para validar a estrutura dos arquivos de resultado; normaliza dados brutos do TSE em um formato consumível pela UI. |
| `lib/tse.ts` | Integração robusta com a fonte oficial: implementa cliente HTTP com timeout (12s por arquivo), cache em memória com TTL configurado (1h para configuração, 30s para resultados), validação condicional via ETag para evitar downloads desnecessários, deduplicação de requisições simultâneas, retry com backoff exponencial (60s a 10min) para falhas e fallback para a última resposta válida com aviso de dados antigos. |
| `app/globals.css` | Arquivo de estilos globais: importação do Tailwind, definição de variáveis CSS para o tema (verde, amarelo, azul), customização de tipografia e estilos de componentes padrão (botões, inputs, tabelas). |
| `scripts/test-election.mjs` | Ferramenta de desenvolvimento: simula a construção de URLs e validação de parâmetros sem acessar o TSE, útil para testar mudanças na lógica eleitoral rapidamente. |

## 🔄 Fluxo de Dados: Como as Informações do TSE Chegam até Você

O sistema foi projetado para garantir **integridade**, **atualidade** e **resiliência** no tratamento dos dados oficiais. Abaixo, o passo a passo completo do fluxo de informações, desde a requisição do usuário até a exibição no painel:

### 1. Requisição do Usuário

O usuário interage com o painel em `app/page.tsx`, selecionando filtros como:
- Abrangência (Nacional, Por estado/cidade, Exterior)
- UF, município ou região
- Cargo eleitoral (presidente, governador, etc.)

Ao confirmar os filtros (ou automaticamente na carga inicial), o Client Component dispara uma requisição HTTP GET para a API interna do Next.js:
```
GET /api/results?uf=br&office=1&region=sul
```

### 2. Validação na Rota de API (`app/api/results/route.ts`)

O Route Handler recebe os parâmetros e executa as primeiras validações com **Zod**:
- Verifica se `uf` é uma UF válida (26 + DF + ZZ) ou `br` para nacional
- Confere se `office` corresponde a um cargo existente para aquela abrangência
- Valida parâmetros opcionais como `region` (se for nacional) ou `municipality` (se for por estado)
- Rejeita imediatamente parâmetros inválidos com erros 400 (Bad Request), evitando requisições desnecessárias ao TSE

### 3. Descoberta do Ciclo Eleitoral (`lib/election.ts`)

Antes de consultar resultados, o sistema verifica se já tem a **configuração pública da eleição** em cache:
- URL da configuração: `https://resultados.tse.jus.br/oficial/comum/config/ele-c.json`
- Cache de 1 hora por instância de servidor
- A configuração contém: ciclo eleitoral (ex: `ele2026`), data do turno (ex: `04/10/2026`), número do turno (1 ou 2) e códigos de eleição por tipo de cargo (ex: 6257 para presidente, 6259 para cargos estaduais em 2026)

Isso garante que o sistema se adapta automaticamente a diferentes eleições/turnos sem hardcoded de códigos antigos.

### 4. Construção da URL e Consulta ao TSE (`lib/tse.ts`)

Com a configuração em mãos, o `lib/election.ts` constrói a URL correta para o arquivo de resultado, seguindo o padrão oficial:
```
https://resultados.tse.jus.br/oficial/{ciclo}/{cod_eleicao}/dados/{uf}/{uf}-c{cod_cargo}-e{cod_eleicao}-u.json
```

Exemplos práticos:
- Presidente nacional (BR): `br-c0001-e006257-u.json`
- Exterior (ZZ): `zz-c0001-e006257-u.json`
- Governador de RS: `rs-c0003-e006259-u.json`
- Município de São Borja (RS): `rs88633-c0001-e006257-u.json`

Para consultas **regionais** (ex: presidente por região Sul), o sistema faz requisições separadas para cada UF da região (PR, RS, SC), com espaçamento de 250ms entre elas para não sobrecarregar o TSE, e agrega os resultados somando votos e recalculando percentuais.

### 5. Validação e Tratamento de Respostas do TSE (`lib/tse.ts`)
O cliente HTTP do `lib/tse.ts` aplica uma série de controles de qualidade e resiliência:
- **Timeout**: 12 segundos por requisição (incluindo leitura do corpo da resposta)
- **Validação ETag**: Envia o cabeçalho `If-None-Match` com a ETag da última resposta válida; se o TSE retornar 304 (Not Modified), usa os dados em cache sem baixar novamente
- **Deduplicação**: Requisições idênticas simultâneas são agrupadas em uma única chamada ao TSE, evitando sobrecarga
- **Rate Limit**: Até 4 requisições por segundo por instância de servidor para a API do TSE
- **Retry com Backoff**: Em caso de falhas (5xx, timeout, erros de rede), tenta novamente com espera crescente (60s → 2min → 5min → 10min) para não agravar instabilidades
- **Validação de Integridade**: Após receber o arquivo, o Zod valida que:
  - É o turno e eleição corretos (não aceita simulados ou eleições passadas)
  - A abrangência corresponde ao solicitado (UF/município correto)
  - Campos obrigatórios estão presentes e com formatos válidos
  - Arquivos com `dv=n` (divulgação de votos não autorizada) têm votos e percentuais ocultos

### 6. Normalização de Dados (`lib/election.ts`)
Os dados brutos do TSE são complexos e com nomes de campos enxutos. O sistema normaliza para um formato amigável à UI:
- Converte strings numéricas para números (ex: `"12345"` → `12345`)
- Calcula percentuais sobre votos válidos automaticamente
- Mapeia códigos de situação para descrições legíveis (ex: `st="eleito"` → "Eleito")
- Ordena candidatos por número de votos decrescente
- Adiciona URLs de fotos dos candidatos (padrão oficial do TSE)
- Trata casos especiais: DF com deputado distrital (cargo 8) em vez de estadual, exterior (ZZ) apenas para presidente, etc.

### 7. Cache e Resposta para o Cliente
A API responde ao navegador com:
- Dados normalizados e prontos para exibição
- Cabeçalhos de cache HTTP (`Cache-Control`) permitindo cache de até 30s em CDNs/compartilhamentos
- Metadados: horário de geração do arquivo, horário de totalização, abrangência, fonte oficial e link para verificação no TSE

Em caso de falha no TSE mas existência de dados válidos em cache, a API retorna os dados antigos com um flag `stale: true` e um aviso de "Dados desatualizados" exibido na UI. Se não houver fallback, retorna erro 502 com mensagem amigável.

### 8. Exibição no Painel React (`app/page.tsx`)
O Client Component recebe os dados e renderiza:
- Lista de candidatos com foto, nome, partido/coligação, número de votos, percentual e situação
- Gráficos de pizza/barra para visualização rápida
- Indicadores de progresso da apuração (percentual de seções totalizadas)
- Estado de carregamento, erro, espera (antes da apuração iniciar) ou aviso de dados antigos
- Componentes de busca, paginação e controles de atualização (pausar/retomar automático, atualizar manualmente)

---

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

---

## 🌟 Roadmap: Próximas Funcionalidades e Ideias Futuras

O projeto irá evoluir. Abaixo, funcionalidades planejadas para versões futuras, com foco em enriquecer a experiência do usuário e fornecer insights ainda mais profundos sobre a apuração:

### 1. 🌍 Filtro de Presidente por Países Estrangeiros (Exterior Detalhado)

**Status**: Planejado  
**Contexto atual**: Hoje, a aba "Exterior" (abrangência ZZ) exibe apenas o **total agregado de votos válidos e percentuais** para presidente no exterior como um todo, sem distinção por país.  
**O que será implementado**:
- **Descoberta de países**: Integrar a lista oficial de países e zonas eleitorais no exterior a partir dos arquivos de configuração do TSE (EA11/EA12), incluindo códigos de zona/país.
- **Consulta por país**: Permitir selecionar países específicos (ex: Estados Unidos, Portugal, Argentina, Alemanha, etc.) e visualizar resultados de presidente individualmente para cada local.
- **URL e validação**: Implementar a construção de URLs específicas para zonas eleitorais no exterior e validar que a abrangência corresponde ao país selecionado.
- **Agregação opcional**: Manter a visualização agregada do exterior total como padrão, adicionando um dropdown/seletor de país para detalhamento.
- **Métricas**: Comparar participação eleitoral e votação por país, mostrando quais localidades tiveram maior comparecimento e tendência de voto.
- **Benefício**: Eleitores no exterior e interessados em política internacional poderão acompanhar como a comunidade brasileira vota em cada país, identificando padrões regionais.

### 2. 📊 Sistema de Projeção Estatística para Segundo Turno

**Status**: Em estudo de viabilidade técnica  
**Contexto atual**: O painel exibe resultados oficiais em tempo real, mas não oferece projeções ou estimativas de resultado futuro para o segundo turno.  
**O que será implementado**:
- **Base de dados históricos**: Compilar dados de eleições passadas (2014, 2018, 2022) incluindo:
  - Votos no primeiro turno vs segundo turno por candidato/partido
  - Taxa de rejeição (votos nulos/brancos) e abstenção por turno
  - Perfil demográfico por UF/município (faixa etária, escolaridade, renda)
  - Resultados de pesquisas eleitorais de institutos confiáveis (Datafolha, Ibope, Ipec, etc.) com data de coleta e margem de erro
  - Transferência de votos de candidatos eliminados no primeiro turno para os dois finalistas
- **Modelos estatísticos e de Machine Learning**: Implementar múltiplos algoritmos de projeção para comparar resultados e calcular intervalos de confiança:
  - **Modelo de tendência histórica**: Baseado na taxa média de transferência de votos entre turnos nas últimas eleições por partido/ideologia
  - **Modelo de regressão**: Regressão linear/múltipla considerando variáveis como desempenho no primeiro turno, perfil demográfico da região e resultados de pesquisas recentes
  - **Simulação Monte Carlo**: Gerar milhares de cenários aleatórios com base nas distribuições de votos e margens de erro, para calcular a **probabilidade de vitória** de cada candidato (ex: Candidato A: 62%, Candidato B: 38%)
  - **Modelo de migração de votos**: Analisar alianças partidárias no segundo turno e histórico de transferência de votos de candidatos do mesmo espectro ideológico
- **Integração com a apuração em tempo real**: À medida que os votos do segundo turno são totalizados, os modelos são atualizados automaticamente, refinando as projeções e reduzindo os intervalos de confiança.
- **Transparência metodológica**: Página exclusiva explicando cada modelo, fontes de dados, limitações e margens de erro. **Nenhuma projeção será apresentada como fato absoluto** — sempre com intervalo de confiança e comparação entre modelos.
- **Visualizações interativas**: Gráficos de evolução das probabilidades ao longo do tempo, mapa de calor por UF com chances de vitória por estado e simulação de cenários (ex: "Se a abstenção cair 5% no Nordeste, como muda a projeção?").
- **Benefício**: Usuários terão acesso a uma ferramenta analítica independente para entender as tendências da eleição, baseada em dados históricos e métodos estatísticos transparentes — sem viés editorial.

> 💡 **Contribuições**: Ideias, sugestões e contribuições de código são sempre bem-vindas! Abra uma Issue ou Pull Request no repositório para colaborar com o projeto.
