# Execução local e publicação — versão 0.5.0

Este pacote contém a versão atual com regiões nacionais, UFs, cidades, fotos e gráficos. Não contém node_modules ou credenciais.

## Instalação
Instale Node.js 22 LTS (mínimo 22.13) e abra um terminal na pasta do package.json.

```sh
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run dev:next
```

Acesse http://localhost:3000. Não precisa configurar .env, banco de dados ou chave do TSE. A conexão à internet é necessária para votos, cidades e fotos.

## Produção local
```sh
pnpm test
pnpm run build:next
pnpm run typecheck
pnpm run start:next
```

## Vercel
Crie um repositório GitHub para este código e importe-o na Vercel. Framework: Next.js; Node: 22.x; raiz: pasta do package.json; Install Command: `npx --yes pnpm@11.25.0 install --frozen-lockfile`; Build Command: `pnpm run build:next`; Output Directory: padrão do Next.js; nenhuma variável de ambiente necessária para a aplicação. Não use os scripts padrão build/start nesta publicação: são do ambiente Sites/Vinext.

O painel ficará acessível na publicação da Vercel conforme a proteção de acesso configurada no projeto. A proteção privada da publicação original não acompanha automaticamente este pacote.

## Domínio
Após validar a URL vercel.app, adicione seu domínio em Settings > Domains. No provedor DNS, copie exatamente os registros indicados pela Vercel para o seu projeto: A para o domínio raiz e CNAME para www/subdomínio, quando solicitado. Preserve registros MX/TXT usados por e-mail. Aguarde configuração válida e HTTPS. Domínio e hospedagem são serviços distintos.

## Verificações
Abra Nacional, região Sul, exterior e Por região / estado > Sul > RS > São Borja. Teste presidente e governador, fotos e gráficos. Compare as fontes e horários. A classificação em uma cidade não determina eleitos.

Documentação consultada em 05/10/2026:
https://vercel.com/docs/builds/configure-a-build
https://vercel.com/docs/package-managers
https://vercel.com/docs/domains/working-with-domains/add-a-domain

README.md também contém o histórico técnico. As seções antigas podem descrever funcionalidades de versões anteriores; os itens 0.3, 0.4 e 0.5 descrevem os filtros atuais.
