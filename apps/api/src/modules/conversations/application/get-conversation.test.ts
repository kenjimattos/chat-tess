import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, conversationTestBed } from './conversation-test-bed.test-support';
import { GetConversation } from './get-conversation';

const FIRST_PAGE = { limit: 50 };

/** Conversa da Ana com `count` mensagens de texto: "mensagem 1", "mensagem 2"... */
async function conversationWithMessages(count: number) {
  const { store } = conversationTestBed();
  const conversation = await store.create(ANA_ID, 'Longa');
  for (let number = 1; number <= count; number++) {
    await store.append(conversation.id, {
      role: 'user',
      parts: [{ type: 'text', text: `mensagem ${number}` }],
    });
  }
  return { conversation, getConversation: new GetConversation(store, store) };
}

describe('GetConversation', () => {
  it('devolve a conversa com as mensagens em ordem', async () => {
    const { store } = conversationTestBed();
    const conversation = await store.create(ANA_ID, 'Dúvidas');
    await store.append(conversation.id, {
      role: 'user',
      parts: [{ type: 'text', text: 'Pergunta' }],
    });
    await store.append(conversation.id, {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Resposta' }],
    });

    const result = await new GetConversation(store, store).execute(
      conversation.id,
      ANA_ID,
      FIRST_PAGE,
    );

    expect(result.conversation.id).toBe(conversation.id);
    expect(result.messages.map(({ sequence, role }) => [sequence, role])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ]);
    expect(result.hasEarlierMessages).toBe(false);
  });

  it('abre pelas mensagens mais recentes e avisa que há mais antigas', async () => {
    const { conversation, getConversation } = await conversationWithMessages(5);

    const result = await getConversation.execute(conversation.id, ANA_ID, { limit: 2 });

    expect(result.messages.map(({ sequence }) => sequence)).toEqual([4, 5]);
    expect(result.hasEarlierMessages).toBe(true);
  });

  it('devolve as mensagens anteriores a uma sequência, até chegar ao início', async () => {
    const { conversation, getConversation } = await conversationWithMessages(5);

    const middle = await getConversation.execute(conversation.id, ANA_ID, {
      beforeSequence: 4,
      limit: 2,
    });
    const start = await getConversation.execute(conversation.id, ANA_ID, {
      beforeSequence: 2,
      limit: 2,
    });

    expect(middle.messages.map(({ sequence }) => sequence)).toEqual([2, 3]);
    expect(middle.hasEarlierMessages).toBe(true);
    expect(start.messages.map(({ sequence }) => sequence)).toEqual([1]);
    expect(start.hasEarlierMessages).toBe(false);
  });

  it('não revela a conversa de outro usuário', async () => {
    const { store } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Privada');

    const reading = new GetConversation(store, store).execute(
      conversationOfBia.id,
      ANA_ID,
      FIRST_PAGE,
    );

    await expect(reading).rejects.toThrow(ConversationNotFoundError);
  });
});
