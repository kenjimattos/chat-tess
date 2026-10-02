# Testes unitários e de integração

Como a suíte Vitest está organizada, como rodá-la e que convenções os testes seguem. Os testes
ponta a ponta (Playwright) estão descritos no [README](../README.md#testes).

São 95 arquivos e 614 testes, que rodam em cerca de 7 segundos.

## Como rodar

```bash
docker compose up -d       # Postgres, usado só pelos testes de integração
npm test                   # a suíte inteira, uma vez
npm run test:watch         # reexecuta ao salvar
npm run test:coverage      # com relatório de cobertura e conferência do mínimo
```

Para rodar uma parte:

```bash
npx vitest run --project api                       # um projeto (ver tabela abaixo)
npx vitest run apps/api/src/modules/billing        # uma pasta
npx vitest run share-conversation                  # arquivos cujo nome contém o texto
npx vitest run -t "não compartilha a conversa"     # testes cujo nome contém o texto
```

## Projetos

O [`vitest.config.ts`](../vitest.config.ts) da raiz define quatro projetos:

| Projeto           | Arquivos | O que roda                                                   | Ambiente        |
| ----------------- | -------- | ------------------------------------------------------------ | --------------- |
| `shared`          | 1        | Contratos de `packages/shared`                               | Node            |
| `api`             | 65       | Domínio, use cases, adapters e rotas da API, tudo em memória | Node            |
| `api-integration` | 11       | Adapters Prisma (`*.integration.test.ts`) contra o Postgres  | Node + Postgres |
| `web`             | 18       | Componentes, stores e funções do frontend                    | jsdom           |

Só o `api-integration` precisa do Docker. Os outros três não tocam em banco, rede nem disco.

## O que cada camada testa

Os testes ficam ao lado do arquivo testado e seguem as camadas da arquitetura:

| Camada         | Como é testada                                                                                                    | Exemplo                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `domain/`      | Funções e entidades puras, sem dublê nenhum                                                                       | [`compaction-policy.test.ts`](../apps/api/src/modules/agent/domain/compaction-policy.test.ts)                |
| `application/` | O use case real, com os ports atendidos por adapters em memória                                                   | [`share-conversation.test.ts`](../apps/api/src/modules/conversations/application/share-conversation.test.ts) |
| `infra/`       | Adapters Prisma contra o Postgres real; adapters de serviços externos com um dublê do cliente                     | [`gcs-file-storage.test.ts`](../apps/api/src/modules/files/infra/gcs-file-storage.test.ts)                   |
| `http/`        | O app Express montado com use cases reais e adapters em memória, chamado por `supertest`: status, corpo e headers | [`conversations-router.test.ts`](../apps/api/src/modules/conversations/http/conversations-router.test.ts)    |
| `apps/web`     | Stores e funções puras direto; componentes com Testing Library                                                    | [`streaming-reply.test.ts`](../apps/web/src/features/chat/streaming-reply.test.ts)                           |

Arquivos de teste por módulo da API:

| Módulo                | Em memória | Com Postgres |
| --------------------- | ---------- | ------------ |
| `agent`               | 12         | 2            |
| `audit`               | 3          | 1            |
| `auth`                | 7          | 2            |
| `billing`             | 3          | 1            |
| `conversations`       | 10         | 2            |
| `files`               | 14         | 1            |
| `rate-limiting`       | 3          | 1            |
| `tools`               | 8          | 1            |
| `infra`, `http` e app | 5          | —            |

## Dublês

Nenhum teste troca módulos com `vi.mock`. Cada port do domínio tem um adapter em memória, escrito
à mão, que o teste entrega pelo construtor, do mesmo jeito que o
[`composition-root.ts`](../apps/api/src/composition-root.ts) entrega o adapter real. Por isso o
teste exercita o use case inteiro e não depende de como ele chama suas dependências.

`vi.fn` e `vi.spyOn` aparecem só na borda: callbacks e ouvintes, o `fetch` do navegador nos
testes do frontend e o SDK do Google no adapter de login.

| Dublê                                          | Substitui                                   |
| ---------------------------------------------- | ------------------------------------------- |
| `InMemory*` (stores, repositórios, contadores) | Os adapters Prisma e o Cloud Storage        |
| `ScriptedLlmProvider`                          | O Gemini: devolve as respostas roteirizadas |
| `FakeToolbox`, `FakeWebSearch`                 | As tools e a busca na web                   |
| `FakeIdentityProvider`, `FakeSessionTokens`    | O login com Google e o JWT de sessão        |
| `ManualClock`                                  | O relógio: o teste define e avança a hora   |
| `RecordingEventPublisher`                      | O barramento: guarda os eventos publicados  |
| `silentLogger`                                 | O logger                                    |

Os adapters em memória ficam em `infra/` de cada módulo, sem sufixo, porque o e2e e o
desenvolvimento local também os usam (o LLM roteirizado, por exemplo). O que só serve a testes
tem o sufixo `.test-support.ts` e fica fora da cobertura:

- `conversation-test-bed.test-support.ts` e `files-test-bed.test-support.ts`: montam store,
  eventos e relógio para os use cases do módulo, com usuários e datas fixos;
- `fake-authentication.test-support.ts`: autentica a requisição pelo header de teste, para os
  testes de rota;
- `no-rate-limit.test-support.ts`: desliga o rate limit nas rotas que não o testam.

## Testes de integração

Os arquivos `*.integration.test.ts` conferem o que um adapter em memória não prova: SQL,
restrições do banco e concorrência. Exemplos: incrementos simultâneos do rate limit sem perda, só
uma de duas reservas simultâneas da mesma conversa passando e o consumo de créditos somado sem
perder chamadas paralelas.

- Usam um banco próprio, `chat_tess_integration`, separado do banco do e2e, para as duas suítes
  não apagarem os dados uma da outra. `INTEGRATION_DATABASE_URL` troca o endereço.
- O setup global
  ([`prepare-integration-database.ts`](../apps/api/src/test/prepare-integration-database.ts)) cria
  o banco, se não existir, e aplica as migrações.
- Cada teste começa com as tabelas vazias (`resetDatabase`).
- Os arquivos rodam um de cada vez, porque dividem o mesmo banco.

## Cobertura

`npm run test:coverage` gera o relatório em `coverage/` e falha se as regras de negócio
(`domain/` e `application/` de todos os módulos da API) ficarem abaixo de 80% em linhas, funções,
branches e statements. O CI roda esse comando antes de todo deploy.

Ficam fora da conta os próprios testes, os `.test-support.ts`, o código gerado pelo Prisma e os
arquivos `main` e `index`.

## Convenções

- **Nome.** `describe` com o nome da classe ou da rota; `it` com o comportamento esperado, em
  português: `'não compartilha a conversa de outro usuário'`.
- **Estrutura.** Preparar, executar, conferir, separados por linha em branco, sem comentários.
- **Sem estado compartilhado.** Cada teste monta as próprias dependências; nada sobra de um para
  o outro.
- **Tempo e aleatoriedade.** Datas vêm do `ManualClock`; valores aleatórios são conferidos pelo
  formato (`SHARE_TOKEN_PATTERN`), não pelo valor.
- **Efeitos.** Além do retorno, o teste confere os eventos de domínio publicados, que alimentam
  auditoria e billing.
- **Casos de erro.** O teste confere o erro de domínio lançado (`ConversationNotFoundError`, por
  exemplo) e que nada foi gravado. O acesso ao recurso de outro usuário é um caso recorrente.
