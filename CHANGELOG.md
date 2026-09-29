# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

- Monorepo com npm workspaces (`apps/*`, `packages/*`, `e2e`), TypeScript estrito e Prettier.
- Pacote `@chat-tess/shared` com o formato neutro de mensagem (`MessagePart`) e os eventos de
  stream SSE (`StreamEvent`), validados com Zod.
- Vitest configurado na raiz com um projeto por workspace e cobertura via V8.
- Postgres local via `docker compose`, com banco separado (`chat_tess_test`) para testes.
- ESLint com regra de camadas da arquitetura hexagonal: `domain/` e `application/` não podem
  importar `infra/`, `http/`, frameworks nem SDKs.
- Workspace `@chat-tess/api` com Express 5, build via tsup e execução em desenvolvimento via tsx.
- Configuração tipada da API (`loadConfig`): variáveis de ambiente validadas com Zod em um único
  ponto, com erro que lista todas as variáveis inválidas.
- Event bus em processo (`InProcessEventBus`) para eventos de domínio; a falha de um handler não
  interrompe os demais nem quem publicou o evento.
- Logger estruturado (pino) no formato do Cloud Logging, com cookies e tokens ocultados.
- Servidor HTTP com `GET /api/health`, tratamento central de erros (`AppError` e Zod traduzidos
  para status HTTP) e entrega do build do frontend com fallback para o `index.html`.
- Composition root (`composition-root.ts`) como único ponto de montagem das dependências.
- Modelo de dados com Prisma e migração inicial: usuários, lista de permitidos, conversas,
  mensagens, anexos, resumos de compactação, tools, consumo, créditos, auditoria, conectores e MCP.
- Conexão com o Postgres e `GET /api/health/ready`, que responde 503 e aponta a dependência
  indisponível quando o banco não responde.
- Workspace `@chat-tess/web` com React, Vite e Tailwind; página inicial mostra o estado da API.
  Em desenvolvimento o Vite repassa `/api` para a API.
- Dockerfile multi-stage: uma única imagem serve a API e o frontend, aplica as migrações pendentes
  na inicialização e roda como usuário sem privilégios.
- Testes ponta a ponta com Playwright (`npm run e2e`): a suíte sobe API e frontend em portas
  próprias, usa o banco `chat_tess_test` e grava trace e screenshot em caso de falha.
- Cobertura mínima de 80% exigida em `domain/` e `application/` dos módulos da API.
- Integração contínua no GitHub Actions: formatação, lint, tipos, testes com cobertura, build e
  testes ponta a ponta com Postgres.
- README com instruções de execução, comandos e guia de leitura da arquitetura.
