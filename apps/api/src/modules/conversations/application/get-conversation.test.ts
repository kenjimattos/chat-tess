import { describe, expect, it } from 'vitest';
import { ConversationNotFoundError } from '../domain/conversation-errors';
import { ANA_ID, BIA_ID, conversationTestBed } from './conversation-test-bed.test-support';
import { GetConversation } from './get-conversation';

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

    const result = await new GetConversation(store, store).execute(conversation.id, ANA_ID);

    expect(result.conversation.id).toBe(conversation.id);
    expect(result.messages.map(({ sequence, role }) => [sequence, role])).toEqual([
      [1, 'user'],
      [2, 'assistant'],
    ]);
  });

  it('não revela a conversa de outro usuário', async () => {
    const { store } = conversationTestBed();
    const conversationOfBia = await store.create(BIA_ID, 'Privada');

    const reading = new GetConversation(store, store).execute(conversationOfBia.id, ANA_ID);

    await expect(reading).rejects.toThrow(ConversationNotFoundError);
  });
});
