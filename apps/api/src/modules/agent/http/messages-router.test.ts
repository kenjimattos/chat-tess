import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../../app';
import { RecordingEventPublisher } from '../../../shared/events/recording-event-publisher';
import { silentLogger } from '../../../shared/logging/logger';
import { ManualClock } from '../../../shared/time/clock';
import {
  TEST_USER_HEADER,
  fakeRequireAuthentication,
} from '../../auth/http/fake-authentication.test-support';
import { InMemoryConversationStore } from '../../conversations/infra/in-memory-conversation-store';
import { CompactConversation } from '../application/compact-conversation';
import { RunAgentTurn } from '../application/run-agent-turn';
import { unlimitedUsage } from '../domain/usage-limiter';
import { FakeToolbox } from '../infra/fake-toolbox';
import { InMemoryActiveTurns } from '../infra/in-memory-active-turns';
import { InMemoryAttachmentCatalog } from '../infra/in-memory-attachment-catalog';
import { InMemoryConversationMemory } from '../infra/in-memory-conversation-memory';
import { ScriptedLlmProvider } from '../infra/scripted-llm-provider';
import { noRateLimit } from '../../rate-limiting/http/no-rate-limit.test-support';
import { createMessagesRouter } from './messages-router';

const ANA = 'user-ana';

/** Separa o corpo SSE em eventos { event, data }. */
function parseEventStream(body: string) {
  return body
    .split('\n\n')
    .filter((block) => block.startsWith('event:'))
    .map((block) => {
      const [eventLine, dataLine] = block.split('\n');
      return {
        event: eventLine?.slice('event: '.length),
        data: JSON.parse(dataLine?.slice('data: '.length) ?? 'null'),
      };
    });
}

describe('POST /api/conversations/:id/messages', () => {
  let app: ReturnType<typeof createApp>;
  let activeTurns: InMemoryActiveTurns;
  let conversationId: string;

  beforeEach(async () => {
    const clock = new ManualClock('2026-09-30T10:00:00Z');
    const store = new InMemoryConversationStore(clock);
    const memory = new InMemoryConversationMemory();
    const events = new RecordingEventPublisher();
    activeTurns = new InMemoryActiveTurns();
    const llm = new ScriptedLlmProvider(() => ({
      text: 'Olá, Ana!',
      usage: { inputTokens: 10, outputTokens: 3 },
    }));
    const runAgentTurn = new RunAgentTurn({
      conversations: store,
      messages: store,
      memory,
      attachments: new InMemoryAttachmentCatalog(),
      toolbox: new FakeToolbox(),
      usageLimiter: unlimitedUsage,
      activeTurns,
      llm,
      compactConversation: new CompactConversation(llm, memory, events, clock, 2),
      events,
      clock,
      settings: {
        contextTokenLimit: 100_000,
        thresholdRatio: 0.8,
        maxToolRounds: 3,
        maxParallelToolCalls: 3,
        maxConcurrentTurnsPerUser: 2,
      },
    });
    const router = createMessagesRouter({
      requireAuthentication: fakeRequireAuthentication,
      rateLimit: noRateLimit,
      runAgentTurn,
    });
    app = createApp({ logger: silentLogger, apiRouters: [router], readinessChecks: {} });
    conversationId = (await store.create(ANA, 'Nova conversa')).id;
  });

  const send = (id: string, body: object) =>
    request(app).post(`/api/conversations/${id}/messages`).set(TEST_USER_HEADER, ANA).send(body);

  it('responde com a resposta do agente em Server-Sent Events', async () => {
    const response = await send(conversationId, { text: 'Oi' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream; charset=utf-8');
    const events = parseEventStream(response.text);
    expect(events.map(({ event }) => event)).toEqual(['text_delta', 'usage', 'done']);
    expect(events[0]).toEqual({
      event: 'text_delta',
      data: { type: 'text_delta', text: 'Olá, Ana!' },
    });
  });

  it('responde em JSON, antes do stream, quando a mensagem é vazia', async () => {
    const response = await send(conversationId, { text: '  ' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('empty_message');
  });

  it('responde em JSON, antes do stream, quando a conversa não existe', async () => {
    const response = await send('00000000-0000-4000-8000-000000000000', { text: 'Oi' });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('conversation_not_found');
  });

  it('responde 409, antes do stream, quando a conversa ainda está respondendo', async () => {
    await activeTurns.tryAcquire({
      userId: ANA,
      conversationId,
      maxPerUser: 2,
      staleBefore: new Date(0),
    });

    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .set(TEST_USER_HEADER, ANA)
      .send({ text: 'Oi de novo' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('turn_in_progress');
  });

  it('recusa corpo com formato inválido', async () => {
    const response = await send(conversationId, { text: 'Oi', attachmentIds: 'não é lista' });

    expect(response.status).toBe(400);
  });

  it('exige autenticação', async () => {
    const response = await request(app)
      .post(`/api/conversations/${conversationId}/messages`)
      .send({ text: 'Oi' });

    expect(response.status).toBe(401);
  });

  describe('POST /api/conversations/:id/messages/last/resend', () => {
    const resend = (body?: object) =>
      request(app)
        .post(`/api/conversations/${conversationId}/messages/last/resend`)
        .set(TEST_USER_HEADER, ANA)
        .send(body);

    it('refaz o último turno e responde em Server-Sent Events', async () => {
      await send(conversationId, { text: 'Oi' });

      const response = await resend();

      expect(response.status).toBe(200);
      expect(parseEventStream(response.text).map(({ event }) => event)).toEqual([
        'text_delta',
        'usage',
        'done',
      ]);
    });

    it('aceita o novo texto da mensagem', async () => {
      await send(conversationId, { text: 'Oi' });

      const response = await resend({ text: 'Olá' });

      expect(response.status).toBe(200);
    });

    it('responde em JSON, antes do stream, quando não há mensagem para reenviar', async () => {
      const response = await resend();

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('no_message_to_resend');
    });
  });
});
