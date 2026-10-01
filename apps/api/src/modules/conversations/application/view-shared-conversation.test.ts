import { describe, expect, it } from 'vitest';
import { SharedConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, START, conversationTestBed } from './conversation-test-bed.test-support';
import { ViewSharedConversation } from './view-shared-conversation';

const TOKEN = 'abcdefghijklmnopqrstuvwxyz012345';
const FIRST_PAGE = { limit: 50 };

async function sharedConversationOfAna() {
  const bed = conversationTestBed();
  const conversation = await bed.store.create(ANA_ID, 'Receitas');
  await bed.store.append(conversation.id, {
    role: 'user',
    parts: [{ type: 'text', text: 'Leia esta página' }],
  });
  await bed.store.append(conversation.id, {
    role: 'assistant',
    parts: [{ type: 'tool_call', callId: 'c1', toolName: 'web_scrape', input: {} }],
  });
  await bed.store.append(conversation.id, {
    role: 'tool',
    parts: [
      {
        type: 'tool_result',
        callId: 'c1',
        toolName: 'web_scrape',
        output: 'segredo',
        isError: false,
      },
    ],
  });
  await bed.store.append(conversation.id, {
    role: 'assistant',
    parts: [{ type: 'text', text: 'A página fala de bolo.' }],
  });
  await bed.store.createIfAbsent(conversation.id, TOKEN);
  return {
    ...bed,
    conversation,
    view: new ViewSharedConversation(bed.store, bed.store, bed.events, bed.clock),
  };
}

describe('ViewSharedConversation', () => {
  it('mostra a conversa a outro usuário, sem os resultados de tools', async () => {
    const { view, conversation } = await sharedConversationOfAna();

    const result = await view.execute(TOKEN, BIA_ID, FIRST_PAGE);

    expect(result.conversation).toMatchObject({ id: conversation.id, title: 'Receitas' });
    expect(result.messages.map(({ role }) => role)).toEqual(['user', 'assistant', 'assistant']);
    expect(JSON.stringify(result.messages)).not.toContain('segredo');
  });

  it('pagina sem contar os resultados de tools', async () => {
    const { view } = await sharedConversationOfAna();

    const latest = await view.execute(TOKEN, BIA_ID, { limit: 2 });
    const earlier = await view.execute(TOKEN, BIA_ID, { beforeSequence: 2, limit: 2 });

    expect(latest.messages.map(({ sequence }) => sequence)).toEqual([2, 4]);
    expect(latest.hasEarlierMessages).toBe(true);
    expect(earlier.messages.map(({ sequence }) => sequence)).toEqual([1]);
    expect(earlier.hasEarlierMessages).toBe(false);
  });

  it('registra quem abriu o link', async () => {
    const { view, events, conversation } = await sharedConversationOfAna();

    await view.execute(TOKEN, BIA_ID, FIRST_PAGE);

    expect(events.ofType('conversation.share_viewed')).toEqual([
      {
        type: 'conversation.share_viewed',
        occurredAt: START,
        actorUserId: BIA_ID,
        payload: { conversationId: conversation.id },
      },
    ]);
  });

  it('não registra de novo ao carregar mensagens anteriores', async () => {
    const { view, events } = await sharedConversationOfAna();

    await view.execute(TOKEN, BIA_ID, { limit: 2 });
    await view.execute(TOKEN, BIA_ID, { beforeSequence: 2, limit: 2 });

    expect(events.ofType('conversation.share_viewed')).toHaveLength(1);
  });

  it.each([
    ['token desconhecido', 'z'.repeat(32)],
    ['token em formato inválido', '../conversas'],
  ])('recusa %s', async (_case, token) => {
    const { view } = await sharedConversationOfAna();

    await expect(view.execute(token, BIA_ID, FIRST_PAGE)).rejects.toThrow(
      SharedConversationNotFoundError,
    );
  });

  it('recusa o link revogado', async () => {
    const { view, store, conversation } = await sharedConversationOfAna();
    await store.revoke(conversation.id);

    await expect(view.execute(TOKEN, BIA_ID, FIRST_PAGE)).rejects.toThrow(
      SharedConversationNotFoundError,
    );
  });
});
