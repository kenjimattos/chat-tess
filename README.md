# chat-tess

Aplicação de chat com agente de IA: múltiplas conversas, imagens e PDFs, compactação automática do
histórico, tools, controle de consumo, auditoria, conectores e MCP.

> Em desenvolvimento. O [CHANGELOG](CHANGELOG.md) registra o que já foi entregue.

## Como rodar

Requisitos: Node 24 ou superior e Docker.

```bash
cp .env.example .env
docker compose up -d     # Postgres em localhost:5433
npm install
npm run db:migrate       # aplica as migrações
npm run dev              # API em :3000, frontend em :5173
```

Abra http://localhost:5173.

## Comandos

| Comando                 | O que faz                                              |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Sobe API e frontend com recarga automática             |
| `npm test`              | Testes unitários e de integração HTTP (Vitest)         |
| `npm run test:coverage` | Testes com relatório de cobertura                      |
| `npm run e2e`           | Testes ponta a ponta no navegador (Playwright)         |
| `npm run lint`          | ESLint, incluindo a regra de dependência entre camadas |
| `npm run typecheck`     | Verificação de tipos em todos os workspaces            |
| `npm run build`         | Build do frontend e bundle da API                      |
| `npm run db:migrate`    | Cria e aplica migrações a partir do `schema.prisma`    |

## Organização

```
apps/api          API (Node, Express, Prisma)
apps/web          Frontend (React, Vite, Tailwind)
packages/shared   Contratos usados pelos dois lados: formato de mensagem e eventos de stream
e2e               Testes ponta a ponta (Playwright)
```

### Por onde começar a ler

1. [`apps/api/src/composition-root.ts`](apps/api/src/composition-root.ts): monta todas as
   dependências. Mostra como as peças se conectam.
2. [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma): o modelo de dados.
3. [`packages/shared/src`](packages/shared/src): o formato de mensagem e o protocolo de stream.

### Arquitetura da API

Arquitetura hexagonal, organizada por módulo de negócio. Todo módulo em `apps/api/src/modules`
tem as mesmas quatro pastas:

| Pasta          | Conteúdo                                         | Pode depender de          |
| -------------- | ------------------------------------------------ | ------------------------- |
| `domain/`      | Entidades, erros e ports (interfaces)            | nada                      |
| `application/` | Use cases, um por arquivo                        | `domain/`                 |
| `infra/`       | Adapters: banco, LLM, storage, serviços externos | `application/`, `domain/` |
| `http/`        | Rotas e validação de entrada                     | `application/`, `domain/` |

A regra de dependência é verificada pelo ESLint: `domain/` e `application/` não conseguem importar
Express, Prisma nem SDKs. Os testes ficam ao lado do arquivo testado.

## Deploy

Uma única imagem Docker serve a API e o frontend. Ao iniciar, o contêiner aplica as migrações
pendentes. O destino é o Cloud Run, com Postgres no Cloud SQL.

```bash
docker build -t chat-tess .
docker run -p 8080:8080 -e DATABASE_URL=postgresql://... chat-tess
```
