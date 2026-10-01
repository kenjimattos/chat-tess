# chat-tess

Aplicação de chat com agente de IA: múltiplas conversas, imagens e PDFs, compactação automática do
histórico, tools, controle de consumo e auditoria.

> Em desenvolvimento. O [CHANGELOG](CHANGELOG.md) registra o que já foi entregue, e
> [docs/planos-e-decisoes.md](docs/planos-e-decisoes.md), o que falta e por que cada decisão foi
> tomada.

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
| `npm run e2e:live`      | Specs `@live` contra o Gemini real (custa tokens)      |
| `npm run load-test`     | Tempo de resposta com 1, 5 e 20 usuários simultâneos   |
| `npm run lint`          | ESLint, incluindo a regra de dependência entre camadas |
| `npm run typecheck`     | Verificação de tipos em todos os workspaces            |
| `npm run build`         | Build do frontend e bundle da API                      |
| `npm run db:migrate`    | Cria e aplica migrações a partir do `schema.prisma`    |

## Testes

São 83 arquivos de teste unitário e de integração (Vitest) e 15 specs ponta a ponta (Playwright),
que rodam no CI antes de todo deploy.

A organização da suíte Vitest, os dublês, a cobertura mínima e as convenções estão em
[docs/testes.md](docs/testes.md).

Os specs e2e usam o navegador contra a API e o Postgres reais, com um LLM roteirizado no lugar do
Gemini. Cobrem:

- login, lista de permitidos e sessão;
- conversas: envio, histórico, troca de conversa com resposta em andamento, renomear e apagar;
- histórico em páginas, na conversa do dono e no link compartilhado;
- reenviar e editar a última mensagem, substituindo a resposta;
- anexos de imagem e PDF, com o rascunho preservado ao trocar de conversa e ao recarregar a página;
- compactação automática do histórico;
- tools (busca e scraping), preferências e auditoria de cada execução;
- créditos, rate limit e turnos simultâneos;
- resposta bloqueada pelo modelo;
- leitura da resposta sem rolagem automática;
- compartilhamento por link e revogação;
- auditoria e estado do sistema.

Os specs `@live` (`npm run e2e:live`) repetem anexos, identidade do modelo e prompt injection
contra o Gemini real.

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

## Compartilhamento

O dono gera, no botão ⤴ de cada conversa, um link somente leitura (`/shared/{token}`). Quem abre o
link vê as mensagens e os anexos, inclusive as mensagens enviadas depois, mas não pode escrever.

- **Só usuários logados.** O link não é público: vale para quem já tem acesso ao chat-tess
  (`ALLOWED_EMAILS`). Quem não está logado passa pelo login e volta ao link. Um link vazado não
  expõe a conversa fora da lista, e cada abertura vai para a auditoria com quem abriu.
- **Revogável.** Revogar apaga o link na hora, inclusive os anexos (servidos sem cache).
  Compartilhar de novo gera outro token.
- **Sem conteúdo de tools.** Resultados de busca e scraping não aparecem no link, como já não
  aparecem na tela do dono.
- **Colaboração fica para depois.** Várias pessoas escrevendo na mesma conversa exigiria decidir
  quem paga cada turno, sincronizar respostas em tempo real entre usuários e definir papéis. O
  registro de compartilhamento pode ganhar um campo de papel quando isso for necessário.

## Limites e proteções

- **Créditos.** Cada usuário tem um limite vitalício de tokens (`DEFAULT_TOKEN_LIMIT`, padrão
  500 mil), somando todas as conversas: chat, compactação e busca na web. Não renova; um
  administrador ajusta o limite de um usuário por `PUT /api/admin/credit-limits`.
- **Contexto.** A compactação dispara em 80% de `CONTEXT_TOKEN_LIMIT` (padrão 100 mil). É um
  orçamento nosso, menor que a janela do modelo (1 milhão no Gemini 3.8 Flash): cada mensagem
  reenvia o contexto inteiro, então um orçamento menor deixa cada turno mais barato e rápido. Nunca
  deve passar da janela do modelo.
- **Rate limit.** Por usuário: 20 mensagens e 30 uploads por minuto (`RATE_LIMIT_*`), com
  contadores no Postgres, válidos entre as instâncias. Acima do limite, 429 com `Retry-After`; a
  primeira recusa de cada minuto vai para a auditoria.
- **Turnos simultâneos.** Uma resposta por conversa e até 3 por usuário
  (`MAX_CONCURRENT_TURNS_PER_USER`), com reserva atômica no banco. Impede respostas intercaladas no
  histórico e turnos paralelos passando juntos pela conferência de crédito.
- **Tools em paralelo.** Até 3 tools executam ao mesmo tempo numa rodada
  (`MAX_PARALLEL_TOOL_CALLS`) e até 8 rodadas por turno (`MAX_TOOL_ROUNDS`). O modelo pode pedir
  várias páginas de uma vez; as que passam do limite esperam a vez.
- **Resposta bloqueada.** Se o Gemini barrar a resposta por segurança ou cortá-la pelo limite de
  saída, o usuário recebe o motivo e a falha vai para a auditoria.
- **Prompt injection.** Resultados de tools com conteúdo de terceiros
  chegam ao modelo marcados como externos, e o system prompt manda tratá-los como dado, nunca como
  instrução. Coberto por um spec `@live`.
- **Scraping.** Só endereços públicos: bloqueia rede interna, metadados do GCP e DNS rebinding, com
  limites de tempo e tamanho.

**Identidade do modelo.** O modelo não sabe a própria versão: perguntado, o Gemini 3.8 Flash
respondia "Gemini 3.7 Flash", a versão presente nos dados de treino. O system prompt informa o
modelo configurado, e o consumo registra a versão que o Agent Platform diz ter usado (`modelVersion`).

**Fora do escopo, por decisão.** Moderação da entrada e configuração explícita dos filtros de
segurança do Gemini: os filtros padrão do Agent Platform continuam ativos.

## Desempenho

Quase todo o tempo de uma resposta é espera pelo Gemini, e o Node atende outras requisições
enquanto espera. `npm run load-test` mede isso com o LLM falso (resposta de ~4 s):

| Usuários simultâneos | p50    | p95    |
| -------------------- | ------ | ------ |
| 1                    | 3,70 s | 3,70 s |
| 5                    | 3,66 s | 3,66 s |
| 20                   | 3,72 s | 3,72 s |

Medido localmente; o Cloud Run tem 1 vCPU por instância e até 2 instâncias, com 80 requisições
simultâneas cada. Outros pontos:

- **Cold start.** Sem instância mínima (decisão de custo), o primeiro acesso depois de um período
  parado espera o contêiner subir. As migrações rodam antes do deploy, não na inicialização.
- **Sobrecarga do Gemini.** Respostas 429/500/503 do Agent Platform são repetidas até três vezes com
  espera crescente, antes de qualquer texto chegar.
- **Conexões.** Pool de 5 conexões por instância (`DATABASE_POOL_MAX`), dentro do limite do Cloud
  SQL `db-f1-micro`.
- **Resposta ligada à conexão.** Trocar de conversa não interrompe a resposta, mas fechar a aba
  sim: no Cloud Run com CPU alocada só durante requisições, um turno sem conexão aberta ficaria sem
  CPU.

## Do POC à produção

A infraestrutura está dimensionada para poucos usuários conhecidos (lista de e-mails permitidos).
Esta seção separa o que já não cresce com o uso do que precisa mudar antes de abrir para mais
gente, com o sinal de que chegou a hora e a correção.

**Já não cresce com o uso:**

- **Histórico.** A tela abre pelas 50 mensagens mais recentes e busca as anteriores a pedido; o
  agente lê do banco só o que o resumo da conversa ainda não cobre.
- **Tools.** Até 3 executam ao mesmo tempo por rodada, com limite de tamanho por página lida.
- **Arquivos.** Apagar a conversa apaga os arquivos dela no Cloud Storage.
- **Limites entre instâncias.** Rate limit e turnos simultâneos ficam no Postgres, então valem
  para qualquer número de instâncias.

**Precisa mudar para escalar:**

| Limite de hoje                                                                                                                                                                                                                                                                                                                                                                                                                                              | Quando aparece                                                                                                      | Correção                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Upload e download de anexo passam inteiros pela memória da instância (até 20 MB cada, em 1 GB). Cada usuário faz um upload por vez por instância, então uma conta sozinha não ocupa a memória; não há teto global entre usuários, e o download não tem esse limite                                                                                                                                                                                          | Cerca de 40 a 50 usuários enviando arquivos grandes ao mesmo tempo; o download acontece a cada abertura da conversa | Streaming entre o navegador e o Cloud Storage, ou upload direto por URL assinada        |
| Cada resposta ocupa uma vaga do Cloud Run até terminar: 2 instâncias × 80 requisições                                                                                                                                                                                                                                                                                                                                                                       | Cerca de 160 respostas simultâneas; acima disso, 429                                                                | Subir `--max-instances`, junto com o banco (linha abaixo)                               |
| Pool de 5 conexões por instância num Cloud SQL `db-f1-micro` (cerca de 25 conexões)                                                                                                                                                                                                                                                                                                                                                                         | Mais de 4 instâncias, ou fila no pool com muitos turnos                                                             | Tier maior e pooler de conexões                                                         |
| Uma instância que cai deixa as conversas com resposta em andamento bloqueadas por até 15 minutos, até a reserva do turno expirar                                                                                                                                                                                                                                                                                                                            | Deploy, redução de instâncias ou falta de memória durante uma resposta                                              | Renovar a reserva enquanto o turno roda, ou tirar o turno da requisição (fila e worker) |
| A auditoria é gravada dentro da requisição, um `INSERT` por evento; se falhar, só fica no log                                                                                                                                                                                                                                                                                                                                                               | Latência cresce com a carga; trilha incompleta em falhas do banco                                                   | Outbox no Postgres ou Pub/Sub                                                           |
| Auditoria, consumo e chamadas de tools não têm política de retenção; anexos deixados num rascunho ficam guardados até o usuário removê-los ou apagar a conversa, dentro do teto de pendentes (10 por conversa e `MAX_PENDING_ATTACHMENTS_MB`, padrão 500 MB, por usuário). Anexos já enviados em mensagens não têm teto de armazenamento: são limitados só pelo cap de crédito, e o que fazer com o histórico do usuário é uma decisão de produto em aberto | Meses de uso num disco de 10 GB                                                                                     | Retenção por prazo (job agendado) e regra de ciclo de vida no bucket                    |
| A cota do Gemini é do projeto, dividida por todos os usuários; a repetição cobre três tentativas                                                                                                                                                                                                                                                                                                                                                            | Picos: 429 para todos ao mesmo tempo                                                                                | Throughput provisionado e fila com espera                                               |

O cold start e a resposta ligada à conexão, descritos em [Desempenho](#desempenho), entram na mesma
lista: instância mínima e turno fora da requisição resolvem os dois.

## Deploy

Uma única imagem Docker serve a API e o frontend, no Cloud Run, com Postgres no Cloud SQL e
arquivos no Cloud Storage.

- **Contínuo:** um push na `main` roda lint, testes e e2e; se passarem, o GitHub Actions faz o
  build da imagem, aplica as migrações no Cloud Run Job `chat-tess-migrate`, publica a revisão e
  confere o health check. A autenticação no GCP usa Workload Identity Federation, sem chave.
- **Provisionamento:** `infra/provision.sh` cria a infraestrutura e faz o primeiro deploy;
  `infra/setup-github-deploy.sh` cria o job de migração e dá ao GitHub acesso de deploy.

```bash
docker build -t chat-tess .
docker run -e DATABASE_URL=postgresql://... chat-tess npx prisma migrate deploy
docker run -p 8080:8080 -e DATABASE_URL=postgresql://... chat-tess
```
