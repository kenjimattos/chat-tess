import { randomUUID } from 'node:crypto';
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
import { CreateConversation } from '../application/create-conversation';
import { DeleteConversation } from '../application/delete-conversation';
import { GetConversation } from '../application/get-conversation';
import { GetConversationShare } from '../application/get-conversation-share';
import { ListConversations } from '../application/list-conversations';
import { RenameConversation } from '../application/rename-conversation';
import { RevokeConversationShare } from '../application/revoke-conversation-share';
import { ShareConversation } from '../application/share-conversation';
import { ViewSharedConversation } from '../application/view-shared-conversation';
import { InMemoryConversationStore } from '../infra/in-memory-conversation-store';
import { createConversationsRouter } from './conversations-router';

const ANA = 'user-ana';
const BIA = 'user-bia';

function sequenceOf(message: { sequence: number }): number {
  return message.sequence;
}

describe('rotas de conversa', () => {
  let store: InMemoryConversationStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    const clock = new ManualClock('2026-09-30T10:00:00Z');
    const events = new RecordingEventPublisher();
    store = new InMemoryConversationStore(clock);
    const router = createConversationsRouter({
      requireAuthentication: fakeRequireAuthentication,
      createConversation: new CreateConversation(store, events, clock),
      listConversations: new ListConversations(store),
      getConversation: new GetConversation(store, store),
      renameConversation: new RenameConversation(store, events, clock),
      deleteConversation: new DeleteConversation(store, events, clock),
      shareConversation: new ShareConversation(store, store, events, clock),
      getConversationShare: new GetConversationShare(store, store),
      revokeConversationShare: new RevokeConversationShare(store, store, events, clock),
      viewSharedConversation: new ViewSharedConversation(store, store, events, clock),
    });
    app = createApp({ logger: silentLogger, apiRouters: [router], readinessChecks: {} });
  });

  const as = (userId: string) => ({ [TEST_USER_HEADER]: userId });

  it('exige autenticação', async () => {
    const response = await request(app).get('/api/conversations');

    expect(response.status).toBe(401);
  });

  it('cria e lista as conversas do usuário', async () => {
    const created = await request(app).post('/api/conversations').set(as(ANA)).send({});
    await request(app).post('/api/conversations').set(as(BIA)).send({ title: 'Da Bia' });

    const listed = await request(app).get('/api/conversations').set(as(ANA));

    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      title: 'Nova conversa',
      createdAt: '2026-09-30T10:00:00.000Z',
      updatedAt: '2026-09-30T10:00:00.000Z',
    });
    expect(listed.body).toEqual([created.body]);
  });

  it('abre a conversa com o histórico', async () => {
    const conversation = await store.create(ANA, 'Dúvidas');
    await store.append(conversation.id, { role: 'user', parts: [{ type: 'text', text: 'Oi' }] });

    const response = await request(app).get(`/api/conversations/${conversation.id}`).set(as(ANA));

    expect(response.status).toBe(200);
    expect(response.body.conversation.title).toBe('Dúvidas');
    expect(response.body.messages).toEqual([
      {
        id: expect.any(String),
        sequence: 1,
        role: 'user',
        parts: [{ type: 'text', text: 'Oi' }],
        createdAt: '2026-09-30T10:00:00.000Z',
      },
    ]);
    expect(response.body.hasEarlierMessages).toBe(false);
  });

  it('pagina o histórico, das mensagens mais recentes para as mais antigas', async () => {
    const conversation = await store.create(ANA, 'Longa');
    for (const text of ['um', 'dois', 'três']) {
      await store.append(conversation.id, { role: 'user', parts: [{ type: 'text', text }] });
    }
    const url = `/api/conversations/${conversation.id}`;

    const latest = await request(app).get(url).query({ limit: 2 }).set(as(ANA));
    const earlier = await request(app).get(url).query({ limit: 2, before: 2 }).set(as(ANA));

    expect(latest.body.messages.map(sequenceOf)).toEqual([2, 3]);
    expect(latest.body.hasEarlierMessages).toBe(true);
    expect(earlier.body.messages.map(sequenceOf)).toEqual([1]);
    expect(earlier.body.hasEarlierMessages).toBe(false);
  });

  it('recusa uma página maior que o permitido', async () => {
    const conversation = await store.create(ANA, 'Dúvidas');

    const response = await request(app)
      .get(`/api/conversations/${conversation.id}`)
      .query({ limit: 101 })
      .set(as(ANA));

    expect(response.status).toBe(400);
  });

  it('responde 404 para a conversa de outro usuário', async () => {
    const conversationOfBia = await store.create(BIA, 'Privada');

    const response = await request(app)
      .get(`/api/conversations/${conversationOfBia.id}`)
      .set(as(ANA));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('conversation_not_found');
  });

  it.each(['nao-e-uuid', randomUUID()])('responde 404 para o id "%s"', async (conversationId) => {
    const response = await request(app).get(`/api/conversations/${conversationId}`).set(as(ANA));

    expect(response.status).toBe(404);
  });

  it('renomeia a conversa', async () => {
    const conversation = await store.create(ANA, 'Nova conversa');

    const response = await request(app)
      .patch(`/api/conversations/${conversation.id}`)
      .set(as(ANA))
      .send({ title: 'Planejamento' });

    expect(response.status).toBe(200);
    expect(response.body.title).toBe('Planejamento');
  });

  it('recusa renomear sem título', async () => {
    const conversation = await store.create(ANA, 'Nova conversa');

    const response = await request(app)
      .patch(`/api/conversations/${conversation.id}`)
      .set(as(ANA))
      .send({});

    expect(response.status).toBe(400);
  });

  it('apaga a conversa', async () => {
    const conversation = await store.create(ANA, 'Temporária');

    const deleted = await request(app).delete(`/api/conversations/${conversation.id}`).set(as(ANA));
    const reopened = await request(app).get(`/api/conversations/${conversation.id}`).set(as(ANA));

    expect(deleted.status).toBe(204);
    expect(reopened.status).toBe(404);
  });

  describe('compartilhamento', () => {
    async function sharedConversation() {
      const conversation = await store.create(ANA, 'Receitas');
      await store.append(conversation.id, { role: 'user', parts: [{ type: 'text', text: 'Oi' }] });
      const shared = await request(app)
        .put(`/api/conversations/${conversation.id}/share`)
        .set(as(ANA));
      return { conversation, token: shared.body.token as string, shared };
    }

    it('gera o link e o dono consulta o estado dele', async () => {
      const { conversation, shared } = await sharedConversation();

      const state = await request(app)
        .get(`/api/conversations/${conversation.id}/share`)
        .set(as(ANA));

      expect(shared.status).toBe(200);
      expect(shared.body).toEqual({ token: expect.any(String), createdAt: expect.any(String) });
      expect(state.body).toEqual({ share: shared.body });
    });

    it('informa quando a conversa não foi compartilhada', async () => {
      const conversation = await store.create(ANA, 'Só minha');

      const state = await request(app)
        .get(`/api/conversations/${conversation.id}/share`)
        .set(as(ANA));

      expect(state.body).toEqual({ share: null });
    });

    it('outro usuário logado abre a conversa pelo link', async () => {
      const { token } = await sharedConversation();

      const response = await request(app).get(`/api/shared/${token}`).set(as(BIA));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        title: 'Receitas',
        messages: [
          expect.objectContaining({ role: 'user', parts: [{ type: 'text', text: 'Oi' }] }),
        ],
        hasEarlierMessages: false,
      });
    });

    it('exige login para abrir o link', async () => {
      const { token } = await sharedConversation();

      const response = await request(app).get(`/api/shared/${token}`);

      expect(response.status).toBe(401);
    });

    it('o link revogado deixa de funcionar', async () => {
      const { conversation, token } = await sharedConversation();

      const revoked = await request(app)
        .delete(`/api/conversations/${conversation.id}/share`)
        .set(as(ANA));
      const response = await request(app).get(`/api/shared/${token}`).set(as(BIA));

      expect(revoked.status).toBe(204);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('shared_conversation_not_found');
    });

    it('só o dono gera o link', async () => {
      const conversation = await store.create(ANA, 'Receitas');

      const response = await request(app)
        .put(`/api/conversations/${conversation.id}/share`)
        .set(as(BIA));

      expect(response.status).toBe(404);
    });
  });
});
