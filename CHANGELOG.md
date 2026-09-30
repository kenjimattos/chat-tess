# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Added

- Compartilhamento de conversa por link somente leitura. O dono gera o link (token aleatório de
  32 caracteres, um por conversa), consulta e revoga em `/api/conversations/:id/share` (`PUT`,
  `GET` e `DELETE`). Qualquer usuário logado abre a conversa em `/api/shared/:token`, sem os
  resultados de tools. Gerar, revogar e abrir o link vão para a auditoria (`conversation.shared`,
  `conversation.share_revoked`, `conversation.share_viewed`).
- Anexos de conversa compartilhada em `/api/shared/:token/attachments/:id`, só para anexos
  enviados em mensagens daquela conversa e sem cache, para sumirem assim que o link é revogado.

## [0.2.0] - 2026-09-30

Guardrails do agente, limites de uso, ajustes de desempenho para vários usuários e leitura da
resposta sem rolagem automática.

### Added

#### Guardrails

- Resposta bloqueada pelo modelo por política de segurança ou cortada pelo limite de saída: o
  texto já transmitido é guardado, tools pedidas pela metade são descartadas e o usuário recebe o
  motivo (`response_blocked`, `response_truncated`), registrado na auditoria. O LLM falso ganha o
  comando `/blocked`.
- System prompt com a identidade do modelo configurado (o modelo não sabe a própria versão e se
  apresentava como uma anterior) e regras de comportamento: não inventar, recusar pedidos danosos,
  não revelar instruções e tratar conteúdo trazido por tools como dado, nunca como instrução.
- Conteúdo de terceiros marcado como externo: tools declaram `returnsExternalContent` e o registro
  entrega o resultado delas ao LLM com um aviso de que é dado não verificado, como defesa contra
  prompt injection. `web_search` e `web_scrape` são marcadas.
- Consumo e auditoria registram a versão do modelo que o Vertex AI informa ter usado
  (`modelVersion`), com o nome configurado como alternativa.

#### Limites de uso

- Turnos simultâneos limitados: uma resposta por conversa e até `MAX_CONCURRENT_TURNS_PER_USER`
  (padrão 3) por usuário, com reserva atômica no Postgres (`active_turns`) válida entre instâncias.
  Uma nova mensagem fora do limite recebe 409 antes do stream. Evita respostas intercaladas no
  histórico e fecha a brecha em que turnos paralelos passavam juntos pela conferência de crédito.
- Rate limit por usuário (módulo `rate-limiting`): envio de mensagens (20/min) e uploads (30/min),
  configuráveis por `RATE_LIMIT_MESSAGES_PER_MINUTE` e `RATE_LIMIT_UPLOADS_PER_MINUTE`. Contadores
  por janela fixa no Postgres (`rate_limit_windows`), válidos entre instâncias; acima do limite a
  API responde 429 com `Retry-After`, e a primeira recusa de cada janela vai para a auditoria
  (`rate_limit.exceeded`). O upload é recusado antes de o arquivo ser recebido.

#### Desempenho

- Nova tentativa automática quando o Vertex AI responde 429, 500 ou 503: até três novas tentativas
  com espera crescente e variação aleatória, só na abertura da chamada (antes de qualquer texto
  chegar) e interrompidas se o cliente desconectar. Vale para o chat e para a busca na web.
- Pool de conexões ao banco com tamanho explícito (`DATABASE_POOL_MAX`, padrão 5 por instância),
  para caber no limite de conexões do Cloud SQL `db-f1-micro` com duas instâncias e a migração.

#### Interface

- Leitura da resposta mais calma: o texto em stream aparece aos poucos, em ritmo que acompanha o
  atraso do stream, em vez de surgir em blocos; a tela não rola sozinha enquanto a resposta chega
  (só ao abrir a conversa e ao enviar a pergunta), e um botão "Mais conteúdo abaixo" aparece quando
  há conteúdo fora da área visível. Com `prefers-reduced-motion`, o texto aparece de uma vez.

#### Testes

- Teste ponta a ponta de resposta bloqueada: mensagem de motivo, histórico sem resposta vazia e
  falha registrada na auditoria.
- Testes `@live` contra o Gemini real (`GCP_PROJECT_ID=... npm run e2e:live`): leitura de PDF e
  imagem, identidade do modelo e resistência a instruções escondidas numa página lida pela tool.
  Antes, o script filtrava os specs `@live` mas mantinha o LLM roteirizado.
- LLM falso ganha o comando `/slow`, que responde em cerca de 4 segundos, para testar respostas
  em andamento.
- Teste ponta a ponta de resposta que continua chegando enquanto o usuário usa outra conversa.
- Testes ponta a ponta dos limites de uso: aviso de rate limit com registro na auditoria e recusa
  de uma segunda mensagem enquanto a conversa ainda responde.
- Teste de carga (`npm run load-test`): sobe a API com o LLM falso e mede o tempo de resposta com
  1, 5 e 20 usuários simultâneos. Localmente os três cenários ficam em cerca de 3,7 s, a própria
  duração da resposta simulada.
- Teste ponta a ponta da leitura: a posição da tela se mantém enquanto a resposta chega e o
  indicador de conteúdo abaixo leva ao fim da conversa.

#### Documentação

- README com as seções "Limites e proteções" e "Desempenho", e o deploy atualizado com o fluxo
  contínuo e o job de migração.

### Changed

- Actions do CI atualizadas para versões que rodam em Node 24 (a execução em Node 20 foi
  descontinuada nos runners do GitHub).
- Página local servida aos specs de scraping movida para `e2e/support/local-page.ts`, para
  reuso entre specs.
- Compactação mais cedo: `CONTEXT_TOKEN_LIMIT` passa de 1 milhão (a janela do modelo) para 100
  mil tokens. Cada mensagem reenvia o contexto inteiro; com o orçamento menor, um turno custa no
  máximo cerca de 80 mil tokens de entrada, em vez de 800 mil.
- Limite padrão de tokens por usuário reduzido de 2 milhões para 500 mil, vitalício. Uma migração
  leva as contas que ainda estavam no padrão antigo para o novo; limites ajustados por um
  administrador são mantidos.
- Migrações do banco saem da inicialização do contêiner: o deploy roda o Cloud Run Job
  `chat-tess-migrate` com a imagem nova antes de publicar a revisão, e uma migração que falha
  interrompe o deploy. A inicialização fica mais curta, o que reduz o cold start.
  `infra/setup-github-deploy.sh` cria o job e aplica as migrações pendentes.

### Fixed

- Respostas continuam chegando ao trocar de conversa: o estado dos turnos saiu do componente do
  chat para um store do app (`active-turns-store`). Só o botão "Parar" e o fechamento da aba
  encerram a resposta, e a barra lateral indica as conversas que estão respondendo. Antes, abrir
  outra conversa cortava a resposta em andamento.

## [0.1.0] - 2026-09-30

Primeira versão em produção: fases 1 e 2 do desafio e deploy contínuo.

### Added

#### Base e arquitetura

- Monorepo com npm workspaces (`apps/*`, `packages/*`, `e2e`), TypeScript estrito e Prettier.
- Pacote `@chat-tess/shared` com o formato neutro de mensagem (`MessagePart`) e os eventos de
  stream SSE (`StreamEvent`), validados com Zod.
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

#### Autenticação e usuários

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
- Repositórios Prisma de usuários e da lista de permitidos.
- Contratos de autenticação no pacote compartilhado: usuário atual, login de teste e motivos de
  falha de login.
- Rotas de autenticação: `GET /api/auth/me`, `POST /api/auth/logout`, login com Google
  (`/api/auth/google` e `/callback`, com `state` contra CSRF) e `POST /api/auth/test-login`,
  disponível só no modo `test`.
- Sessão em cookie `HttpOnly` e middleware `requireAuthentication` para rotas protegidas.
- Módulo de autenticação montado na aplicação (`createAuthModule`); a lista de permitidos da
  configuração é carregada antes de a API aceitar requisições.
- Tela de login com Google, com mensagem para cada motivo de falha, cabeçalho com o usuário
  logado e botão de sair.
- Papel de administrador definido por `ADMIN_EMAILS` e reaplicado a cada login: quem sai da lista
  volta a ser usuário comum. Middleware `requireAdmin` para rotas administrativas.

#### Conversas

- Domínio de conversas: conversa, mensagem ordenada por sequência e título gerado a partir da
  primeira mensagem.
- Use cases de conversa: criar, listar, abrir com histórico, renomear e apagar, sempre restritos
  ao dono. A conversa de outro usuário responde como inexistente.
- Repositórios Prisma de conversas e mensagens. A gravação trava a conversa para que mensagens
  simultâneas não repitam a sequência.
- Contratos de conversa no pacote compartilhado: resumo, detalhe com mensagens e requisições de
  criação e renomeação.
- Rotas de conversa (`/api/conversations`): listar, criar, abrir com histórico, renomear e apagar,
  todas autenticadas.

#### Agente e compactação

- Domínio do agente: port `LlmProvider` independente de provedor, ports de tools e anexos,
  memória da conversa (resumos) e política de compactação, que só corta o histórico no início de
  um turno para nunca separar uma chamada de tool do resultado.
- Compactação automática do histórico (`CompactConversation`): resume as mensagens antigas com o
  LLM, mantém as recentes intactas, acumula resumos anteriores e preserva as mensagens originais.
- Use case `RunAgentTurn`: grava a mensagem, gera a resposta em stream, executa tools em loop
  com limite de rodadas, compacta antes de estourar o contexto e, se o modelo recusar por excesso
  de contexto, compacta e tenta de novo sem interromper o chat.
- Adapter do Gemini no Vertex AI (`GeminiLlmProvider`): streaming, anexos por URI do Cloud Storage
  ou conteúdo embutido, chamadas de função com a `thoughtSignature` preservada entre turnos,
  consumo somando os tokens de raciocínio e tradução do estouro de contexto.
- Memória da conversa no Postgres (`PrismaConversationMemory`): resumos de compactação e tamanho
  do contexto da última chamada.
- Configuração do LLM, do agente e dos anexos: `LLM_MODE` (`gemini` ou `fake`, este proibido em
  produção), modelo e projeto do Vertex AI, limite de contexto e limiar de compactação, limite de
  rodadas de tool, armazenamento (`local` ou `gcs`) e tamanho máximo de upload.
- `POST /api/conversations/:id/messages`: envia a mensagem e devolve a resposta do agente em
  Server-Sent Events, com heartbeat e cancelamento quando o cliente desconecta.
- Agente, anexos e tools montados na aplicação. Validado com o Gemini real: upload de PDF, resposta
  em stream baseada no conteúdo do arquivo e pergunta seguinte usando o histórico.

#### Anexos

- Domínio de anexos: tipo detectado pelos primeiros bytes do conteúdo (PDF, PNG, JPEG e WEBP), e
  não pelo nome ou tipo declarado, e nome de arquivo higienizado.
- Use cases de anexos: upload com limite de tamanho, leitura restrita ao dono e catálogo que o
  agente usa para validar anexos pendentes e enviá-los ao LLM, por endereço ou embutidos.
- Armazenamento de arquivos em disco local (desenvolvimento) e no Cloud Storage (produção, lido
  pelo Vertex AI direto por `gs://`), e repositório Prisma de anexos.
- Rotas de anexos: `POST /api/conversations/:id/attachments` (multipart) e
  `GET /api/attachments/:id`, com `nosniff` e nome de arquivo codificado.

#### Tools

- Registro de tools (`ToolRegistry`, padrões Registry e Strategy): junta tools de várias fontes
  (nativas, conectores e MCP), converte falhas em resultados de erro para o LLM e publica cada
  execução com entrada, saída e duração.
- Leitura segura de páginas da web para as tools: só endereços públicos (bloqueia loopback, redes
  privadas, metadados do Google Cloud e IPv4 escrito em IPv6), validação do IP na conexão contra
  DNS rebinding, redirecionamentos revalidados e limites de tempo e tamanho.
- Busca na web com o grounding do Google Search no Gemini, numa chamada separada da conversa, e
  uma busca simulada para os testes ponta a ponta.
- Tools nativas `web_search` e `web_scrape`, definidas com `defineTool`: o mesmo schema Zod gera o
  JSON Schema enviado ao LLM e valida os argumentos. O consumo do LLM usado na busca entra na conta
  do usuário.
- Preferências de tools sem chave estrangeira para o catálogo, para aceitar tools de servidores MCP
  descobertas em tempo de execução; nova origem de tool `MCP`.
- Configuração de tools por usuário: `GET /api/tools` lista as tools com origem (nativa, conector
  ou MCP) e estado, e `PUT /api/tools/:nome` liga ou desliga. Tools desligadas não são oferecidas
  ao LLM nem executadas. Cada execução é gravada em `tool_calls` e o catálogo das tools nativas é
  sincronizado na inicialização.
- Painel "Ferramentas" no cabeçalho para ligar e desligar as tools do agente.

#### Créditos

- Port `UsageLimiter` no agente: o crédito é verificado antes de aceitar a mensagem, que não é
  gravada quando o usuário está sem saldo.
- Créditos: cada chamada ao LLM (chat e compactação) é registrada em `usage_records` e somada ao
  consumo do usuário; `CreditGuard` bloqueia novos turnos ao atingir o cap, com mensagem clara;
  administradores ajustam o limite de um usuário pelo e-mail.
- `GET /api/usage` (consumo, limite, saldo e chamadas recentes) e `PUT /api/admin/credit-limits`
  (só administradores); limite padrão por usuário em `DEFAULT_TOKEN_LIMIT`.
- Medidor de consumo de tokens no cabeçalho, atualizado ao fim de cada resposta.

#### Auditoria

- Auditoria: todo evento de domínio (login, conversas, mensagens, anexos, chamadas ao LLM,
  compactação, tools e falhas) é gravado em `audit_events` com o conteúdo compactado.
  `GET /api/audit-events` pagina a trilha; usuários veem só os próprios eventos e administradores
  veem todos.

#### Interface do chat

- Camada de API do frontend: conversas, anexos e envio de mensagem com leitura de Server-Sent
  Events por `fetch` (o `EventSource` do navegador só faz GET), validando cada evento com o contrato
  compartilhado.
- Interface do chat: lista de conversas com criar, renomear e apagar; conversa aberta na URL;
  respostas em stream com Markdown; anexos com prévia de imagem e link de PDF; indicação de tools
  em uso; aviso de compactação; botão para interromper a resposta.

#### Testes

- Vitest configurado na raiz com um projeto por workspace e cobertura via V8.
- Postgres local via `docker compose`, com banco separado (`chat_tess_test`) para testes.
- Testes ponta a ponta com Playwright (`npm run e2e`): a suíte sobe API e frontend em portas
  próprias, usa o banco `chat_tess_test` e grava trace e screenshot em caso de falha.
- Cobertura mínima de 80% exigida em `domain/` e `application/` dos módulos da API.
- Testes de integração contra Postgres real (`*.integration.test.ts`), em banco próprio criado
  automaticamente; o CI passa a subir o Postgres também no job de testes.
- Testes ponta a ponta do login: entrada permitida, sessão após recarregar, saída, e-mail
  barrado e mensagem de erro do Google.
- Convenção `*.test-support.ts` para código de apoio a testes, isento da regra de camadas e fora
  da cobertura.
- LLM roteirizado (`ScriptedLlmProvider`) e dublês em memória para testar o agente sem rede.
- LLM roteirizado para os testes ponta a ponta (`LLM_MODE=fake`): repete a mensagem, lista os
  anexos, resume no pedido de compactação e chama tools com o comando `/tool nome {json}`.
- Testes ponta a ponta do chat: enviar e receber, título automático, histórico após recarregar,
  alternar, renomear e apagar conversas; anexos de PDF e imagem, tipo não suportado; e compactação
  automática sem interromper o chat nem apagar mensagens. Cada teste usa um usuário próprio.
- Teste do registro de tools para falhas que não são instâncias de `Error`.
- Testes ponta a ponta da auditoria: fluxo completo registrado e isolamento entre usuários.
- Testes ponta a ponta dos créditos: medidor atualizado, bloqueio ao atingir o limite definido por
  um administrador e recusa de mudança de limite por usuário comum.
- Testes ponta a ponta das tools: busca na web, scraping de página local, tool desligada não
  executada, preferência persistida e execução registrada na auditoria.

#### Infraestrutura e deploy

- Dockerfile multi-stage: uma única imagem serve a API e o frontend, aplica as migrações pendentes
  na inicialização e roda como usuário sem privilégios.
- Integração contínua no GitHub Actions: formatação, lint, tipos, testes com cobertura, build e
  testes ponta a ponta com Postgres.
- README com instruções de execução, comandos e guia de leitura da arquitetura.
- Script `infra/provision.sh` para provisionar Cloud SQL, Secret Manager, bucket e conta de serviço
  e fazer o deploy no Cloud Run.
- `infra/setup-github-deploy.sh`: dá ao GitHub Actions acesso de deploy por Workload Identity
  Federation, sem chave de service account, restrito a este repositório e a este serviço.
- Deploy contínuo: push na `main` publica uma revisão no Cloud Run depois que lint, testes e e2e
  passam, e confere o health check da revisão nova.

### Changed

- `infra/provision.sh` usa o projeto ativo no `gcloud`, cria os segredos da sessão e do OAuth,
  concede a permissão de build exigida em projetos novos e já conhece a URL do serviço antes do
  primeiro deploy.

### Fixed

- Rotas de configuração de tools (`/api/tools`) montadas na aplicação; o commit que as adicionou
  não as registrou no composition root.
- `infra/provision.sh` passa `ADMIN_EMAILS` ao Cloud Run; antes, rodar o script de novo removia
  o papel de administrador em produção.

[Unreleased]: https://github.com/kenjimattos/chat-tess/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/kenjimattos/chat-tess/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kenjimattos/chat-tess/releases/tag/v0.1.0
