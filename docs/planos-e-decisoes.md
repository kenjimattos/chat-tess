# chat-tess: plano e decisões

Desafio técnico: chat com agente de IA. **Entrega: sex 02/10/2026, 12h (BRT).**
Critério principal: código legível (clean code, SOLID) e testes.

## Estado

| Versão | Conteúdo                                                                                                                                                                                                                                     | Situação                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0.1.0  | Fases 1 e 2 + deploy contínuo                                                                                                                                                                                                                | Em produção                                                                         |
| 0.2.0  | Guardrails, limites de uso, desempenho, leitura da resposta                                                                                                                                                                                  | Em produção (tag `v0.2.0`)                                                          |
| 0.3.0  | Compartilhamento de conversa (requisito obrigatório), correções de escala, rascunho de mensagem, reenviar e editar a última mensagem, limites de anexos pendentes, aviso ao fechar a aba durante a resposta, defesas contra prompt injection | Em aberto na `develop` (`[Unreleased]`): falta fechar a versão e publicar na `main` |
| 0.4.0  | MCP (fase 3)                                                                                                                                                                                                                                 | A fazer                                                                             |
| —      | Drive e Gmail (fase 3)                                                                                                                                                                                                                       | Se houver tempo                                                                     |

**Fase 1, entregue:** várias conversas com histórico persistido; imagens (visão) e PDFs; persistência de usuários, conversas, mensagens, configurações, tools e estado; compactação automática ao chegar no limite de contexto, sem interromper o chat.

**Fase 2, entregue:** tools, incluindo busca na web e scraping; limite de créditos (tokens) com contabilização do consumo; auditoria completa dos fluxos.

**Fase 3, a fazer:** conectores (Google Drive, Gmail) e MCP.

**Requisito obrigatório, entregue na 0.3.0:** compartilhar uma conversa para que outra pessoa visualize o chat.

**Revisão de escala (01/10), na 0.3.0:** mapeamos 11 riscos para a pergunta "como faz para escalar". Quatro foram corrigidos no código; os demais são dimensionamento de POC e estão na seção "Do POC à produção" do README, com o sinal de quando aparecem e a correção.

- Corrigido: o agente lê do banco só as mensagens que o resumo ainda não cobre; histórico em páginas de 50 mensagens (conversa do dono e link compartilhado); até 3 tools em paralelo por rodada (`MAX_PARALLEL_TOOL_CALLS`); apagar a conversa apaga os arquivos dela no storage.
- Sinalizado, sem correção: anexos passando pela memória da instância (upload e download), teto de ~160 respostas simultâneas, conexões do `db-f1-micro`, conversa bloqueada por até 15 min quando a instância cai, auditoria síncrona, tabelas sem retenção e cota do Gemini compartilhada.

**Rascunho de mensagem (01/10), na 0.3.0:** texto e anexos ainda não enviados continuam na conversa ao trocar de conversa e ao recarregar a página; o botão "Remover" apaga o arquivo no storage. O adapter do Cloud Storage ganhou testes unitários com um dublê do cliente.

**Limites de anexos pendentes (01/10), na 0.3.0:** revisão do rate limit de upload mostrou que anexos subidos e nunca enviados não gastam crédito e não tinham teto. Agora cada conversa guarda até 10 anexos por enviar (o mesmo limite de uma mensagem) e cada usuário tem um teto de bytes pendentes somando todas as conversas (`MAX_PENDING_ATTACHMENTS_MB`, padrão 500 MB). A tela não deixa escolher mais arquivos do que cabem e para o envio em lote ao bater num limite.

**Aviso ao fechar a aba (01/10), na 0.3.0:** com alguma resposta em andamento, o navegador pede confirmação antes de fechar ou recarregar a aba.

**Revisão de prompt injection (01/10), na 0.3.0:** a defesa era só pedir ao modelo que tratasse conteúdo externo como dado. Uma injeção bem-sucedida conseguia tirar dados da conversa sem clique do usuário, por dois caminhos: imagem em Markdown na resposta e `web_scrape` num endereço montado pelo modelo. Os dois foram fechados (imagem vira link, CSP, autorização do usuário para endereços que ele não enviou). O README tem a seção "Prompt injection" com as camadas e os limites conhecidos.

## Pendências, em ordem

1. Fechar e publicar a 0.3.0: mover `[Unreleased]` para `## [0.3.0]` no CHANGELOG, push na `main` (o job de migração cria `conversation_shares`) e tag `v0.3.0`. A `develop` está à frente do remoto, sem push.
2. MCP (0.4.0): cliente Streamable HTTP, servidores por usuário (`mcp_servers`), `McpToolProvider` com conteúdo marcado como externo e com autorização do usuário em toda chamada (`requiresApproval`), porque não dá para saber o que a tool de um servidor de terceiros faz; spec e2e com servidor MCP local.
3. Drive, depois Gmail: OAuth incremental, refresh token cifrado (AES-256-GCM).
4. Entrega: README final, versão fechada, fumaça em produção, merge na `main`.
5. **Autor:** testar o login real em produção e passar os e-mails dos avaliadores.

**Ordem de corte:** Gmail → Drive → acabamento visual. Compartilhamento, MCP e testes não são cortados. O que for cortado vai para o README.

## Decisões

As decisões abaixo foram tomadas com critérios de engenharia para uma POC: custo baixo,
previsibilidade e facilidade de teste. A engenharia construiu os mecanismos; os valores de política
(limites, créditos, modelo, moderação) ficaram configuráveis por variável de ambiente e devem ser
revistos com produto antes de haver clientes, porque dependem de preço, público e risco aceitável,
não de técnica.

### Engenharia

**Stack e arquitetura**

- Monorepo npm workspaces, TypeScript, Vitest. API em Express 5 + Prisma + Postgres; web em React + Vite, servido pela própria API.
- Arquitetura hexagonal por módulo (`domain`, `application`, `infra`, `http`), com a regra de camadas verificada pelo ESLint. Um use case por arquivo, composition root manual e eventos de domínio para auditoria e billing.
- Loop do agente próprio, no backend, **sem framework de orquestração** (LangChain, ADK etc.). A API chama o Gemini direto pelo SDK e executa as tools no mesmo processo. Motivos:
  - o fluxo é simples: um laço de chamada ao LLM e execução de tools, com limite de rodadas; um orquestrador acrescentaria camadas sem resolver nada que o laço não resolva;
  - compactação, créditos, rate limit, auditoria e guardrails dependem de controlar cada chamada; num orquestrador, essas regras ficariam presas às extensões dele;
  - o port `LlmProvider` isola o provedor: dá para testar com o LLM roteirizado e trocar de modelo sem mudar o agente;
  - um runtime gerenciado de agentes exigiria outro serviço para deploy, custear e depurar, e o código do agente, que é o que o desafio avalia, sairia do repositório;
  - não há vários agentes que precisem conversar entre si. Se houver no futuro, o registro de tools e o laço atual servem de base.

**Mecanismos por trás das políticas**

- Compactação própria: resume as mensagens antigas com o LLM, corta sempre no início de um turno e nunca apaga as mensagens originais.
- Créditos com incremento atômico no banco; rate limit por janela fixa e reserva de turnos com trava, ambos no Postgres, para valerem entre instâncias. A reserva de turnos também fecha a brecha de turnos paralelos furando o crédito.
- O system prompt informa o modelo (ele se dizia "3.7"), e o consumo registra o `modelVersion` que o Agent Platform devolve.
- Conteúdo de tools vindo de terceiros chega ao modelo marcado como externo, e o system prompt manda tratá-lo como dado (defesa contra prompt injection).
- Contra prompt injection, a defesa que conta é a que vale com o modelo enganado. Cada tool diz quais chamadas dependem da autorização do usuário; `web_scrape` pede para endereços que não vieram do usuário nem das fontes da busca. O conteúdo de páginas lidas e o texto da resposta da busca não liberam endereços: são escritos por terceiros ou por um LLM.
- A autorização encerra o turno em vez de segurar a requisição aberta. O pedido fica no histórico (a última mensagem do assistente, com chamadas sem resultado) e a decisão abre outro turno, que executa a rodada e continua. Segurar a conexão exigiria estado em memória, que não vale entre as duas instâncias, e prenderia a reserva do turno enquanto o usuário pensa. A rodada inteira espera junto, porque o LLM exige os resultados de todas as chamadas de uma vez.
- Bloquear a leitura de endereços montados pelo modelo, sem perguntar, foi descartado: "leia a documentação do Express" deixaria de funcionar. Com o pedido, o usuário vê o endereço e decide.
- O rate limit ficou em **janela fixa**, e não deslizante. A janela fixa deixa passar até 2× o limite em torno da virada do minuto, mas esse pico é contido pelas outras travas: só 3 turnos rodam ao mesmo tempo por usuário e o cap de crédito limita o custo total. A janela deslizante guardaria mais estado por uma garantia de que a POC não precisa.
- As travas de uso formam uma cadeia, cada uma cobrindo o que a anterior não cobre: rate limit (velocidade das requisições), teto de anexos pendentes (arquivos que não gastam crédito), turnos simultâneos (trabalho em andamento) e cap de crédito (custo total de LLM).
- O teto de anexos pendentes é conferido e o anexo é criado numa só transação, com a linha do usuário travada (o mesmo padrão da reserva de turnos): uploads simultâneos feitos direto na API não passam juntos do limite. O arquivo é gravado no storage antes de pedir a vaga e apagado se ela for recusada, para não segurar a transação durante o upload ao Cloud Storage. Um índice em `attachments (user_id, message_id)` sustenta a soma.
- Cada usuário faz **um upload por vez** em cada instância; o segundo recebe 429 antes de o arquivo ser lido, com a mensagem de que já há um envio em andamento. O arquivo é recebido inteiro em memória, e sem isso uma conta sozinha poderia ocupar a memória com uploads paralelos. O controle é em memória, e não no banco, porque o recurso protegido é a memória de cada instância. Na tela, os uploads passam por uma fila única do app, então anexar outro arquivo enquanto o anterior sobe só espera a vez; a recusa aparece apenas para uploads em outra aba ou direto na API. Fazer a API segurar a requisição até a vez dela foi descartado: cada espera ocuparia uma vaga da instância e exigiria fila com tamanho máximo e tempo limite. O que sobra é carga legítima: cerca de 40 a 50 usuários enviando arquivos de 20 MB no mesmo instante enchem 1 GB, número aceito para a POC (01/10). Um teto global de uploads simultâneos e o download em streaming ficam para quando houver esse volume.
- Bloqueios e falhas vão para a auditoria como `agent.turn_failed`.

**Infra e deploy**

- Cloud Run (southamerica-east1, até 2 instâncias), Cloud SQL `db-f1-micro`, Cloud Storage e Secret Manager.
- Deploy pelo **GitHub Actions**, não pela conexão do Cloud Run: um push na `main` só publica depois de lint, testes e e2e passarem. A autenticação usa Workload Identity Federation, sem chave.
- Migrações rodam no Cloud Run Job `chat-tess-migrate` antes de cada deploy, e não na inicialização do contêiner.
- A resposta fica ligada à conexão HTTP porque o Cloud Run só dá CPU com requisição aberta.

**Escala**

- Critério para corrigir agora ou sinalizar: o que cresce com o uso de cada usuário (histórico, tools, arquivos) foi corrigido; o que depende do número de usuários simultâneos é dimensionamento de POC e fica documentado no README, com a correção indicada.
- Upload direto ao Cloud Storage por URL assinada foi avaliado e adiado: exige fluxo em duas etapas, validação de tipo depois do upload, IAM e CORS no bucket e outro caminho para o storage local. O passo intermediário, se precisar, é streaming pela instância.
- O upload continua acontecendo ao anexar, e não ao enviar a mensagem: o envio começa na hora e os erros de arquivo aparecem cedo. O que sobra de um rascunho abandonado fica visível e removível pelo usuário, e é limitado pelo teto de anexos pendentes.
- Retenção de auditoria, consumo e chamadas de tools não foi implementada: o prazo é decisão de política e exige job agendado.
- Os arquivos de uma conversa ficam numa pasta própria no storage (`users/{usuário}/conversations/{conversa}`); o módulo de arquivos reage ao evento `conversation.deleted` e apaga a pasta.

**Processo**

- Commits atômicos, cada um compilando sozinho; commitar assim que ficar verde.
- `CHANGELOG.md` no padrão Keep a Changelog, atualizado em todo commit. Cada entrega na `main` fecha uma versão com tag.
- Toda feature é validada por spec Playwright, que o Claude Code executa. Há um LLM roteirizado para o e2e e specs `@live` contra o Gemini real.

### Produto

Políticas e comportamentos que o usuário percebe. Todos configuráveis sem mudar código.

**Acesso**

- Login com Google, só para e-mails ou domínios da lista de permitidos (`ALLOWED_EMAILS`); administradores em `ADMIN_EMAILS`.

**Modelo**

- Gemini 3.8 Flash (`GEMINI_MODEL`): equilíbrio entre custo, velocidade e qualidade para a POC.

**Custo e uso**

- Créditos: **500 mil tokens por usuário, vitalício, sem renovação** (`DEFAULT_TOKEN_LIMIT`). Administradores ajustam por usuário.
- Rate limit: 20 mensagens e 30 uploads por minuto por usuário (`RATE_LIMIT_*`).
- Respostas simultâneas: 1 por conversa e 3 por usuário (`MAX_CONCURRENT_TURNS_PER_USER`).
- Anexos: até 20 MB por arquivo (`MAX_UPLOAD_MB`), 10 por mensagem e um upload por vez por usuário. Ainda não enviados: até 10 por conversa e 500 MB por usuário, somando as conversas (`MAX_PENDING_ATTACHMENTS_MB`); enviar ou remover libera o espaço.
- **Em aberto:** anexos já enviados em mensagens não têm teto de armazenamento. Hoje só o cap de crédito os limita, e de forma frouxa para imagens, que custam poucos tokens em relação ao tamanho. Um teto sobre o histórico bloquearia o usuário legítimo até ele apagar conversas; o que fazer com o histórico (teto, retenção por prazo, plano pago) é decisão de produto (01/10).
- Orçamento de contexto de **100 mil tokens** (`CONTEXT_TOKEN_LIMIT`): acima disso, o início da conversa é resumido. Troca um pouco de fidelidade ao histórico por turnos mais baratos e rápidos.

**Compartilhamento**

- Na POC, compartilhar é **só visualizar**: o dono gera um link, quem o abre vê a conversa sem poder enviar mensagens, e o dono pode revogá-lo quando quiser.
- O link mostra a conversa no estado atual, inclusive mensagens enviadas depois de compartilhar. O token é aleatório e longo.
- **Só usuários autenticados abrem o link**, ou seja, e-mails de `ALLOWED_EMAILS` e administradores de `ADMIN_EMAILS`. Quem não está logado é levado ao login e volta ao link depois. Motivos: um link vazado não expõe a conversa (nem anexos) a quem está fora da lista; o acesso fica na auditoria com o usuário que visualizou; e reaproveita a autenticação existente, sem uma rota pública a mais para proteger. Custo: compartilhar com alguém de fora exige incluí-lo na lista. Link público, se produto quiser, é um campo de visibilidade na mesma tabela.

**Segurança de conteúdo**

- Resposta bloqueada ou cortada pelo Gemini: o usuário vê o motivo.
- Sem moderação própria da entrada e sem filtros explícitos do Gemini; valem os filtros padrão do Agent Platform.

**Experiência**

- Sem instância mínima no Cloud Run: custo zero parado, em troca de um primeiro acesso mais lento (cold start).
- Trocar de conversa não interrompe a resposta; fechar a aba interrompe, e por isso o navegador pede confirmação antes de fechar ou recarregar com resposta em andamento. Corrigir de vez exige gerar a resposta fora da requisição (fila e worker) e reconectar a tela; fica para depois da POC.
- A conversa abre pelas 50 mensagens mais recentes; o botão "Carregar mensagens anteriores" traz as mais antigas, mantendo a posição de leitura.
- A última mensagem do usuário tem os botões "Editar" e "Reenviar": os dois refazem o turno e **substituem** a resposta anterior, sem guardar versões (decisão de 01/10; versões exigiriam mudar o modelo de mensagens e a compactação). Só a última mensagem; editar muda o texto e mantém os anexos; consome créditos e rate limit como um envio normal.
- O rascunho (texto e anexos não enviados) fica como o usuário deixou ao trocar de conversa e ao recarregar. O texto vale por aba (`sessionStorage`); os anexos vêm da API. Não há como apagar uma mensagem individual, só a conversa inteira.
- A resposta aparece aos poucos e a tela não rola sozinha enquanto ela chega: rola só ao abrir a conversa e ao enviar a pergunta. Um botão avisa quando há mais conteúdo abaixo.

## Verificação

- Local: `npm run format:check && npm run lint && npm run typecheck && npm run test:coverage && npm run e2e`.
- Sob demanda: `GCP_PROJECT_ID=chat-tess npm run e2e:live` e `npm run load-test`.
- Produção: CI verde, job de migração executado e `/api/health/ready` respondendo 200.
