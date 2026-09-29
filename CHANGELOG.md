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
- Script `infra/provision.sh` para provisionar Cloud SQL, Secret Manager, bucket e conta de serviço
  e fazer o deploy no Cloud Run.
- Regra da lista de permitidos: aceita e-mail completo ou domínio (`@empresa.com`), ignorando
  maiúsculas e espaços.
- Use case `SignIn`: aplica a lista de permitidos, cria o usuário no primeiro acesso, abre a sessão
  e publica os eventos `auth.login_succeeded` e `auth.login_denied`.
- Use case `GetCurrentUser`: identifica o usuário a partir do token de sessão.
- Use case `SeedAllowedEmails`: carrega na inicialização os padrões vindos da configuração, sem
  remover os já cadastrados.
- Configuração de sessão e login: `SESSION_SECRET`, `AUTH_MODE` (`google` ou `test`, este
  proibido em produção), credenciais do OAuth, `PUBLIC_BASE_URL` e `ALLOWED_EMAILS`.
- Dependências de autenticação: `jose` (JWT), `google-auth-library` (OAuth) e `cookie-parser`.
- Sessão sem estado com JWT (`JwtSessionTokens`), com expiração configurável.
- Login com Google (`GoogleIdentityProvider`): fluxo de código de autorização trocado no
  servidor, aceitando apenas contas com e-mail verificado.
- Testes de integração contra Postgres real (`*.integration.test.ts`), em banco próprio criado
  automaticamente; o CI passa a subir o Postgres também no job de testes.
- Repositórios Prisma de usuários e da lista de permitidos.

### Changed

- `infra/provision.sh` usa o projeto ativo no `gcloud`, cria os segredos da sessão e do OAuth,
  concede a permissão de build exigida em projetos novos e já conhece a URL do serviço antes do
  primeiro deploy.
