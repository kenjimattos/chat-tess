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
