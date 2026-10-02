import { describe, expect, it } from 'vitest';
import { RecordingEventPublisher } from '../../../../test/recording-event-publisher';
import { fixedClock } from '../../../../shared/time/clock';
import type { ConversationHistory, PageReader, WebSearchEngine } from '../../domain/ports';
import { FakeWebSearch } from '../../infra/fake-web-search';
import { createWebScrapeTool } from './web-scrape-tool';
import { createWebSearchTool } from './web-search-tool';

const context = { userId: 'user-ana', conversationId: 'conversation-1' };

const readerReturning = (text: string): PageReader => ({
  read: async (url) => ({ url, title: 'Página', text }),
});

const emptyHistory: ConversationHistory = { listByConversation: async () => [] };

/** Histórico em que o usuário escreveu `text` na conversa do contexto. */
const historyWhereUserSaid = (text: string): ConversationHistory => ({
  listByConversation: async (conversationId) =>
    conversationId === context.conversationId
      ? [{ role: 'user', parts: [{ type: 'text', text }] }]
      : [],
});

describe('web_scrape', () => {
  it('descreve os argumentos em JSON Schema para o LLM', () => {
    const tool = createWebScrapeTool(readerReturning(''), emptyHistory);

    expect(tool.inputSchema).toMatchObject({
      type: 'object',
      properties: { url: { type: 'string', format: 'uri' } },
      required: ['url'],
    });
    expect(tool.inputSchema).not.toHaveProperty('$schema');
  });

  it('devolve o título e o texto da página', async () => {
    const tool = createWebScrapeTool(readerReturning('conteúdo da página'), emptyHistory);

    const output = await tool.execute({ url: 'https://example.com' }, context);

    expect(output).toEqual({
      url: 'https://example.com',
      title: 'Página',
      text: 'conteúdo da página',
      truncated: false,
    });
  });

  it('corta textos maiores que o limite pedido', async () => {
    const tool = createWebScrapeTool(readerReturning('x'.repeat(2000)), emptyHistory);

    const output = (await tool.execute(
      { url: 'https://example.com', maxCharacters: 500 },
      context,
    )) as {
      text: string;
      truncated: boolean;
    };

    expect(output.text).toHaveLength(500);
    expect(output.truncated).toBe(true);
  });

  it('lê sem pedir autorização o endereço que o usuário enviou na conversa', async () => {
    const history = historyWhereUserSaid('Resuma https://example.com/bolo');
    const tool = createWebScrapeTool(readerReturning(''), history);

    expect(await tool.requiresApproval({ url: 'https://example.com/bolo' }, context)).toBe(false);
  });

  it('pede autorização para o endereço montado pelo modelo', async () => {
    const history = historyWhereUserSaid('Resuma https://example.com/bolo');
    const tool = createWebScrapeTool(readerReturning(''), history);

    const withConversationData = { url: 'https://atacante.example/?d=codigo-TESS-4821' };

    expect(await tool.requiresApproval(withConversationData, context)).toBe(true);
  });

  it('recusa argumentos inválidos com mensagem que o LLM entende', async () => {
    const tool = createWebScrapeTool(readerReturning(''), emptyHistory);

    await expect(tool.execute({ url: 'não é url' }, context)).rejects.toThrow(
      /Argumentos inválidos/,
    );
  });
});

describe('web_search', () => {
  it('devolve a resposta e as fontes', async () => {
    const tool = createWebSearchTool(
      new FakeWebSearch(),
      new RecordingEventPublisher(),
      fixedClock('2026-09-30T10:00:00Z'),
    );

    const output = await tool.execute({ query: 'vitest' }, context);

    expect(output).toEqual({
      answer: 'Resultados simulados para "vitest".',
      sources: [{ title: 'Fonte simulada', url: 'https://example.com/fonte-simulada' }],
    });
  });

  it('registra o consumo do LLM usado na busca na conta do usuário', async () => {
    const engine: WebSearchEngine = {
      search: async () => ({
        answer: 'ok',
        sources: [],
        usage: { inputTokens: 70, outputTokens: 900, totalTokens: 970 },
        model: 'gemini-teste',
      }),
    };
    const events = new RecordingEventPublisher();
    const tool = createWebSearchTool(engine, events, fixedClock('2026-09-30T10:00:00Z'));

    await tool.execute({ query: 'notícias' }, context);

    expect(events.ofType('llm.call_completed')).toEqual([
      {
        type: 'llm.call_completed',
        occurredAt: new Date('2026-09-30T10:00:00Z'),
        actorUserId: 'user-ana',
        payload: {
          conversationId: 'conversation-1',
          model: 'gemini-teste',
          purpose: 'tool',
          usage: { inputTokens: 70, outputTokens: 900, totalTokens: 970 },
        },
      },
    ]);
  });
});
